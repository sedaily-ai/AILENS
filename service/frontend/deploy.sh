#!/usr/bin/env bash
# frontend (MBTI 메인, ailens.sedaily.ai) 배포 — npm build + S3 sync + CloudFront invalidation.
# 백엔드는 service/backend/deploy.sh 로 별도. 본 스크립트는 프런트만.
#
# 사용:
#   cd service/frontend
#   ./deploy.sh
#
# 전제:
#   - 정적 export (next.config: output 'export') → out/ 생성
#   - AWS CLI credential 유효 (aws sts get-caller-identity 로 회사 ai_nova 확인 권장)
#   - region 은 각 명령에 --region 명시 (default region 무관)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

S3_BUCKET="sedaily-mbti-frontend-dev"
S3_REGION="us-east-1"
CF_DIST_ID="E1QS7PY350VHF6"

echo "=== frontend 빌드 (정적 export) ==="
npm run build

if [ ! -d out ]; then
  echo "ERROR: out/ 없음 — 정적 export 실패. 배포 중단." >&2
  exit 1
fi

echo ""
echo "=== S3 sync — 해시 에셋 장기 캐시 (1년, immutable) ==="
aws s3 cp out/_next/ "s3://$S3_BUCKET/_next/" \
  --recursive \
  --cache-control "public,max-age=31536000,immutable" \
  --region "$S3_REGION" \
  --no-progress

echo ""
echo "=== S3 sync — 엔트리 단기 캐시 (5분, 빠른 롤백) ==="
aws s3 cp out/ "s3://$S3_BUCKET/" \
  --recursive \
  --exclude "_next/*" \
  --cache-control "public,max-age=300" \
  --region "$S3_REGION" \
  --no-progress

echo ""
echo "=== Stale 파일 정리 ==="
# _next/static/* 는 --delete 대상에서 뺀다 — 이름이 콘텐츠 해시라 절대
# 충돌하지 않고, 배포 순간에 이미 열려있던 탭이 옛 청크 파일을 그대로
# 참조 중이면(클라이언트 사이드 네비게이션 시) 그 파일이 바로 지워져서
# 요청이 걸리고 라우터가 멈춘다("무한 로딩", 새로고침해야 풀림) — 용량은
# immutable 캐시라 무해하게 쌓이니 지울 이유가 없다.
aws s3 sync out/ "s3://$S3_BUCKET/" --delete --exclude "_next/static/*" --region "$S3_REGION" --no-progress

echo ""
echo "=== CloudFront 무효화 (/* — 전체) ==="
aws cloudfront create-invalidation \
  --distribution-id "$CF_DIST_ID" \
  --paths "/*" \
  --query 'Invalidation.{Id:Id,Status:Status,CreateTime:CreateTime}' \
  --output json

echo ""
echo "=== 배포 완료 ==="
echo "URL: https://ailens.sedaily.ai"
echo "Distribution: $CF_DIST_ID"
