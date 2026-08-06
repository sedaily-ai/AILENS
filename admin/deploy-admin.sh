#!/usr/bin/env bash
# admin 배포 — npm build + S3 sync + CloudFront invalidation.
# Admin-5 (commit pending).
#
# 사용:
#   cd admin
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
echo "=== S3 sync — short cache for entries (5 min — fast rollback) ==="
aws s3 cp out/ "s3://$S3_BUCKET/" \
  --recursive \
  --exclude "_next/*" \
  --cache-control "public,max-age=300" \
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
aws cloudfront create-invalidation \
  --distribution-id "$CF_DIST_ID" \
  --paths "/*" \
  --query 'Invalidation.{Id:Id,Status:Status,CreateTime:CreateTime}' \
  --output json

echo ""
echo "=== 배포 완료 ==="
echo "URL: https://mbti-admin.sedaily.ai"
echo "Distribution: https://$CF_DIST_ID.cloudfront.net (also reachable)"
