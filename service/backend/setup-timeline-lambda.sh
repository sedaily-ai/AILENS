#!/bin/bash
# S3 XML(서울경제 원본 피드) 기반 타임라인 Lambda + API Gateway 라우트 최초 1회 프로비저닝.
#
# 왜 필요한가:
#   handlers/timeline_handler.py 는 레포에 있지만 Lambda 함수와 API Gateway 라우트가
#   없으면 `POST /api/timeline` 이 404 다. 프론트(타임머신 화면)는 이 라우트로
#   그 날짜의 지면(mode=flat)을 받는다.
#
# 동작 방식(2026-08-13 이후):
#   s3://sedaily-news-xml-storage/daily-xml/{YYYYMMDD}.xml 을 읽어 필터·정렬·페이지해 돌려준다
#   (services/timeline_service.py). 빅카인즈·DynamoDB 폴백·BIGKINDS_API_KEY 는 쓰지 않는다
#   — 별도 환경변수 주입이 필요 없다. 허용 mode 는 'flat' 하나.
#
# 왜 deploy.sh 가 아니라 별도 스크립트인가:
#   deploy.sh 는 `update-function-code` 만 한다(이미 있는 함수의 코드 갱신).
#   함수 **생성**은 레포 규칙상 자동화 대상이 아니라 사람이 검토 후 1회 실행한다.
#   `setup-briefing-lambda.sh` 와 같은 성격의 스크립트다.
#
# 전제:
#   1. AWS CLI 인증됨 (887078546492 계정)
#   2. `./deploy.sh api` 를 먼저 돌려 lambda_package.zip 이 S3 에 올라가 있어야 한다
#      (그 실행에서 timeline 함수는 아직 없으므로 [SKIP] 으로 지나간다 — 정상)
#
# 사용:
#   chmod +x setup-timeline-lambda.sh
#   ./setup-timeline-lambda.sh
#
# 되돌리기:
#   aws apigatewayv2 delete-route      --api-id chzwwtjtgk --route-id <ID> --region us-east-1
#   aws apigatewayv2 delete-integration --api-id chzwwtjtgk --integration-id <ID> --region us-east-1
#   aws lambda delete-function --function-name sedaily-mbti-timeline-dev --region us-east-1

set -euo pipefail

FUNCTION_NAME="sedaily-mbti-timeline-dev"
REGION="us-east-1"
API_ID="chzwwtjtgk"
S3_BUCKET="sedaily-mbti-lambda-packages-dev"
S3_KEY="lambda_package.zip"
HANDLER="handlers.timeline_handler.lambda_handler"
RUNTIME="python3.11"
# API Gateway HTTP API 의 통합 타임아웃 상한이 30초라 Lambda 도 30초로 맞춘다.
# (S3 XML 한 파일 조회라 보통 1~2초 안에 끝난다.)
TIMEOUT=30
MEMORY=1024
# 기존 v1 Lambda 들과 같은 실행 역할. S3 XML 버킷 조회 권한이 이미 있다.
ROLE_ARN="arn:aws:iam::887078546492:role/sedaily-mbti-lambda-execution-dev"
# 프론트는 POST 만 쓴다.
# GET 은 로컬 main.py 의 curl 편의용이라 운영에 열지 않는다.
ROUTE_KEY="POST /api/timeline"

echo "=== 타임라인 Lambda + 라우트 프로비저닝 (S3 XML 기반) ==="
echo "  함수    : $FUNCTION_NAME"
echo "  라우트  : $ROUTE_KEY  (API $API_ID)"
echo ""

# ── 0. 전제 확인 ────────────────────────────────────────────────────────────
echo "  -> S3 패키지 확인"
if ! aws s3api head-object --bucket "$S3_BUCKET" --key "$S3_KEY" --region "$REGION" >/dev/null 2>&1; then
  echo "     [중단] s3://$S3_BUCKET/$S3_KEY 가 없다. 먼저 ./deploy.sh api 를 실행할 것."
  exit 1
fi
echo "     OK"

# ── 1. Lambda 생성 (있으면 건너뜀) ──────────────────────────────────────────
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  echo "  -> Lambda 이미 있음 — 생성 건너뜀 (코드 갱신은 ./deploy.sh api)"
else
  echo "  -> Lambda 생성"
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" \
    --role "$ROLE_ARN" \
    --handler "$HANDLER" \
    --code S3Bucket="$S3_BUCKET",S3Key="$S3_KEY" \
    --timeout "$TIMEOUT" \
    --memory-size "$MEMORY" \
    --architectures x86_64 \
    --region "$REGION" \
    --description "S3 XML 기반 뉴스 타임머신 — 그 날짜의 서울경제 지면(mode=flat)" \
    --output text --query 'FunctionArn'
  echo "     활성화 대기"
  aws lambda wait function-active --function-name "$FUNCTION_NAME" --region "$REGION"
fi

LAMBDA_ARN=$(aws lambda get-function-configuration \
  --function-name "$FUNCTION_NAME" --region "$REGION" \
  --query 'FunctionArn' --output text)
echo "     ARN: $LAMBDA_ARN"

# ── 2. API Gateway 통합 + 라우트 ────────────────────────────────────────────
EXISTING_ROUTE=$(aws apigatewayv2 get-routes --api-id "$API_ID" --region "$REGION" \
  --query "Items[?RouteKey=='$ROUTE_KEY'].RouteId" --output text)

if [ -n "$EXISTING_ROUTE" ] && [ "$EXISTING_ROUTE" != "None" ]; then
  echo "  -> 라우트 이미 있음 ($EXISTING_ROUTE) — 생성 건너뜀"
else
  echo "  -> Lambda invoke 권한 부여 (apigateway)"
  ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
  aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id "apigateway-timeline-invoke" \
    --action "lambda:InvokeFunction" \
    --principal "apigateway.amazonaws.com" \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT}:${API_ID}/*/*/api/timeline" \
    --region "$REGION" >/dev/null 2>&1 || echo "     (권한이 이미 있을 수 있음 — 계속)"

  echo "  -> 통합 생성 (AWS_PROXY, payload 2.0)"
  INTEGRATION_ID=$(aws apigatewayv2 create-integration \
    --api-id "$API_ID" --region "$REGION" \
    --integration-type AWS_PROXY \
    --integration-method POST \
    --integration-uri "$LAMBDA_ARN" \
    --payload-format-version "2.0" \
    --output text --query 'IntegrationId')
  echo "     IntegrationId: $INTEGRATION_ID"

  echo "  -> 라우트 생성: $ROUTE_KEY"
  aws apigatewayv2 create-route \
    --api-id "$API_ID" --region "$REGION" \
    --route-key "$ROUTE_KEY" \
    --target "integrations/${INTEGRATION_ID}" \
    --output text --query 'RouteId'
fi

# ── 3. 검증 ─────────────────────────────────────────────────────────────────
echo ""
echo "=== 검증 ==="
BASE="https://${API_ID}.execute-api.${REGION}.amazonaws.com/dev"
sleep 3
CODE=$(curl -s -o /tmp/timeline_check.json -w '%{http_code}' --max-time 40 \
  -X POST "$BASE/api/timeline" -H 'Content-Type: application/json' \
  -d '{"date":"2026-08-05","mode":"flat","page_size":10}' || echo "000")
echo "  POST /api/timeline -> HTTP $CODE"
if [ "$CODE" = "200" ]; then
  python3 - <<'PY'
import json
d = json.load(open('/tmp/timeline_check.json'))
print(f"  source     : {d.get('source')}")
print(f"  total_hits : {d.get('total_hits')}")
print(f"  articles   : {len(d.get('articles') or [])}")
if d.get('source') == 's3_xml':
    print("  => S3 XML 정상 연결. 완료.")
else:
    print("  => 예상과 다른 source — 응답을 확인할 것.")
PY
else
  echo "  [확인 필요] 응답 본문:"
  head -c 300 /tmp/timeline_check.json; echo
fi
rm -f /tmp/timeline_check.json

echo ""
echo "=== 완료 ==="
echo "이후 코드 갱신은 ./deploy.sh api 로 자동 반영된다 (deploy.sh 의 API_FUNCTIONS 에 등록돼 있음)."
echo "로그: aws logs tail /aws/lambda/${FUNCTION_NAME} --follow --region ${REGION}"
