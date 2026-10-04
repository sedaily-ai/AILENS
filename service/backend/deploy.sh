#!/bin/bash
# Deploy Script for Sedaily-MBTI Backend
#
# 대상: 레거시 Lambda API(sedaily-mbti-*-dev). 공개 API(/api/v2/posts*)는
# service/lens-cms-api(EC2, PM2)가 서빙하며 배포는 service/lens-cms-api/deploy.sh 가 담당한다.
# 이 Lambda 중 검색·피드·타임라인 등 일부는 현재도 호출된다.
# 전체 배포 스크립트 지도: docs/architecture/배포_스크립트_지도.md
#
# 단일 zip 으로 모든 함수에 배포하며, Lambda 함수 이름은 `sedaily-mbti-v2-*-dev` 등 기존 이름을 유지한다.
# 콘텐츠는 관리자 대시보드 수동 업로드(handlers/content/cms_posts_public.py)로 공급하므로 `cron` 배포 타깃은 없다.
#
# Usage:
#   ./deploy.sh           — Deploy all functions (= api, 현재는 동의어)
#   ./deploy.sh api       — Deploy API functions only

set -euo pipefail

DEPLOY_TARGET="${1:-all}"

echo "Starting Sedaily-MBTI Backend Deployment (target: $DEPLOY_TARGET)..."
echo ""

# ============================================
# Step 1: Build Lambda Package
# ============================================
echo "Building Lambda package..."

# Clean previous builds
rm -rf lambda-build lambda_package.zip
mkdir lambda-build

# Install dependencies for Linux (Lambda runtime)
# Only runtime deps — no pytest, no fastapi/uvicorn (dev-only).
echo "  -> Installing runtime dependencies for Linux (Python 3.11)..."
pip3 install \
  httpx==0.27.0 \
  python-dotenv==1.0.1 \
  requests==2.32.3 \
  beautifulsoup4==4.12.3 \
  boto3 \
  botocore \
  pg8000==1.31.2 \
  "PyJWT[crypto]==2.10.1" \
  -t lambda-build \
  --platform manylinux2014_x86_64 \
  --python-version 3.11 \
  --only-binary=:all: \
  --upgrade \
  --no-cache-dir \
  --quiet

# Copy source code modules
# newsletter/ 는 handlers/content/subscribe.py 가 사용한다.
echo "  -> Copying source code..."
for dir in clients handlers config core models repositories services common newsletter; do
  if [ -d "$dir" ]; then
    echo "    -> $dir/"
    cp -r "$dir" lambda-build/
  fi
done

# Copy prompt files (needed by MbtiTransformService)
if [ -d "prompts" ]; then
  echo "    -> prompts/"
  cp -r prompts lambda-build/
fi

# Copy legacy prompt file (fallback)
if [ -f "MBTI_TRANSFORM_PROMPT.md" ]; then
  cp MBTI_TRANSFORM_PROMPT.md lambda-build/
fi

# Remove files that should NOT be in the Lambda package
echo "  -> Cleaning up unnecessary files..."
find lambda-build -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find lambda-build -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
find lambda-build -type f -name "*.pyc" -delete 2>/dev/null || true
# infrastructure/ 는 패키지에 포함하지 않는다.

# 레거시 핸들러 경로 shim: handler 설정이 아직 이전 경로인 Lambda가 코드 갱신 직후 깨지지 않도록 패키징 시에만 생성한다.
# Step 3 에서 handler 설정을 새 경로로 변경하면 shim 은 호출되지 않는다.
echo "  -> Generating legacy handler shims..."
grep -v '^#' lambda_handlers.txt | while read -r _fn OLD_MOD NEW_MOD; do
  [ -z "$OLD_MOD" ] && continue
  OLD_PATH="lambda-build/$(echo "$OLD_MOD" | tr . /).py"
  OLD_DIR="$(dirname "$OLD_PATH")"
  mkdir -p "$OLD_DIR"
  # 레거시 패키지 디렉터리(handlers/voice, handlers/websocket)에 __init__.py 를 생성한다
  [ -f "$OLD_DIR/__init__.py" ] || touch "$OLD_DIR/__init__.py"
  printf 'from %s import lambda_handler  # noqa: F401  (전환용 shim)\n' "$NEW_MOD" > "$OLD_PATH"
done

# Create ZIP package
echo "  -> Creating ZIP package..."
cd lambda-build
zip -r ../lambda_package.zip . -q
cd ..

# Cleanup build directory
rm -rf lambda-build

# Get package size
PACKAGE_SIZE=$(du -h lambda_package.zip | cut -f1)
echo "  [OK] Package created: lambda_package.zip ($PACKAGE_SIZE)"
echo ""

# ============================================
# Step 2: Upload to S3
# ============================================
echo "Uploading to S3..."
aws s3 cp lambda_package.zip s3://sedaily-mbti-lambda-packages-dev/ --quiet
echo "  [OK] Uploaded to s3://sedaily-mbti-lambda-packages-dev/lambda_package.zip"
echo ""

# ============================================
# Step 3: Update Lambda Functions
# ============================================
echo "Updating Lambda functions..."

# --- API Functions (원래 v1 이름) ---
API_FUNCTIONS=(
  "sedaily-mbti-article-collector-dev"
  "sedaily-mbti-search-dev"
  "sedaily-mbti-article-dev"
  "sedaily-mbti-chatbot-dev"
  "sedaily-mbti-time-machine-dev"
  # S3 XML 기반 타임라인. 함수가 없으면 배포 루프가 [SKIP] 처리한다.
  "sedaily-mbti-timeline-dev"
  "sedaily-mbti-s3-articles-dev"
  "sedaily-mbti-user-dev"
  "sedaily-mbti-archive-dev"
  "sedaily-mbti-post-dev"
  "sedaily-mbti-question-dev"
  "sedaily-mbti-briefing-dev"
  "sedaily-mbti-ws-connect-dev"
  "sedaily-mbti-ws-disconnect-dev"
  "sedaily-mbti-ws-message-dev"
  "sedaily-mbti-voice-stt-presign-dev"
  "sedaily-mbti-voice-tts-dev"
)
# newsletter-subscribe Lambda 는 handlers/content/subscribe.py 로 통합되어 배포 대상에서 제외했다.
# 배포된 Lambda 함수와 API Gateway 라우트(/api/newsletter/subscribe)는 별도 확인 후 삭제한다.

# --- API Functions (v2 이름) ---
API_V2_FUNCTIONS=(
  "sedaily-mbti-v2-health-dev"
  "sedaily-mbti-v2-today-letters-dev"  # 오늘의 한 통 GET API (handlers/content/today_letters.py)
  "sedaily-mbti-v2-subscribe-dev"      # 구독/수신거부 (handlers/content/subscribe.py)
  "sedaily-mbti-v2-posts-dev"          # CMS 글 공개 조회 (handlers/content/cms_posts_public.py)
  # front-page·quiz Lambda 는 소스가 삭제되어 배포 대상에서 제외했다. 남은 함수와 라우트는 수동 정리한다.
)

# --- Pipeline Functions ---
# 자동 수집·생성 파이프라인 Lambda 는 폐기되어 배포 대상에서 제외했다. 남은 AWS 리소스는 수동 정리한다.
# 경위와 복원 방법: infrastructure/decommission-2026-07-30/README.md
PIPELINE_FUNCTIONS=()

# Select which functions to deploy
case "$DEPLOY_TARGET" in
  pipeline)
    echo "v1 파이프라인은 2026-07-30 에 폐기됐다 — 배포할 함수가 없다."
    exit 1
    ;;
  api)
    FUNCTIONS=("${API_FUNCTIONS[@]}" "${API_V2_FUNCTIONS[@]}")
    ;;
  all)
    FUNCTIONS=("${API_FUNCTIONS[@]}" "${API_V2_FUNCTIONS[@]}")
    ;;
  *)
    echo "Unknown target: $DEPLOY_TARGET (use: all, api)"
    exit 1
    ;;
esac

# Update each function.
# Durable Functions 런타임 가드: python3.14 전용 Durable Functions 는 API Gateway HTTP proxy 통합과
# 호환되지 않아 호출자가 500 "Invalid Status in invocation output"을 받는다.
# 이 스크립트는 python3.11 wheel 로 빌드하므로 배포 전에 런타임을 확인한다.
SUPPORTED_RUNTIMES="python3.11 python3.12"

SUCCESS_COUNT=0
FAIL_COUNT=0

for FUNCTION_NAME in "${FUNCTIONS[@]}"; do
  echo "  -> Updating $FUNCTION_NAME..."

  CONFIG_JSON=$(aws lambda get-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --region us-east-1 \
    --output json 2>/dev/null || true)

  if [ -z "$CONFIG_JSON" ]; then
    echo "    [SKIP] Function not found"
    ((FAIL_COUNT++))
    continue
  fi

  RUNTIME=$(printf '%s' "$CONFIG_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("Runtime",""))')
  DURABLE_KEYS=$(printf '%s' "$CONFIG_JSON" | python3 -c 'import json,sys; cfg=json.load(sys.stdin); print(",".join(k for k,v in cfg.items() if k.startswith("Durable") and v))')

  if [ -n "$DURABLE_KEYS" ]; then
    echo "    [SKIP] Durable Functions config detected ($DURABLE_KEYS) — incompatible with API Gateway proxy. Recreate on python3.11 without durable execution."
    ((FAIL_COUNT++))
    continue
  fi

  if [[ " $SUPPORTED_RUNTIMES " != *" $RUNTIME "* ]]; then
    echo "    [SKIP] Runtime is '$RUNTIME' — this script builds wheels for python3.11. Change Runtime in AWS console, then re-run."
    ((FAIL_COUNT++))
    continue
  fi

  if aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --s3-bucket sedaily-mbti-lambda-packages-dev \
    --s3-key lambda_package.zip \
    --region us-east-1 \
    --output json \
    --query 'LastModified' \
    > /dev/null 2>&1; then
    echo "    [OK] Updated (runtime: $RUNTIME)"
    ((SUCCESS_COUNT++))
    # handler 설정을 새 모듈 경로로 맞춘다(이미 같으면 건너뜀). 코드 갱신이 끝난 뒤에 바꿔야 shim이 그 사이를 받친다.
    NEW_MOD=$(grep -v '^#' lambda_handlers.txt | awk -v f="$FUNCTION_NAME" '$1==f {print $3}')
    if [ -n "$NEW_MOD" ]; then
      WANT_HANDLER="$NEW_MOD.lambda_handler"
      CUR_HANDLER=$(printf '%s' "$CONFIG_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("Handler",""))')
      if [ "$CUR_HANDLER" != "$WANT_HANDLER" ]; then
        aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region us-east-1
        aws lambda update-function-configuration --function-name "$FUNCTION_NAME" \
          --handler "$WANT_HANDLER" --region us-east-1 --output text --query 'Handler' > /dev/null \
          && echo "    [OK] handler: $CUR_HANDLER -> $WANT_HANDLER" \
          || echo "    [WARN] handler 갱신 실패(옛 경로 shim으로 계속 동작)"
      fi
    fi
  else
    echo "    [FAIL] update-function-code returned error"
    ((FAIL_COUNT++))
  fi
done

echo ""
echo "[DONE] Deployment complete! ($SUCCESS_COUNT updated, $FAIL_COUNT skipped)"
echo ""

# ============================================
# Step 4: Health Check
# ============================================
# 모든 함수가 같은 zip 을 공유하므로 대표 함수 하나만 호출해 패키지 손상(의존성 누락 등)을 확인한다.
# CMS 공개 조회는 인증 없이 호출할 수 있어 대표 함수로 사용한다.
echo "Health check (sedaily-mbti-v2-posts-dev)..."
sleep 2
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev/api/v2/posts?channel=letters&limit=1")
echo "  GET /api/v2/posts?channel=letters&limit=1 -> $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
  echo "  [WARN] 200이 아님 — CloudWatch 로그로 확인 필요 (배포된 21개 함수 중 하나가" >&2
  echo "         이 결과만으로 전부 정상/비정상이라 단정할 수는 없음)." >&2
fi

echo ""
echo "Monitoring commands:"
echo "  -> Article Collector:"
echo "     aws logs tail /aws/lambda/sedaily-mbti-article-collector-dev --follow"
echo "  -> Chatbot:"
echo "     aws logs tail /aws/lambda/sedaily-mbti-chatbot-dev --follow"
echo "  -> Archive:"
echo "     aws logs tail /aws/lambda/sedaily-mbti-archive-dev --follow"
echo "  -> Briefing Generator logs:"
echo "     aws logs tail /aws/lambda/sedaily-mbti-briefing-dev --follow"
echo ""
