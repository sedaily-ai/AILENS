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
echo "=== S3 sync — 엔트리 파일 (매 요청 재검증) ==="
# max-age=300 이었다가 no-cache로 바꿨다(2026-08-07) — "5분간 무조건 캐시 신뢰"가
# 배포 직후 정확히 이 문제를 냈다: 라우트 전환 시 next/link가 fetch하는
# __next.*.txt 페이로드(엔트리 HTML과 동일 캐시 정책)를 배포 5분 전후에 한 번이라도
# 받은 브라우저는, 새 탭을 열어도 같은 프로필이면 그 캐시를 그대로 써서 옛 빌드의
# 페이로드를 받는다 — Next 라우터가 이걸 조용히 못 쓰고 네비게이션이 멈춘다(URL
# 안 바뀜, 에러도 안 뜸). no-cache(=must-revalidate와 동일 동작)는 매번 서버에 재검증
# 요청을 보내되 ETag가 안 바뀌었으면 304로 저렴하게 끝나 — "5분 캐시로 롤백 빠르게"
# 라는 원래 의도(빠른 재배포로 롤백)는 그대로 유지하면서, 빌드 버전이 뒤섞이는
# 경우를 근본적으로 없앤다.
aws s3 cp out/ "s3://$S3_BUCKET/" \
  --recursive \
  --exclude "_next/*" \
  --exclude "*.txt" \
  --cache-control "no-cache, must-revalidate" \
  --region "$S3_REGION" \
  --no-progress

echo ""
echo "=== S3 sync — RSC 페이로드 .txt (Content-Type 명시) ==="
# aws s3 cp는 확장자만 보고 .txt -> text/plain 을 자동으로 붙이는데, 이 .txt
# 파일들은 사실 next/link 클라이언트 라우팅이 fetch하는 RSC(flight) 페이로드다.
# 로컬 dev 서버가 같은 요청에 실제로 내려주는 Content-Type은 text/x-component
# (2026-08-07, curl로 직접 대조 확인). 이게 안 맞으면 Next 라우터가 응답을
# 200으로 받고도 유효한 네비게이션 페이로드로 인식하지 못해 조용히 무시한다 —
# 콘솔 에러도 없이 클릭해도 URL이 안 바뀌는 현상(웹툰·레터 카드 전부)의 진짜
# 원인이었다.
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
echo "=== Stale 파일 정리 ==="
# _next/static/* 는 --delete 대상에서 뺀다 — 이름이 콘텐츠 해시라 절대
# 충돌하지 않고, 배포 순간에 이미 열려있던 탭이 옛 청크 파일을 그대로
# 참조 중이면(클라이언트 사이드 네비게이션 시) 그 파일이 바로 지워져서
# 요청이 걸리고 라우터가 멈춘다("무한 로딩", 새로고침해야 풀림) — 용량은
# immutable 캐시라 무해하게 쌓이니 지울 이유가 없다.
aws s3 sync out/ "s3://$S3_BUCKET/" --delete --exclude "_next/static/*" --region "$S3_REGION" --no-progress

echo ""
echo "=== CloudFront 무효화 (/* — 전체) ==="
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$CF_DIST_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)
echo "Invalidation ID: $INVALIDATION_ID"

echo ""
echo "=== 무효화 전파 대기 (전 세계 엣지에 퍼질 때까지) ==="
# create-invalidation은 비동기라 바로 리턴한다 — 이걸 안 기다리고 "배포 완료"를
# 찍으면, 그 직후 테스트하는 사람이 리전에 따라 몇 분간 옛 캐시를 계속 받을 수
# 있다(2026-08-07, 웹툰/레터 카드 클릭이 라우팅 안 되는 문제의 재현 조건 중 하나로
# 의심됨). 완료까지 보통 1~5분 걸린다.
aws cloudfront wait invalidation-completed \
  --distribution-id "$CF_DIST_ID" \
  --id "$INVALIDATION_ID"

echo ""
echo "=== 배포 완료 (무효화 전파까지 확인됨) ==="
echo "URL: https://ailens.sedaily.ai"
echo "Distribution: $CF_DIST_ID"
