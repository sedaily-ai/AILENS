#!/usr/bin/env bash
# 타임머신 신문 일일 수집(naver_daily·daily_handler) Lambda 의 코드만 다시 올린다(리소스 구성은 provision_daily.sh).
# 환경 변수(NAVER_DAILY 등)는 건드리지 않는다. 배포 확인은 CodeSha256(올린 묶음과 같은지)과 State/LastUpdateStatus 로 한다.
# 사용: AWS 자격 증명이 있는 기기에서 bash timemachine-data/aws/deploy_daily.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "${ROOT}/config/resources.env"

REGION="${AWS_REGION}"
FUNCTION="${TIMEMACHINE_DAILY_FUNCTION}"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text --region "${REGION}")"
if [ "${ACCOUNT}" != "${AWS_ACCOUNT_ID}" ]; then
  echo "계정이 달라요. 멈춥니다."
  exit 1
fi

WORK="$(mktemp -d)"
ZIP="${WORK}/daily.zip"
(cd "${ROOT}/timemachine-data/collect" && zip -q -j "${ZIP}" crawl_naver_front.py naver_daily.py availability.py availability_v2.py bigkinds_backfill.py cache_index.py daily_handler.py)
zip -q -j "${ZIP}" "${ROOT}/service/backend/services/timeline/front_page_calendar.json"
LOCAL_SHA="$(openssl dgst -sha256 -binary "${ZIP}" | openssl base64)"

aws lambda update-function-code --function-name "${FUNCTION}" --zip-file "fileb://${ZIP}" --region "${REGION}" \
  --query CodeSha256 --output text >/dev/null
aws lambda wait function-updated-v2 --function-name "${FUNCTION}" --region "${REGION}"

REMOTE_SHA="$(aws lambda get-function-configuration --function-name "${FUNCTION}" --region "${REGION}" --query CodeSha256 --output text)"
STATE="$(aws lambda get-function-configuration --function-name "${FUNCTION}" --region "${REGION}" --query State --output text)"
LAST="$(aws lambda get-function-configuration --function-name "${FUNCTION}" --region "${REGION}" --query LastUpdateStatus --output text)"
echo "State=${STATE} LastUpdateStatus=${LAST}"
if [ "${LOCAL_SHA}" = "${REMOTE_SHA}" ] && [ "${STATE}" = "Active" ] && [ "${LAST}" = "Successful" ]; then
  echo "배포 확인: 올린 묶음과 CodeSha256 이 같아요"
else
  echo "배포 확인 실패: 묶음 해시가 다르거나 상태가 Active/Successful 이 아니에요"
  exit 1
fi
