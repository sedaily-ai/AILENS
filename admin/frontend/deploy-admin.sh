#!/usr/bin/env bash
# admin 배포 — npm build + S3 sync + CloudFront invalidation.
# Admin-5 (commit pending).
#
# 사용:
#   cd admin/frontend
#   ./deploy-admin.sh
#
# 전제:
#   - .env.local (또는 .env.production) 에 NEXT_PUBLIC_ADMIN_API_BASE_URL 설정
#   - AWS CLI default region 무관 (각 명령에 --region 명시)
#   - aws sts get-caller-identity 로 credential 유효 확인 권장
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

S3_BUCKET="sedaily-mbti-admin-frontend-dev"
S3_REGION="us-east-1"
CF_DIST_ID="E1MITYI58DB9UW"

echo "=== admin 빌드 ==="
npm run build

echo ""
echo "=== S3 sync — long cache for hashed assets (1 year, immutable) ==="
aws s3 cp out/_next/ "s3://$S3_BUCKET/_next/" \
  --recursive \
  --cache-control "public,max-age=31536000,immutable" \
  --region "$S3_REGION" \
  --no-progress

echo ""
echo "=== S3 sync — entries (revalidate every request) ==="
# max-age=300였다가 no-cache로 바꿨다(2026-08-07) — 배포 직후 5분 캐시를 무조건
# 신뢰하는 게, 브라우저/CDN이 배포 전 버전의 라우트 페이로드를 계속 쓰게 만들어
# next/link 클라이언트 네비게이션이 조용히 멈추는 원인 중 하나였다
# (service/frontend/deploy.sh 동일 수정 참조). must-revalidate라 내용이 안
# 바뀌었으면 304로 저렴하게 끝난다.
aws s3 cp out/ "s3://$S3_BUCKET/" \
  --recursive \
  --exclude "_next/*" \
  --exclude "*.txt" \
  --cache-control "no-cache, must-revalidate" \
  --region "$S3_REGION" \
  --no-progress

echo ""
echo "=== S3 sync — RSC payload .txt (explicit Content-Type) ==="
# aws s3 cp가 확장자만 보고 .txt -> text/plain을 자동으로 붙이는데, 이 .txt들은
# next/link 클라이언트 라우팅이 fetch하는 RSC(flight) 페이로드다. Next dev
# 서버가 같은 요청에 실제로 내려주는 Content-Type은 text/x-component
# (2026-08-07, curl로 직접 대조 확인 — service/frontend 쪽에서 발견). 이게 안
# 맞으면 라우터가 200 응답을 받고도 유효한 페이로드로 인식 못 하고 조용히
# 무시한다 — 콘솔 에러 없이 클릭해도 페이지 전환이 안 되는 현상의 원인이었다.
aws s3 cp out/ "s3://$S3_BUCKET/" \
  --recursive \
  --exclude "*" \
  --include "*.txt" \
  --exclude "_next/*" \
  --cache-control "no-cache, must-revalidate" \
  --content-type "text/x-component" \
  --region "$S3_REGION" \
  --no-progress

echo ""
echo "=== Stale-file cleanup ==="
# _next/static/* is excluded from --delete — filenames are content hashes so
# they never collide, and deleting them immediately breaks any tab that was
# already open at deploy time (client-side nav requests a chunk that just got
# deleted, router hangs — "infinite loading" until a hard refresh). Storage
# cost of keeping old hashed chunks around is negligible (immutable cache).
aws s3 sync out/ "s3://$S3_BUCKET/" --delete --exclude "_next/static/*" --region "$S3_REGION" --no-progress

echo ""
echo "=== CloudFront invalidation (/* — full path) ==="
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$CF_DIST_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)
echo "Invalidation ID: $INVALIDATION_ID"

echo ""
echo "=== Waiting for invalidation to propagate ==="
# create-invalidation은 비동기라 바로 리턴한다 — 안 기다리고 "배포 완료"를 찍으면
# 그 직후 테스트 시 리전에 따라 몇 분간 옛 캐시를 받을 수 있다(2026-08-07).
aws cloudfront wait invalidation-completed \
  --distribution-id "$CF_DIST_ID" \
  --id "$INVALIDATION_ID"

echo ""
echo "=== 헬스체크 ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://lensdb.sedaily.ai/)
echo "  https://lensdb.sedaily.ai/ → $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
  echo "WARNING: 헬스체크가 200이 아님 — 수동 확인 필요." >&2
fi

echo ""
echo "=== 배포 완료 (무효화 전파까지 확인됨) ==="
# 이 distribution은 lensdb.sedaily.ai / ailens-admin.sedaily.ai 둘 다 alias로
# 물려있다(2026-08 도메인 재구성) — 아래 둘 다 같은 배포로 갱신됨.
echo "URL: https://lensdb.sedaily.ai"
echo "URL(alias): https://ailens-admin.sedaily.ai"
echo "Distribution: https://$CF_DIST_ID.cloudfront.net (also reachable)"
