#!/usr/bin/env bash
# 타임머신 신문 네이버 1면 목록 일일 수집·누락 목록·알림의 AWS 구성(2026-11-03).
#   Lambda(daily) + EventBridge 매시간 + SNS 알림 토픽 + CloudWatch 알람 3개.
# 이미지 수집 구성(provision.sh)은 건드리지 않는다. 이미 있는 리소스는 새로 만들지 않지만, 다시 실행하면 아래는 매번 덮어써 최신으로 맞춘다.
#   SNS 토픽 태그 / 로그 그룹 보관 기간(30일) / IAM 역할 권한(DailyAccess) / EventBridge 규칙(스케줄, 사용 상태 ENABLED) / 알람 설정(알람 상태는 그대로, 태그는 처음 만들 때만 붙는다).
#   Lambda 함수의 코드와 환경 변수는 건드리지 않는다. 바꾸기 전에 무엇이 있는지만 보려면 CHECK_ONLY=1 로 사전 확인만 한다.
#
# 네이버 요청은 NAVER_DAILY=on 일 때만 한다. 이 스크립트는 기본값으로 '꺼진' 채 만든다. 켜는 것은 아래 "켜기" 안내를 따른다.
# 비용태깅_규칙: 리소스는 만들 때 태그를 함께 붙이고, 끝에서 다시 조회해 Service=lens 를 확인한다.
#
# 사용: AWS 자격 증명이 있는 기기에서 저장소 어디서든
#   bash timemachine-data/aws/provision_daily.sh                         # 알림 토픽만 만들고 이메일 구독은 만들지 않는다
#   ALERT_EMAIL=name@example.com bash timemachine-data/aws/provision_daily.sh   # 이메일 구독도 만든다(받는 사람이 확인 메일의 링크를 눌러야 켜진다)
#   CHECK_ONLY=1 bash timemachine-data/aws/provision_daily.sh            # 사전 확인만: 있는 리소스와 덮어쓸 항목을 보여 주고 아무것도 바꾸지 않은 채 멈춘다
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${ROOT}/config/resources.env"

REGION="${AWS_REGION}"
BUCKET="${TIMEMACHINE_NEWSPAPER_BUCKET}"
FUNCTION="${TIMEMACHINE_DAILY_FUNCTION}"
CAPTURE_FUNCTION="${TIMEMACHINE_CAPTURE_FUNCTION}"
FRONT_FUNCTION="${TIMEMACHINE_FRONT_FUNCTION}"
CACHE_TABLE="${TIMEMACHINE_CACHE_TABLE}"
TOPIC="${TIMEMACHINE_ALERT_TOPIC}"
ROLE="${FUNCTION}-role"
RULE="${FUNCTION}-hourly"
LOG_GROUP="/aws/lambda/${FUNCTION}"
NAMESPACE="Sedaily/LENS/TimemachineNewspaper"
# 매시간 25분. 이미지 수집(매시간 10분)과 겹치지 않게 어긋나 있다.
SCHEDULE="cron(25 * * * ? *)"
ALERT_EMAIL="${ALERT_EMAIL:-}"
CHECK_ONLY="${CHECK_ONLY:-}"

# 태그 값은 한 곳(여기)에서만 정한다. 형식이 CLI마다 달라 변수를 나눴을 뿐 값은 같다.
SERVICE_TAG="lens"
TAGS_EQ="Project=Sedaily-LENS,CostCenter=sedaily-ai,ServiceName=Sedaily-LENS,Environment=prod,Service=${SERVICE_TAG},Workload=timemachine-newspaper-daily"   # lambda·logs
TAGS_KV="Key=Project,Value=Sedaily-LENS Key=CostCenter,Value=sedaily-ai Key=ServiceName,Value=Sedaily-LENS Key=Environment,Value=prod Key=Service,Value=${SERVICE_TAG} Key=Workload,Value=timemachine-newspaper-daily"   # iam·events·sns·cloudwatch

echo "=== 0/9 계정과 버킷 확인 ==="
ACCOUNT="$(aws sts get-caller-identity --query Account --output text --region "${REGION}")"
if [ "${ACCOUNT}" != "${AWS_ACCOUNT_ID}" ]; then
  echo "계정이 달라요. 멈춥니다."
  exit 1
fi
echo "계정 맞음"
aws s3api head-bucket --bucket "${BUCKET}" --region "${REGION}"
echo "버킷 있음: ${BUCKET}"
aws lambda get-function --function-name "${CAPTURE_FUNCTION}" --region "${REGION}" >/dev/null
echo "이미지 수집 함수 있음: ${CAPTURE_FUNCTION}"

echo "--- 사전 확인: 이미 있는 리소스 (있으면 아래 단계가 어떻게 하는지 함께 적는다) ---"
# 여기서는 조회만 한다. TOPIC_EXISTS 는 1단계가 만들지 태그만 맞출지 정하는 데 쓴다.
TOPIC_ARN="arn:aws:sns:${REGION}:${ACCOUNT}:${TOPIC}"
TOPIC_EXISTS=0
aws sns get-topic-attributes --topic-arn "${TOPIC_ARN}" --region "${REGION}" >/dev/null 2>&1 && TOPIC_EXISTS=1
LOG_COUNT="$(aws logs describe-log-groups --log-group-name-prefix "${LOG_GROUP}" --region "${REGION}" --query "length(logGroups[?logGroupName=='${LOG_GROUP}'])" --output text)"
ROLE_PRESENT=0
aws iam get-role --role-name "${ROLE}" >/dev/null 2>&1 && ROLE_PRESENT=1
FUNCTION_PRESENT=0
aws lambda get-function --function-name "${FUNCTION}" --region "${REGION}" >/dev/null 2>&1 && FUNCTION_PRESENT=1
RULE_PRESENT=0
aws events describe-rule --name "${RULE}" --region "${REGION}" >/dev/null 2>&1 && RULE_PRESENT=1
report_exists() {   # 이름 / 있으면 1, 없으면 0 / 있을 때 이 스크립트가 하는 일
  if [ "$2" = "1" ]; then echo "  $1: 있음 → $3"; else echo "  $1: 없음 → 새로 만들어요"; fi
}
report_exists "SNS 토픽 ${TOPIC}" "${TOPIC_EXISTS}" "태그를 다시 붙여요"
report_exists "로그 그룹" "$([ "${LOG_COUNT}" != "0" ] && echo 1 || echo 0)" "보관 기간을 30일로 맞춰요"
report_exists "IAM 역할 ${ROLE}" "${ROLE_PRESENT}" "권한(DailyAccess)을 덮어써요"
report_exists "Lambda 함수 ${FUNCTION}" "${FUNCTION_PRESENT}" "코드와 환경 변수는 건드리지 않아요"
report_exists "EventBridge 규칙 ${RULE}" "${RULE_PRESENT}" "스케줄을 덮어쓰고 사용 상태를 ENABLED 로 되돌려요"
for alarm in "${FUNCTION}-errors" "${CAPTURE_FUNCTION}-errors" "${FUNCTION}-image-missing"; do
  ALARM_COUNT="$(aws cloudwatch describe-alarms --alarm-names "${alarm}" --region "${REGION}" --query 'length(MetricAlarms)' --output text)"
  report_exists "알람 ${alarm}" "$([ "${ALARM_COUNT}" != "0" ] && echo 1 || echo 0)" "설정을 덮어써요(알람 상태는 그대로, 태그는 바뀌지 않아요)"
done
if [ -n "${CHECK_ONLY}" ]; then
  echo "CHECK_ONLY: 여기서 멈춰요. 아무것도 바꾸지 않았어요."
  exit 0
fi

echo "=== 1/9 SNS 알림 토픽 ==="
# 비용태깅_규칙: 태그는 만들 때 함께 붙인다. 없을 때만 create-topic --tags 로 만든다.
# 같은 이름이 이미 있는데 태그가 다르면 create-topic 이 오류를 내므로, 있으면 만들지 않고 tag-resource 로 태그만 맞춘다. 8단계에서 다시 조회해 확인한다.
if [ "${TOPIC_EXISTS}" = "1" ]; then
  # shellcheck disable=SC2086
  aws sns tag-resource --resource-arn "${TOPIC_ARN}" --tags ${TAGS_KV} --region "${REGION}"
  echo "토픽이 이미 있어 태그만 맞췄어요"
else
  # shellcheck disable=SC2086
  TOPIC_ARN="$(aws sns create-topic --name "${TOPIC}" --tags ${TAGS_KV} --region "${REGION}" --query TopicArn --output text)"
  echo "토픽을 태그와 함께 만들었어요"
fi
if [ -n "${ALERT_EMAIL}" ]; then
  aws sns subscribe --topic-arn "${TOPIC_ARN}" --protocol email --notification-endpoint "${ALERT_EMAIL}" --region "${REGION}" --query SubscriptionArn --output text >/dev/null
  echo "이메일 구독을 요청했어요. 받는 사람이 확인 메일의 링크를 눌러야 알림이 와요"
else
  echo "ALERT_EMAIL 을 주지 않아 구독은 만들지 않았어요(알람은 토픽에 보내므로 나중에 구독만 붙이면 돼요)"
fi

echo "=== 2/9 CloudWatch 로그 그룹 (30일 보관) ==="
FOUND="$(aws logs describe-log-groups --log-group-name-prefix "${LOG_GROUP}" --region "${REGION}" --query "length(logGroups[?logGroupName=='${LOG_GROUP}'])" --output text)"
if [ "${FOUND}" = "0" ]; then
  aws logs create-log-group --log-group-name "${LOG_GROUP}" --region "${REGION}" --tags "${TAGS_EQ}"
else
  echo "이미 있음"
fi
aws logs put-retention-policy --log-group-name "${LOG_GROUP}" --retention-in-days 30 --region "${REGION}"

echo "=== 3/9 IAM 역할 (연도 파일 읽기·쓰기, 이미지 목록 조회, 누락 목록 쓰기만) ==="
TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
ROLE_NEW=0
if aws iam get-role --role-name "${ROLE}" >/dev/null 2>&1; then
  echo "이미 있음"
else
  # shellcheck disable=SC2086
  aws iam create-role --role-name "${ROLE}" --assume-role-policy-document "${TRUST}" \
    --description "Timemachine newspaper Naver front list daily collection Lambda" --tags ${TAGS_KV} >/dev/null
  ROLE_NEW=1
fi
# 이미지 쓰기 권한은 주지 않는다. 읽기는 img/ 목록 조회뿐이다. index/v1/ 은 읽고 쓰며(연도 파일), ops/status/ 에는 누락 목록만 쓴다.
POLICY="$(cat <<JSON
{"Version":"2012-10-17","Statement":[
{"Sid":"WriteLogs","Effect":"Allow","Action":["logs:CreateLogStream","logs:PutLogEvents"],"Resource":"arn:aws:logs:${REGION}:${ACCOUNT}:log-group:${LOG_GROUP}:*"},
{"Sid":"ListNeededPrefixes","Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::${BUCKET}","Condition":{"StringLike":{"s3:prefix":["timemachine-newspaper/img/*","timemachine-newspaper/epaper/*","timemachine-newspaper/index/v1/*","timemachine-newspaper/availability/v1/*","timemachine-newspaper/availability/v2/*","ops/status/bigkinds-backfill.json","ops/status/bigkinds-backfill-paused.json","ops/status/bigkinds-cache-index.json","ops/status/bigkinds-backfill-failures.json"]}}},
{"Sid":"ReadYearFiles","Effect":"Allow","Action":"s3:GetObject","Resource":["arn:aws:s3:::${BUCKET}/timemachine-newspaper/index/v1/*","arn:aws:s3:::${BUCKET}/timemachine-newspaper/availability/v1/*","arn:aws:s3:::${BUCKET}/timemachine-newspaper/availability/v2/*","arn:aws:s3:::${BUCKET}/ops/status/bigkinds-backfill.json","arn:aws:s3:::${BUCKET}/ops/status/bigkinds-cache-index.json","arn:aws:s3:::${BUCKET}/ops/status/bigkinds-backfill-failures.json"]},
{"Sid":"WriteYearFilesAndMissingList","Effect":"Allow","Action":"s3:PutObject","Resource":["arn:aws:s3:::${BUCKET}/timemachine-newspaper/index/v1/*","arn:aws:s3:::${BUCKET}/ops/status/missing.json","arn:aws:s3:::${BUCKET}/timemachine-newspaper/availability/v1/*","arn:aws:s3:::${BUCKET}/timemachine-newspaper/availability/v2/*","arn:aws:s3:::${BUCKET}/ops/status/bigkinds-backfill.json","arn:aws:s3:::${BUCKET}/ops/status/bigkinds-backfill-paused.json","arn:aws:s3:::${BUCKET}/ops/status/bigkinds-cache-index.json","arn:aws:s3:::${BUCKET}/ops/status/bigkinds-backfill-failures.json"]},
{"Sid":"ReadFrontCache","Effect":"Allow","Action":"dynamodb:BatchGetItem","Resource":"arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${CACHE_TABLE}","Condition":{"ForAllValues:StringLike":{"dynamodb:LeadingKeys":["timemachine_frontv2_*"]}}},
{"Sid":"InvokeTimeMachine","Effect":"Allow","Action":"lambda:InvokeFunction","Resource":"arn:aws:lambda:${REGION}:${ACCOUNT}:function:${FRONT_FUNCTION}"}
]}
JSON
)"
aws iam put-role-policy --role-name "${ROLE}" --policy-name DailyAccess --policy-document "${POLICY}"
if [ "${ROLE_NEW}" = "1" ]; then
  echo "역할 권한이 퍼질 때까지 10초 기다립니다"
  sleep 10
fi

echo "=== 4/9 코드 묶음 만들기 ==="
WORK="$(mktemp -d)"
ZIP="${WORK}/daily.zip"
(cd "${ROOT}/timemachine-data/collect" && zip -q -j "${ZIP}" crawl_naver_front.py naver_daily.py availability.py availability_v2.py bigkinds_backfill.py cache_index.py daily_handler.py)
zip -q -j "${ZIP}" "${ROOT}/service/backend/services/timeline/front_page_calendar.json"
ls -l "${ZIP}"

echo "=== 5/9 Lambda 함수 (파이썬 3.12, 제한 300초, 256MB, 네이버 수집은 꺼진 채) ==="
# 300초: 한 번에 최대 8일을 0.7초 간격으로 받고 재시도(요청마다 최대 3번)까지 해도 넉넉하다. 날짜 지정 재처리는 최대 31일.
# NAVER_DAILY는 비워 두고, 기존 캐시 색인과 시간당 한 날짜 백필을 켠다. 기존 함수 환경 변수는 덮어쓰지 않는다.
if aws lambda get-function --function-name "${FUNCTION}" --region "${REGION}" >/dev/null 2>&1; then
  echo "이미 있음 - 코드는 deploy_daily.sh 로 올리고 환경 변수는 건드리지 않아요"
else
  aws lambda create-function --function-name "${FUNCTION}" --runtime python3.12 --handler daily_handler.handler \
    --role "arn:aws:iam::${ACCOUNT}:role/${ROLE}" --zip-file "fileb://${ZIP}" --timeout 300 --memory-size 256 \
    --environment "Variables={NEWSPAPER_BUCKET=${BUCKET},BIGKINDS_CACHE_TABLE=${CACHE_TABLE},BIGKINDS_BACKFILL_TARGET=${FRONT_FUNCTION}}" \
    --description "AI LENS timemachine newspaper Naver front list daily collection and missing list" \
    --tags "${TAGS_EQ}" --region "${REGION}" --query FunctionArn --output text
  aws lambda wait function-active-v2 --function-name "${FUNCTION}" --region "${REGION}"
fi
FN_ARN="$(aws lambda get-function --function-name "${FUNCTION}" --region "${REGION}" --query Configuration.FunctionArn --output text)"

echo "=== 6/9 EventBridge 규칙 (${SCHEDULE}) ==="
# shellcheck disable=SC2086
RULE_ARN="$(aws events put-rule --name "${RULE}" --schedule-expression "${SCHEDULE}" --state ENABLED \
  --description "Hourly timemachine newspaper Naver front list collection and missing list" --tags ${TAGS_KV} \
  --region "${REGION}" --query RuleArn --output text)"
if aws lambda get-policy --function-name "${FUNCTION}" --region "${REGION}" 2>/dev/null | grep -q "EventBridgeHourly"; then
  echo "호출 권한이 이미 있음"
else
  aws lambda add-permission --function-name "${FUNCTION}" --statement-id EventBridgeHourly \
    --action lambda:InvokeFunction --principal events.amazonaws.com --source-arn "${RULE_ARN}" --region "${REGION}" >/dev/null
fi
aws events put-targets --rule "${RULE}" --targets "Id=DailyLambda,Arn=${FN_ARN}" --region "${REGION}" \
  --query FailedEntryCount --output text

echo "=== 7/9 CloudWatch 알람 3개 → SNS 토픽 ==="
# 모두 '데이터가 없으면 이상 없음'(notBreaching)으로 본다. 울릴 때(ALARM)와 풀릴 때(OK) 같은 토픽으로 알린다.
# 새로 만든 알람은 첫 평가에서 OK 가 되며 OK 알림이 갈 수 있다. 이미 있는 알람은 상태가 그대로라 설정만 바뀌고 알림은 가지 않는다.
# 태그는 알람을 처음 만들 때만 붙는다(이미 있는 알람에 --tags 를 줘도 CloudWatch 가 무시한다). 8단계가 다시 조회해 확인한다.
# 인자 순서: 이름 설명 네임스페이스 지표 차원이름 차원값 주기(초) 통계 임계값 평가기간수 알림에필요한기간수  (임계값 이상이면 알람)
put_alarm() {
  local name="$1" desc="$2" ns="$3" metric="$4" dim_name="$5" dim_value="$6" period="$7" stat="$8" threshold="$9" eval="${10}" datapoints="${11}"
  local dim=()
  [ -n "${dim_name}" ] && dim=(--dimensions "Name=${dim_name},Value=${dim_value}")
  # ${dim[@]+"${dim[@]}"}: 차원이 없을 때(빈 배열)도 set -u 에서 오류 없이 펼쳐진다(macOS 기본 bash 3.2 대비).
  # shellcheck disable=SC2086
  aws cloudwatch put-metric-alarm --alarm-name "${name}" --alarm-description "${desc}" --namespace "${ns}" --metric-name "${metric}" \
    ${dim[@]+"${dim[@]}"} --statistic "${stat}" --period "${period}" --threshold "${threshold}" --comparison-operator GreaterThanOrEqualToThreshold \
    --evaluation-periods "${eval}" --datapoints-to-alarm "${datapoints}" --treat-missing-data notBreaching \
    --alarm-actions "${TOPIC_ARN}" --ok-actions "${TOPIC_ARN}" --tags ${TAGS_KV} --region "${REGION}"
  echo "  ${name}"
}
# 1) 새 함수가 한 시간 안에 한 번이라도 오류로 끝났다(네이버가 막았거나 받기 실패가 이어졌다).
put_alarm "${FUNCTION}-errors" "Timemachine newspaper daily collection Lambda errored" "AWS/Lambda" "Errors" "FunctionName" "${FUNCTION}" 3600 Sum 1 1 1
# 2) 이미지 수집 함수가 한 시간 안에 오류로 끝났다(새 호 미게시·같은 날짜에 다른 파일·e-Paper 구조 변경). 지금까지 알림이 없던 구멍이다.
put_alarm "${CAPTURE_FUNCTION}-errors" "Timemachine newspaper image capture Lambda errored" "AWS/Lambda" "Errors" "FunctionName" "${CAPTURE_FUNCTION}" 3600 Sum 1 1 1
# 3) 마감 시각(daily_handler.IMAGE_DEADLINE_HOUR)이 지나도 사진이 없는 발행 예상일이 1일 이상인 상태가 3시간 연속(평가 3기간 중 3기간)이다.
#    명절 같은 휴간도 사진이 없으므로 알림이 한 번 울릴 수 있다.
put_alarm "${FUNCTION}-image-missing" "Timemachine newspaper image missing for an expected issue day" "${NAMESPACE}" "ImageMissingDays" "" "" 3600 Maximum 1 3 3

echo "=== 8/9 태그를 다시 조회해 확인 (붙였다고 가정하지 않는다) ==="
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
check_service_tag "SNS 토픽" "$(aws sns list-tags-for-resource --resource-arn "${TOPIC_ARN}" --region "${REGION}" --query "Tags[?Key=='Service'].Value | [0]" --output text)"
for alarm in "${FUNCTION}-errors" "${CAPTURE_FUNCTION}-errors" "${FUNCTION}-image-missing"; do
  ARN="$(aws cloudwatch describe-alarms --alarm-names "${alarm}" --region "${REGION}" --query 'MetricAlarms[0].AlarmArn' --output text)"
  check_service_tag "알람 ${alarm}" "$(aws cloudwatch list-tags-for-resource --resource-arn "${ARN}" --region "${REGION}" --query "Tags[?Key=='Service'].Value | [0]" --output text)"
done

echo "=== 9/9 결과 ==="
aws lambda get-function-configuration --function-name "${FUNCTION}" --region "${REGION}" \
  --query '{State:State,LastUpdateStatus:LastUpdateStatus,Runtime:Runtime,Timeout:Timeout,Memory:MemorySize,NaverDaily:Environment.Variables.NAVER_DAILY,CodeSha256:CodeSha256}' --output table
aws events describe-rule --name "${RULE}" --region "${REGION}" --query '{State:State,Schedule:ScheduleExpression}' --output table
aws cloudwatch describe-alarms --alarm-names "${FUNCTION}-errors" "${CAPTURE_FUNCTION}-errors" "${FUNCTION}-image-missing" --region "${REGION}" \
  --query 'MetricAlarms[].{Alarm:AlarmName,State:StateValue,AlarmActions:length(AlarmActions),OkActions:length(OKActions)}' --output table
if [ "${FAIL}" != "0" ]; then
  echo "태그가 기대와 달라요. 확인이 필요해요."
  exit 1
fi
cat <<EOF
완료. 네이버 수집은 꺼진 채예요(환경 변수 NAVER_DAILY 가 비어 있음).

지금 한 번 실행해 누락 목록과 지표가 만들어지는지 보려면:
  aws lambda invoke --function-name ${FUNCTION} --region ${REGION} --cli-binary-format raw-in-base64-out --payload '{}' out.json && cat out.json

켜기(네이버에 요청을 시작한다 — media.naver.com/robots.txt 가 전체 접근을 막고 있어 허용 여부를 따로 정한 뒤에만):
  aws lambda update-function-configuration --function-name ${FUNCTION} --region ${REGION} \\
    --environment "Variables={NEWSPAPER_BUCKET=${BUCKET},NAVER_DAILY=on,NAVER_DAILY_FROM=<오늘 날짜 YYYY-MM-DD>}"
끄기: 같은 명령에서 NAVER_DAILY=on 과 NAVER_DAILY_FROM 을 빼고 NEWSPAPER_BUCKET 만 남긴다.

날짜 지정 재처리(NAVER_DAILY=on 일 때만):
  aws lambda invoke --function-name ${FUNCTION} --region ${REGION} --cli-binary-format raw-in-base64-out \\
    --payload '{"dates":["2026-11-03"]}' out.json     # 또는 {"from":"2026-11-01","to":"2026-11-07"}, 확인한 날도 다시 받으려면 "force":true
EOF
