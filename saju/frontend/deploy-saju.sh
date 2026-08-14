#!/usr/bin/env bash
# saju(사주매칭) 배포 — 정적 export → S3 ailens-mount/saju/ 프리픽스 → CloudFront 무효화.
#
# ⚠️ 중요: 이 버킷(saju-oracle-frontend-887078546492) 루트는 saju.sedaily.ai
# 자체(원본 sedaily-ai/AI-saju 레포의 독립 배포)가 쓴다 — 이 스크립트는
# 그 루트를 절대 건드리지 않고 ailens-mount/saju/ 프리픽스 밑으로만 쓴다.
# 이 프리픽스는 AILENS CloudFront(E1QS7PY350VHF6)가 OriginPath=/ailens-mount +
# PathPattern:/saju* 로 물어와서 ailens.sedaily.ai/saju/*로 보여주는 대상이다.
# (docs/worklog/2026-08/2026-08-09-saju-cdn-mount.md 참고)
#
# 사용:
#   cd saju/frontend
#   ./deploy-saju.sh
#
# 전제:
#   - output: "export" (next.config.ts) → out/ 생성, basePath: "/saju" 고정
#   - AWS CLI credential 유효 (aws sts get-caller-identity로 확인 권장)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

S3_BUCKET="saju-oracle-frontend-887078546492"
S3_PREFIX="ailens-mount/saju"
S3_REGION="ap-northeast-2"
CF_DIST_ID="E1QS7PY350VHF6"

echo "=== 1/5 빌드 (static export) ==="
npm run build

if [ ! -d "out" ]; then
  echo "ERROR: out/ 없음 — 빌드 실패. 배포 중단." >&2
  exit 1
fi

echo ""
echo "=== 2/5 S3 업로드 — _next/ (해시 파일, 1년 캐시) ==="
aws s3 cp "out/_next/" "s3://${S3_BUCKET}/${S3_PREFIX}/_next/" \
  --recursive \
  --cache-control "public,max-age=31536000,immutable" \
  --region "$S3_REGION" \
  --no-progress

echo ""
echo "=== 3/5 S3 업로드 — 엔트리 (매 요청 재검증) ==="
aws s3 cp "out/" "s3://${S3_BUCKET}/${S3_PREFIX}/" \
  --recursive \
  --exclude "_next/*" \
  --exclude "*.txt" \
  --cache-control "no-cache, must-revalidate" \
  --region "$S3_REGION" \
  --no-progress

echo ""
echo "=== 4/5 S3 업로드 — RSC payload .txt (Content-Type 명시) ==="
# admin/frontend/deploy-admin.sh와 동일한 이유 — aws s3 cp가 .txt를 자동으로
# text/plain으로 붙이는데, 실제로는 next/link 클라이언트 라우팅이 fetch하는
# RSC 페이로드라 text/x-component가 맞아야 한다. 안 맞으면 200을 받고도
# 라우터가 무시해서 "클릭해도 화면 안 바뀜" 증상이 생긴다.
aws s3 cp "out/" "s3://${S3_BUCKET}/${S3_PREFIX}/" \
  --recursive \
  --exclude "*" \
  --include "*.txt" \
  --exclude "_next/*" \
  --cache-control "no-cache, must-revalidate" \
  --content-type "text/x-component" \
  --region "$S3_REGION" \
  --no-progress

echo ""
echo "=== Stale-file cleanup (ailens-mount/saju/ 프리픽스 안에서만) ==="
aws s3 sync "out/" "s3://${S3_BUCKET}/${S3_PREFIX}/" \
  --delete \
  --exclude "_next/static/*" \
  --region "$S3_REGION" \
  --no-progress

echo ""
echo "=== 5/5 CloudFront 무효화 (/saju* — AILENS 배포판, saju.sedaily.ai 자체 CF는 안 건드림) ==="
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$CF_DIST_ID" \
  --paths "/saju*" \
  --query 'Invalidation.Id' \
  --output text)
echo "Invalidation ID: $INVALIDATION_ID"

echo ""
echo "=== Waiting for invalidation to propagate ==="
aws cloudfront wait invalidation-completed \
  --distribution-id "$CF_DIST_ID" \
  --id "$INVALIDATION_ID"

echo ""
echo "=== 헬스체크 ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://ailens.sedaily.ai/saju/)
echo "  https://ailens.sedaily.ai/saju/ -> $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
  echo "WARNING: 헬스체크가 200이 아님 — 수동 확인 필요." >&2
fi

echo ""
echo "=== 배포 완료 ==="
echo "URL: https://ailens.sedaily.ai/saju"
