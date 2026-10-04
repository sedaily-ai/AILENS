#!/bin/bash
# Deploy Script for Sedaily-MBTI Backend
#
# ⚠ 이름 주의(2026-10-01) — 이 스크립트는 "옛 Lambda API"(sedaily-mbti-*-dev) 배포용이다.
# 지금 서비스의 공개 API(/api/v2/posts*)는 service/lens-cms-api(EC2, PM2)가 서빙하고
# 그쪽 배포는 service/lens-cms-api/deploy.sh 다. 이 Lambda들은 일부(검색·피드·타임라인·
# 퀴즈 등)가 아직 호출되고 있어 현역이다 — 전체 지도는 docs/architecture/배포_스크립트_지도.md.
# Builds and deploys Lambda functions for MBTI news style transformation.
#
# 2026-08-05: v1/v2 소스 통합 — 예전에 별도였던 deploy-v2.sh(별도 zip, 별도
# 함수 그룹)를 이 스크립트 하나로 합쳤다. 소스 트리가 이미 하나로 합쳐졌으니
# (newsletter/, clients/*_v2_client.py 등이 이 루트로 이동) 배포도 zip 하나,
# 스크립트 하나면 충분하다. Lambda 함수 이름 자체는 바꾸지 않았다 —
# `sedaily-mbti-v2-*-dev` 로 이미 배포되어 있는 이름 그대로 사용.
#
# 같은 날, 자동 수집→AI 생성 파이프라인(Collector/Editor Pick/Core 3 개인화)이
# 폐기 결정나며 core25/, core3/ 와 관련 핸들러가 전부 삭제됐다 — 콘텐츠는 이제
# 관리자 대시보드 수동 업로드(handlers/cms_posts_public.py, DynamoDB 기반)로
# 대체된다. `cron` 배포 타깃도 그래서 없다.
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
# newsletter/ 는 옛 v2 소스 통합분 (2026-08-05) — handlers/subscribe.py 가 사용.
echo "  -> Copying source code..."
for dir in clients handlers config core models repositories services utils common newsletter; do
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
# infrastructure/ is NOT copied (only used for CloudFormation/Step Functions)

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
  # S3 XML 기반 타임라인 (handlers/timeline_handler.py). 함수가 아직 없으면
  # 아래 배포 루프가 [SKIP] 으로 조용히 건너뛴다.
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
# 2026-09-04 — "sedaily-mbti-newsletter-subscribe-dev"(handlers/newsletter/
# subscribe.py) 제거. 리팩토링 감사로 이 핸들러가 handlers/subscribe.py
# (sedaily-mbti-v2-subscribe-dev, 아래 API_V2_FUNCTIONS)와 완전히 독립된
# 중복 구현이었던 게 드러나 subscribe.py로 통합하고 소스 파일은 삭제했다.
# ⚠️ 배포된 Lambda 함수·API Gateway 라우트(/api/newsletter/subscribe)
# 자체는 아직 안 지웠다 — 이 배포 루프에서 빠졌으니 더 이상 코드 업데이트는
# 안 되지만, AWS 자원 실삭제는 별도 확인 후 진행할 것.

# --- API Functions (원래 v2 이름, 2026-08-05 소스 통합 — 함수명은 그대로) ---
API_V2_FUNCTIONS=(
  "sedaily-mbti-v2-health-dev"
  "sedaily-mbti-v2-today-letters-dev"  # 오늘의 한 통 GET API (handlers/today_letters.py)
  "sedaily-mbti-v2-subscribe-dev"      # 구독/수신거부 (handlers/subscribe.py)
  # sedaily-mbti-v2-front-page-dev(지면 1면)는 2026-08-06 소스 삭제 —
  # pgvector RDS(v1·v2 둘 다) 계정에서 완전히 사라짐 확인, 재구축 필요해지면
  # 그때 다시 설계. AWS Lambda 함수/API Gateway 라우트 자체는 수동 정리 전까지
  # 남아있을 수 있음(더 이상 이 배포 대상에서 코드 업데이트 안 됨).
  "sedaily-mbti-v2-posts-dev"          # CMS 글 공개 조회 (handlers/cms_posts_public.py)
  # sedaily-mbti-v2-quiz-dev(용어 퀴즈)는 2026-10-05 소스 삭제 — 사용 중단. Lambda·API Gateway 라우트(/api/quiz/*)는
  # 수동 정리 전까지 남아있을 수 있음(더 이상 이 배포 대상에서 코드 업데이트 안 됨).
)

# --- Pipeline Functions ---
# 2026-07-30: v1 Step Functions 파이프라인(step1~4 + supervisor)과 상태머신
# sedaily-mbti-transform-pipeline-dev 를 폐기했다.
# 2026-08-05: 자동 수집→AI 생성 파이프라인(v2 collector/editor-pick/개인화 feed·article)도
# 전부 폐기 — RDS 삭제로 매일 조용히 실패하고 있었고, 콘텐츠는 관리자 대시보드 수동
# 업로드로 대체하기로 결정. 관련 Lambda(sedaily-mbti-v2-collector-dev,
# -editor-pick-dev, -feed-dev, -article-dev)는 이 배포 대상에서 제외됐다 — 소스가
# 삭제됐을 뿐 AWS 쪽 Lambda 함수 자체는 아직 남아있을 수 있음(수동 정리 필요).
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
# Durable Functions 런타임 가드 (옛 deploy-v2.sh에서 흡수, 2026-08-05): AWS Lambda
# Durable Functions(python3.14-only)는 API Gateway HTTP proxy 통합과 호환되지
# 않는다 — CloudWatch는 "status 200 completed"인데 호출자는 500 "Invalid Status
# in invocation output"을 받는다. 이 스크립트는 python3.11 wheel로 빌드하므로
# 배포 전 런타임을 확인해 이 함정을 피한다. 진단 상세: docs 또는 과거
# v2/COMMANDS.md 참조.
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
# 21개 함수가 같은 zip을 공유하는 구조라, 이 zip 자체가 깨졌으면(의존성 누락 등)
# 전부 같이 죽는다 — 그 케이스를 잡기 위해 대표로 하나만 호출해본다. 이 함수를
# 고른 이유: CMS 공개 조회라 인증 없이 바로 확인 가능하고, 오늘 세션에서 가장
# 최근에 손댄 핸들러라 회귀에 가장 민감하다.
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
