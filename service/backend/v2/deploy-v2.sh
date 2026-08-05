#!/bin/bash
# Deploy script for AI LENS v2 Lambda functions.
#
# v2 handlers import v1 modules (`from clients.xxx`, `from core.xxx`), so this
# script bundles the full v1 source tree plus `v2/` into one zip. A distinct
# S3 key (`lambda_package_v2.zip`) keeps v1 and v2 artifacts separate.
#
# IMPORTANT: per backend/v2/.clauderules #4, this script does NOT create
# Lambda functions, API Gateway routes, IAM roles, or env vars. It only runs
# `update-function-code` on functions that already exist (rule #6). Functions
# not found in AWS are reported as SKIP.
#
# Run from backend/:
#   cd backend
#   ./v2/deploy-v2.sh                  — all registered v2 functions
#   ./v2/deploy-v2.sh api              — /api/v2/* handlers (health, ...)
#   ./v2/deploy-v2.sh collector        — Core 1 (TASK-2.1+)
#   ./v2/deploy-v2.sh selector         — Core 1.5 (TASK-4-B)
#   ./v2/deploy-v2.sh transform        — Core 2 (TASK-2.3+)
#   ./v2/deploy-v2.sh personalization  — Core 3 (TASK-6 + TASK-3.4)
#   ./v2/deploy-v2.sh feed             — Core 3 Feed API only (TASK-6)
#   ./v2/deploy-v2.sh article          — Core 3 Article Detail API only (TASK-6)
#   ./v2/deploy-v2.sh chat-agent       — defers to Docker/ECR path (Phase 4)

set -e

DEPLOY_TARGET="${1:-all}"

# ============================================
# Configuration
# ============================================
BUILD_DIR="lambda-build-v2"
PACKAGE_FILE="lambda_package_v2.zip"
S3_BUCKET="sedaily-mbti-lambda-packages-dev"
S3_KEY="lambda_package_v2.zip"
AWS_REGION="us-east-1"

# ============================================
# Function lists (append here as new TASKs land)
# ============================================
API_V2_FUNCTIONS=(
  "sedaily-mbti-v2-health-dev"
  "sedaily-mbti-v2-today-letters-dev"  # Editor Pick GET API (handlers/today_letters.py)
  "sedaily-mbti-v2-subscribe-dev"      # 구독/수신거부 API (handlers/subscribe.py)
                                       # 함수 최초 생성 수동(.clauderules), 이후 update만 자동
  "sedaily-mbti-v2-front-page-dev"     # 지면 1면 기사 GET API (handlers/front_page.py)
                                       # 함수 최초 생성 수동(.clauderules), 이후 update만 자동
  "sedaily-mbti-v2-posts-dev"          # CMS 글 공개 조회 API (handlers/cms_posts_public.py)
                                       # 함수 최초 생성 수동(.clauderules), 이후 update만 자동
)

CORE1_FUNCTIONS=(
  "sedaily-mbti-v2-collector-dev"  # TASK-2.1
)
CORE1_5_FUNCTIONS=(
  "sedaily-mbti-v2-selector-dev"  # TASK-4-B
)
CORE2_FUNCTIONS=(
  "sedaily-mbti-v2-transform-dev"  # TASK-2.3
  # TASK-2.4 will add sedaily-mbti-v2-validator-dev
)
CORE25_FUNCTIONS=(
  "sedaily-mbti-v2-editor-pick-dev"  # Editor Pick daily cron (handlers/core25_editor_pick.py)
)
CORE3_FUNCTIONS=(
  "sedaily-mbti-v2-feed-dev"          # TASK-6 Feed API (개인화는 TASK-3.4)
  "sedaily-mbti-v2-article-dev"       # TASK-6 Article Detail API
  "sedaily-mbti-v2-interaction-dev"   # TASK-3.4 Record Interaction (Round 5-C)
  "sedaily-mbti-v2-consolidate-dev"   # TASK-3.5 Daily Consolidation (Round 5-D)
)
# 2026-07-30 폐기: sedaily-mbti-v2-newsletter-dev 는 API 라우트도 EventBridge
# 스케줄도 붙은 적이 없고 30일 실호출 0회였다 — 발송측이 결선되지 않은 상태로
# 배포만 되어 있었다. 함수는 삭제했으나 `handlers/newsletter.py` 와
# `v2/newsletter/` 패키지는 **남겨 둔다**: 같은 패키지를 라이브인
# `handlers/subscribe.py` (/api/v2/subscribe, /api/v2/unsubscribe) 가 쓰고,
# test_newsletter.py 가 덮고 있다. 다시 켤 때는 create-function 부터 수동으로.
# 경위: infrastructure/decommission-2026-07-30/README.md
NEWSLETTER_FUNCTIONS=()

# chat-agent deploys via Docker + ECR + agentcore CLI — not in this list.

# ============================================
# Target resolution
# ============================================
case "$DEPLOY_TARGET" in
  api)
    FUNCTIONS=("${API_V2_FUNCTIONS[@]}")
    ;;
  subscribe)
    FUNCTIONS=("sedaily-mbti-v2-subscribe-dev")
    ;;
  collector)
    FUNCTIONS=("${CORE1_FUNCTIONS[@]}")
    ;;
  selector)
    FUNCTIONS=("${CORE1_5_FUNCTIONS[@]}")
    ;;
  transform)
    FUNCTIONS=("${CORE2_FUNCTIONS[@]}")
    ;;
  editor-pick)
    FUNCTIONS=("${CORE25_FUNCTIONS[@]}")
    ;;
  today-letters)
    FUNCTIONS=("sedaily-mbti-v2-today-letters-dev")
    ;;
  front-page)
    FUNCTIONS=("sedaily-mbti-v2-front-page-dev")
    ;;
  posts)
    FUNCTIONS=("sedaily-mbti-v2-posts-dev")
    ;;
  personalization)
    FUNCTIONS=("${CORE3_FUNCTIONS[@]}")
    ;;
  feed)
    FUNCTIONS=("sedaily-mbti-v2-feed-dev")
    ;;
  article)
    FUNCTIONS=("sedaily-mbti-v2-article-dev")
    ;;
  interaction)
    FUNCTIONS=("sedaily-mbti-v2-interaction-dev")
    ;;
  consolidate)
    FUNCTIONS=("sedaily-mbti-v2-consolidate-dev")
    ;;
  newsletter)
    echo "sedaily-mbti-v2-newsletter-dev 는 2026-07-30 에 폐기됐다 (미결선 · 실호출 0회)."
    echo "코드는 v2/handlers/newsletter.py 에 남아 있다 — 재개하려면 create-function 부터 수동."
    exit 1
    ;;
  chat-agent)
    echo "Chat Agent deploys via Docker build + ECR push + agentcore CLI."
    echo "See backend/v2/agents/chat_agent/deploy.sh (TASK-4.2)."
    exit 0
    ;;
  all)
    FUNCTIONS=(
      "${API_V2_FUNCTIONS[@]}"
      "${CORE1_FUNCTIONS[@]}"
      "${CORE1_5_FUNCTIONS[@]}"
      "${CORE2_FUNCTIONS[@]}"
      "${CORE25_FUNCTIONS[@]}"
      "${CORE3_FUNCTIONS[@]}"
      "${NEWSLETTER_FUNCTIONS[@]}"
    )
    ;;
  *)
    echo "Unknown target: $DEPLOY_TARGET"
    echo "Use: all | api | subscribe | collector | selector | transform | editor-pick | today-letters | front-page | posts | personalization | feed | article | interaction | consolidate | newsletter | chat-agent"
    exit 1
    ;;
esac

if [ ${#FUNCTIONS[@]} -eq 0 ]; then
  echo "No v2 functions registered for target '$DEPLOY_TARGET' yet."
  echo "(Skipping build/upload — nothing to deploy.)"
  exit 0
fi

echo "Starting Sedaily-MBTI v2 Lambda Deployment (target: $DEPLOY_TARGET)..."
echo ""

# ============================================
# Step 1: Build Lambda package
# ============================================
echo "Building Lambda package..."

rm -rf "$BUILD_DIR" "$PACKAGE_FILE"
mkdir "$BUILD_DIR"

# Install runtime dependencies for Lambda (Linux, Python 3.11).
# Same pins as v1 deploy.sh because v2 handlers import v1 modules.
# TODO(TASK-4.1): add `mcp==<pin>` when Chat Agent work starts.
echo "  -> Installing runtime dependencies for Linux (Python 3.11)..."
pip3 install \
  httpx==0.27.0 \
  python-dotenv==1.0.1 \
  requests==2.32.3 \
  beautifulsoup4==4.12.3 \
  opensearch-py==2.4.2 \
  requests-aws4auth==1.3.1 \
  pg8000==1.31.2 \
  "PyJWT[crypto]==2.10.1" \
  json-repair==0.61.7 \
  -t "$BUILD_DIR" \
  --platform manylinux2014_x86_64 \
  --python-version 3.11 \
  --only-binary=:all: \
  --upgrade \
  --no-cache-dir \
  --quiet

# Copy v1 source modules (unchanged — v2 handlers import them).
echo "  -> Copying v1 source..."
for dir in clients handlers config core models repositories services utils common; do
  if [ -d "$dir" ]; then
    echo "    -> $dir/"
    cp -r "$dir" "$BUILD_DIR/"
  fi
done

# Copy v1 prompt files (v2 may load chatbot/transform prompts via prompt_loader).
if [ -d "prompts" ]; then
  echo "    -> prompts/"
  cp -r prompts "$BUILD_DIR/"
fi

# Copy v1 legacy prompt file (fallback used by MbtiTransformService).
if [ -f "MBTI_TRANSFORM_PROMPT.md" ]; then
  cp MBTI_TRANSFORM_PROMPT.md "$BUILD_DIR/"
fi

# Copy v2 source — exclude tests, docs, build/package outputs, config files.
echo "  -> Copying v2 source..."
mkdir -p "$BUILD_DIR/v2"
rsync -a \
  --exclude='tests/' \
  --exclude='__pycache__/' \
  --exclude='*.pyc' \
  --exclude='*.md' \
  --exclude='.clauderules' \
  --exclude='.gitignore' \
  --exclude='requirements.txt' \
  --exclude='deploy-v2.sh' \
  --exclude='lambda-build-v2/' \
  --exclude='lambda_package_v2.zip' \
  v2/ "$BUILD_DIR/v2/"

# prompts/ 안의 .md 는 런타임 자산 (페르소나 카드 / orchestrator system prompt).
# 위 *.md exclude 가 docs 거르려고 박힌 거라 prompts 까지 잡힘 — 다시 copy.
echo "  -> Copying v2 prompts (.md runtime assets)..."
rsync -a v2/prompts/ "$BUILD_DIR/v2/prompts/"

# Scrub caches from anything we just copied.
find "$BUILD_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$BUILD_DIR" -type f -name "*.pyc" -delete 2>/dev/null || true

# Create ZIP package.
echo "  -> Creating ZIP package..."
cd "$BUILD_DIR"
zip -r "../$PACKAGE_FILE" . -q
cd ..

# Remove build dir (keep the zip for debugging; .gitignore excludes it).
rm -rf "$BUILD_DIR"

PACKAGE_SIZE=$(du -h "$PACKAGE_FILE" | cut -f1)
echo "  [OK] Package created: $PACKAGE_FILE ($PACKAGE_SIZE)"
echo ""

# ============================================
# Step 2: Upload to S3
# ============================================
echo "Uploading to S3..."
aws s3 cp "$PACKAGE_FILE" "s3://$S3_BUCKET/$S3_KEY" --region "$AWS_REGION" --quiet
echo "  [OK] Uploaded to s3://$S3_BUCKET/$S3_KEY"
echo ""

# ============================================
# Step 3: Update Lambda functions (update-function-code only)
# ============================================
# Pre-check runtime before updating. Both get-function-configuration (read)
# and update-function-code (code swap, rule #6) are allowed by .clauderules.
# update-function-configuration (runtime change) is NOT called here — that
# stays manual per .clauderules #4.
#
# Why the runtime guard: AWS Lambda Durable Functions (re:Invent 2025,
# python3.14-only) silently breaks API Gateway HTTP proxy integration —
# CloudWatch shows "status 200 completed" but callers get 500 "Invalid
# Status in invocation output". See COMMANDS.md > "Lambda 500 에러 —
# Durable Functions 함정" for the full diagnosis recipe.
echo "Updating Lambda functions..."
SUCCESS_COUNT=0
SKIP_COUNT=0

# deploy-v2.sh builds wheels with --python-version 3.11 --platform manylinux2014.
# python3.12 is ABI-compatible enough for our pure-Python deps; anything newer
# risks Durable Functions or wheel incompatibilities, so we refuse to push.
SUPPORTED_RUNTIMES="python3.11 python3.12"

for FUNCTION_NAME in "${FUNCTIONS[@]}"; do
  echo "  -> $FUNCTION_NAME"

  # Single read-only API call; empty = function not found.
  CONFIG_JSON=$(aws lambda get-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --region "$AWS_REGION" \
    --output json 2>/dev/null || true)

  if [ -z "$CONFIG_JSON" ]; then
    echo "    [SKIP] Function not found in AWS — create it manually per .clauderules #4"
    ((SKIP_COUNT++))
    continue
  fi

  # Extract Runtime and check for any Durable* config fields via python3 (no jq).
  # The exact field name for Durable Functions isn't stably documented yet
  # (re:Invent 2025), so scan every top-level key starting with "Durable".
  RUNTIME=$(printf '%s' "$CONFIG_JSON" | python3 -c '
import json, sys
print(json.load(sys.stdin).get("Runtime", ""))
')

  DURABLE_KEYS=$(printf '%s' "$CONFIG_JSON" | python3 -c '
import json, sys
cfg = json.load(sys.stdin)
print(",".join(k for k, v in cfg.items() if k.startswith("Durable") and v))
')

  if [ -n "$DURABLE_KEYS" ]; then
    echo "    [WARN] Durable config detected (fields: $DURABLE_KEYS)."
    echo "           Durable Functions are incompatible with API Gateway HTTP proxy"
    echo "           integration. See COMMANDS.md > 'Lambda 500 에러 — Durable Functions 함정'."
    echo "    [SKIP] Delete this Lambda and recreate on python3.11 without durable execution."
    ((SKIP_COUNT++))
    continue
  fi

  if [[ " $SUPPORTED_RUNTIMES " != *" $RUNTIME "* ]]; then
    echo "    [WARN] Runtime is '$RUNTIME' — deploy-v2.sh builds wheels for python3.11."
    echo "           (python3.14 may enable Durable Functions, breaking API Gateway proxy."
    echo "            See COMMANDS.md > 'Lambda 500 에러 — Durable Functions 함정'.)"
    echo "    [SKIP] Change Runtime to python3.11 in AWS console, then re-run."
    ((SKIP_COUNT++))
    continue
  fi

  if aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --s3-bucket "$S3_BUCKET" \
    --s3-key "$S3_KEY" \
    --region "$AWS_REGION" \
    --output json \
    --query 'LastModified' \
    > /dev/null 2>&1; then
    echo "    [OK] Updated (runtime: $RUNTIME)"
    ((SUCCESS_COUNT++))
  else
    echo "    [FAIL] update-function-code returned error (runtime $RUNTIME, check logs)"
    ((SKIP_COUNT++))
  fi
done

echo ""
echo "[DONE] $SUCCESS_COUNT updated, $SKIP_COUNT skipped."
echo ""
echo "Monitoring (once the function exists):"
echo "  aws logs tail /aws/lambda/sedaily-mbti-v2-health-dev --follow --region $AWS_REGION"
