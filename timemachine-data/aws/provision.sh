#!/usr/bin/env bash
# 타임머신 신문 1면 이미지 일일 수집의 AWS 구성(2026-11-03): Lambda + EventBridge 매시간.
# e-Paper 최신호 1면을 받아 S3 버킷(TIMEMACHINE_NEWSPAPER_BUCKET)의 timemachine-newspaper/img/YYYY/MM/YYYYMMDD.jpg 에 저장하고,
# 그날 1면 기사 제목·영역은 timemachine-newspaper/epaper/YYYY/MM/YYYYMMDD.json 에 저장한다.
#
# 이미 있는 리소스는 건너뛰므로 다시 실행해도 안전하다(역할 권한 정책은 매번 덮어써서 최신으로 맞춘다).
# 코드만 바꿀 때는 deploy.sh. 권한과 코드가 함께 바뀌었으면 provision.sh → deploy.sh 순서로 실행한다.
# 비용태깅_규칙: 리소스를 만들기 전에 태그를 붙이고, 끝에서 다시 조회해 Service=lens 를 확인한다.
# 사용: AWS 자격 증명이 있는 기기에서 저장소 어디서든 bash timemachine-data/aws/provision.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${ROOT}/config/resources.env"

REGION="${AWS_REGION}"
BUCKET="${TIMEMACHINE_NEWSPAPER_BUCKET}"
FUNCTION="${TIMEMACHINE_CAPTURE_FUNCTION}"
ROLE="${FUNCTION}-role"
RULE="${FUNCTION}-hourly"
LOG_GROUP="/aws/lambda/${FUNCTION}"
# KST 13:10, 14:10, 15:10. 이미 당일 이미지와 기사 기록이 있으면 외부 요청 전에 건너뛴다.
SCHEDULE="cron(10 4-6 * * ? *)"

# 태그 값은 한 곳(여기)에서만 정한다. 형식이 CLI마다 달라 변수를 나눴을 뿐 값은 같다.
SERVICE_TAG="lens"
TAGS_EQ="Project=Sedaily-LENS,CostCenter=sedaily-ai,ServiceName=Sedaily-LENS,Environment=prod,Service=${SERVICE_TAG},Workload=timemachine-newspaper-capture"   # lambda·logs
TAGS_KV="Key=Project,Value=Sedaily-LENS Key=CostCenter,Value=sedaily-ai Key=ServiceName,Value=Sedaily-LENS Key=Environment,Value=prod Key=Service,Value=${SERVICE_TAG} Key=Workload,Value=timemachine-newspaper-capture"   # iam·events

echo "=== 0/7 계정과 버킷 확인 ==="
ACCOUNT="$(aws sts get-caller-identity --query Account --output text --region "${REGION}")"
if [ "${ACCOUNT}" != "${AWS_ACCOUNT_ID}" ]; then
  echo "계정이 달라요. 멈춥니다."
  exit 1
fi
echo "계정 맞음"
aws s3api head-bucket --bucket "${BUCKET}" --region "${REGION}"
echo "버킷 있음: ${BUCKET}"

echo "=== 1/7 CloudWatch 로그 그룹 (30일 보관) ==="
FOUND="$(aws logs describe-log-groups --log-group-name-prefix "${LOG_GROUP}" --region "${REGION}" --query "length(logGroups[?logGroupName=='${LOG_GROUP}'])" --output text)"
if [ "${FOUND}" = "0" ]; then
  aws logs create-log-group --log-group-name "${LOG_GROUP}" --region "${REGION}" --tags "${TAGS_EQ}"
else
  echo "이미 있음"
fi
aws logs put-retention-policy --log-group-name "${LOG_GROUP}" --retention-in-days 30 --region "${REGION}"

echo "=== 2/7 IAM 역할 (Lambda 실행용, 권한은 로그 쓰기 + 이 버킷 img/·epaper/ 목록·저장만) ==="
TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
ROLE_NEW=0
if aws iam get-role --role-name "${ROLE}" >/dev/null 2>&1; then
  echo "이미 있음"
else
  # shellcheck disable=SC2086
  aws iam create-role --role-name "${ROLE}" --assume-role-policy-document "${TRUST}" \
    --description "Timemachine newspaper front page capture Lambda" --tags ${TAGS_KV} >/dev/null
  ROLE_NEW=1
fi
POLICY="$(cat <<JSON
{"Version":"2012-10-17","Statement":[
{"Sid":"WriteLogs","Effect":"Allow","Action":["logs:CreateLogStream","logs:PutLogEvents"],"Resource":"arn:aws:logs:${REGION}:${ACCOUNT}:log-group:${LOG_GROUP}:*"},
{"Sid":"ListCapturePrefixes","Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::${BUCKET}","Condition":{"StringLike":{"s3:prefix":["timemachine-newspaper/img/*","timemachine-newspaper/epaper/*"]}}},
{"Sid":"PutCaptures","Effect":"Allow","Action":"s3:PutObject","Resource":["arn:aws:s3:::${BUCKET}/timemachine-newspaper/img/*","arn:aws:s3:::${BUCKET}/timemachine-newspaper/epaper/*"]}
]}
JSON
)"
aws iam put-role-policy --role-name "${ROLE}" --policy-name CaptureAccess --policy-document "${POLICY}"
if [ "${ROLE_NEW}" = "1" ]; then
  echo "역할 권한이 퍼질 때까지 10초 기다립니다"
  sleep 10
fi

echo "=== 3/7 코드 묶음 만들기 ==="
WORK="$(mktemp -d)"
ZIP="${WORK}/capture.zip"
(cd "${ROOT}/timemachine-data/collect" && zip -q -j "${ZIP}" fetch_epaper_front.py lambda_handler.py)
ls -l "${ZIP}"

echo "=== 4/7 Lambda 함수 (파이썬 3.12, 제한 120초, 256MB) ==="
# 120초: 받기 한 번이 30초 제한에 최대 3번 다시 시도하므로 60초로는 모자랄 수 있다.
if aws lambda get-function --function-name "${FUNCTION}" --region "${REGION}" >/dev/null 2>&1; then
  echo "이미 있음 - 코드는 deploy.sh 로 올려요"
else
  aws lambda create-function --function-name "${FUNCTION}" --runtime python3.12 --handler lambda_handler.handler \
    --role "arn:aws:iam::${ACCOUNT}:role/${ROLE}" --zip-file "fileb://${ZIP}" --timeout 120 --memory-size 256 \
    --environment "Variables={NEWSPAPER_BUCKET=${BUCKET}}" \
    --description "AI LENS timemachine newspaper front page capture from e-Paper" \
    --tags "${TAGS_EQ}" --region "${REGION}" --query FunctionArn --output text
  aws lambda wait function-active-v2 --function-name "${FUNCTION}" --region "${REGION}"
fi
FN_ARN="$(aws lambda get-function --function-name "${FUNCTION}" --region "${REGION}" --query Configuration.FunctionArn --output text)"

echo "=== 5/7 EventBridge 규칙 (${SCHEDULE}) ==="
# shellcheck disable=SC2086
RULE_ARN="$(aws events put-rule --name "${RULE}" --schedule-expression "${SCHEDULE}" --state ENABLED \
  --description "Hourly timemachine newspaper front page capture" --tags ${TAGS_KV} \
  --region "${REGION}" --query RuleArn --output text)"
if aws lambda get-policy --function-name "${FUNCTION}" --region "${REGION}" 2>/dev/null | grep -q "EventBridgeHourly"; then
  echo "호출 권한이 이미 있음"
else
  aws lambda add-permission --function-name "${FUNCTION}" --statement-id EventBridgeHourly \
    --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "${RULE_ARN}" --region "${REGION}" >/dev/null
fi
aws events put-targets --rule "${RULE}" --targets "Id=CaptureLambda,Arn=${FN_ARN}" --region "${REGION}" \
  --query FailedEntryCount --output text

echo "=== 6/7 태그를 다시 조회해 확인 (붙였다고 가정하지 않는다) ==="
FAIL=0
check_service_tag() {
  local label="$1" value="$2"
  if [ "${value}" = "${SERVICE_TAG}" ]; then
    echo "  ${label}: Service=${value}"
  else
    echo "  ${label}: Service=${value} (기대: ${SERVICE_TAG})"
    FAIL=1
  fi
}
check_service_tag "Lambda" "$(aws lambda list-tags --resource "${FN_ARN}" --region "${REGION}" --query 'Tags.Service' --output text)"
check_service_tag "IAM 역할" "$(aws iam list-role-tags --role-name "${ROLE}" --query "Tags[?Key=='Service'].Value | [0]" --output text)"
check_service_tag "EventBridge 규칙" "$(aws events list-tags-for-resource --resource-arn "${RULE_ARN}" --region "${REGION}" --query "Tags[?Key=='Service'].Value | [0]" --output text)"
check_service_tag "로그 그룹" "$(aws logs list-tags-for-resource --resource-arn "arn:aws:logs:${REGION}:${ACCOUNT}:log-group:${LOG_GROUP}" --region "${REGION}" --query 'tags.Service' --output text)"

echo "=== 7/7 결과 ==="
aws lambda get-function-configuration --function-name "${FUNCTION}" --region "${REGION}" \
  --query '{State:State,LastUpdateStatus:LastUpdateStatus,Runtime:Runtime,Timeout:Timeout,Memory:MemorySize,CodeSha256:CodeSha256}' --output table
aws events describe-rule --name "${RULE}" --region "${REGION}" --query '{State:State,Schedule:ScheduleExpression}' --output table
if [ "${FAIL}" != "0" ]; then
  echo "태그가 기대와 달라요. 확인이 필요해요."
  exit 1
fi
echo "완료. 지금 한 번 실행해 보려면:"
echo "  aws lambda invoke --function-name ${FUNCTION} --region ${REGION} --cli-binary-format raw-in-base64-out --payload '{}' out.json && cat out.json"
