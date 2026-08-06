#!/bin/bash
# 빅카인즈 기반 타임라인 Lambda + API Gateway 라우트 최초 1회 프로비저닝.
#
# 왜 필요한가:
#   handlers/timeline_handler.py 는 레포에 있지만 Lambda 함수와 API Gateway 라우트가
#   없어서 `POST /api/timeline` 이 404 다. 그러면 프론트(NewsTimeMachine.tsx)가
#   구 `/api/search` 로 폴백해 "에디터별 보기"·"그날의 이슈"가 안 나온다.
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
#   빅카인즈 키까지 함께 넣으려면 (권장 — 안 넣으면 폴백만 동작):
#   BIGKINDS_API_KEY='발급받은-키' ./setup-timeline-lambda.sh
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
# (실측: personas 1~5초, issues 3~6초 — 빅카인즈 왕복 2회 포함)
TIMEOUT=30
MEMORY=1024
# 기존 v1 Lambda 들과 같은 실행 역할. DynamoDB 폴백 + S3 본문 조회 권한이 이미 있고,
# 빅카인즈 호출은 아웃바운드 HTTPS 라 추가 IAM 권한이 필요 없다.
ROLE_ARN="arn:aws:iam::887078546492:role/sedaily-mbti-lambda-execution-dev"
# 프론트는 POST 만 쓴다 (NewsTimeMachine.tsx 의 fetchDayArticles / fetchIssues 둘 다 POST).
# GET 은 로컬 main.py 의 curl 편의용이라 운영에 열지 않는다.
ROUTE_KEY="POST /api/timeline"

echo "=== 타임라인 Lambda + 라우트 프로비저닝 ==="
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
    --description "빅카인즈 기반 타임라인 — 에디터별 큐레이션 / 그날의 이슈 / 그 무렵의 지표" \
    --output text --query 'FunctionArn'
  echo "     활성화 대기"
  aws lambda wait function-active --function-name "$FUNCTION_NAME" --region "$REGION"
fi

LAMBDA_ARN=$(aws lambda get-function-configuration \
  --function-name "$FUNCTION_NAME" --region "$REGION" \
  --query 'FunctionArn' --output text)
echo "     ARN: $LAMBDA_ARN"

# ── 2. 빅카인즈 키 (선택) ───────────────────────────────────────────────────
# ⚠️ 환경변수 딕셔너리는 통째로 교체되므로 기존 값을 먼저 읽어 병합한다.
if [ -n "${BIGKINDS_API_KEY:-}" ]; then
  echo "  -> BIGKINDS_API_KEY 주입 (기존 env 병합)"
  MERGED=$(aws lambda get-function-configuration \
    --function-name "$FUNCTION_NAME" --region "$REGION" \
    --query 'Environment.Variables' --output json 2>/dev/null \
    | BK="$BIGKINDS_API_KEY" python3 -c '
import json, os, sys
cur = sys.stdin.read().strip()
env = json.loads(cur) if cur and cur != "null" else {}
env["BIGKINDS_API_KEY"] = os.environ["BK"]
print(json.dumps({"Variables": env}))
')
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" --region "$REGION" \
    --environment "$MERGED" \
    --output text --query 'LastModified' >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"
  echo "     주입 완료 (값은 출력하지 않음)"
else
  echo "  -> BIGKINDS_API_KEY 미지정 — 건너뜀"
  echo "     이 상태로도 404 는 사라지지만 응답 source 는 'dynamodb' 폴백이다."
  echo "     나중에 넣으려면 이 스크립트를 키와 함께 다시 실행하면 된다."
fi

# ── 3. API Gateway 통합 + 라우트 ────────────────────────────────────────────
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

# ── 4. 검증 ─────────────────────────────────────────────────────────────────
echo ""
echo "=== 검증 ==="
BASE="https://${API_ID}.execute-api.${REGION}.amazonaws.com/dev"
sleep 3
CODE=$(curl -s -o /tmp/timeline_check.json -w '%{http_code}' --max-time 40 \
  -X POST "$BASE/api/timeline" -H 'Content-Type: application/json' \
  -d '{"date":"2026-08-05","mode":"personas","per_persona":3,"page_size":10}' || echo "000")
echo "  POST /api/timeline -> HTTP $CODE"
if [ "$CODE" = "200" ]; then
  python3 - <<'PY'
import json
d = json.load(open('/tmp/timeline_check.json'))
print(f"  source     : {d.get('source')}")
print(f"  total_hits : {d.get('total_hits')}")
print(f"  articles   : {len(d.get('articles') or [])}")
p = d.get('personas')
print(f"  personas   : {'있음' if p else '없음'}")
if d.get('fallback_reason'):
    print(f"  fallback   : {d['fallback_reason'][:100]}")
print()
if d.get('source') == 'bigkinds':
    print("  => 빅카인즈 정상 연결. 완료.")
else:
    print("  => 폴백(dynamodb) 동작 중. 404 는 해결됐고, 빅카인즈 키를 넣으면 전환된다.")
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
