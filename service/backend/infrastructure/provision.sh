#!/bin/bash
# =============================================================================
# AI LENS Backend — AWS Resource Provisioning Script
# =============================================================================
#
# Creates all new AWS resources for the redesigned backend:
#   - 2 S3 buckets (article body, audio)
#   - 2 DynamoDB tables (personal, podcast)
#   - 3 Lambda functions (API)
#   - 1 Step Functions state machine
#   - 1 EventBridge schedule rule
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - Existing Lambda role: sedaily-mbti-lambda-role
#   - Lambda package already uploaded: s3://sedaily-mbti-lambda-packages-dev/lambda_package.zip
#     (run deploy.sh first)
#
# Usage:
#   ./provision.sh                    # Create all resources
#   ./provision.sh --dry-run          # Print commands without executing
#
# Does NOT provision (Phase 2 — requires AWS engineer):
#   - OpenSearch domain
#   - RDS PostgreSQL + pgvector
# =============================================================================

set -e

REGION="us-east-1"
DRY_RUN=false

if [ "$1" = "--dry-run" ]; then
  DRY_RUN=true
  echo "============================================"
  echo "  DRY RUN — commands will be printed only"
  echo "============================================"
  echo ""
fi

# ── Resolve AWS Account ID ───────────────────────────────────────────────────

if [ "$DRY_RUN" = true ]; then
  AWS_ACCOUNT_ID="\${AWS_ACCOUNT_ID}"
  echo "[dry-run] AWS_ACCOUNT_ID will be resolved at runtime"
else
  AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  echo "AWS Account: $AWS_ACCOUNT_ID"
fi

LAMBDA_ROLE="arn:aws:iam::${AWS_ACCOUNT_ID}:role/sedaily-mbti-lambda-role"
LAMBDA_CODE="S3Bucket=sedaily-mbti-lambda-packages-dev,S3Key=lambda_package.zip"
EB_ROLE="arn:aws:iam::${AWS_ACCOUNT_ID}:role/sedaily-mbti-eventbridge-role"

run() {
  if [ "$DRY_RUN" = true ]; then
    echo "[dry-run] $*"
  else
    echo "  -> $1 ..."
    eval "$*"
  fi
}

echo ""
echo "============================================"
echo "  AI LENS Backend Provisioning"
echo "============================================"
echo ""

# =============================================================================
# 1. S3 BUCKETS
# =============================================================================
echo "── 1. S3 Buckets ──────────────────────────────────────────"

# Article body storage (split from DynamoDB)
# Stores: articles/{news_id}/body.json
# Contains: content_ko, content_raw, content_blocks, version_NT/NF/ST/SF
echo ""
echo "[1.1] sedaily-mbti-article-body-dev (article body JSON)"
run aws s3api create-bucket \
  --bucket sedaily-mbti-article-body-dev \
  --region $REGION

# Block public access on article body bucket
run aws s3api put-public-access-block \
  --bucket sedaily-mbti-article-body-dev \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Audio file storage (podcast/TTS)
# Stores: podcasts/{podcast_id}.mp3
# Accessed via presigned URLs (1-hour expiry)
echo ""
echo "[1.2] sedaily-mbti-audio-dev (podcast/TTS audio)"
run aws s3api create-bucket \
  --bucket sedaily-mbti-audio-dev \
  --region $REGION

run aws s3api put-public-access-block \
  --bucket sedaily-mbti-audio-dev \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo ""
echo "  [OK] S3 buckets created"
echo ""

# =============================================================================
# 2. DYNAMODB TABLES
# =============================================================================
echo "── 2. DynamoDB Tables ─────────────────────────────────────"

# Personal DB — user profiles, archived sentences, reading history
# PK: user_id (S), SK: sk (S)
# SK patterns: PROFILE, ARCHIVE#{article_id}#{timestamp}, READING#{article_id}
echo ""
echo "[2.1] sedaily-mbti-personal-dev (user data)"
run aws dynamodb create-table \
  --table-name sedaily-mbti-personal-dev \
  --attribute-definitions \
    "AttributeName=user_id,AttributeType=S" \
    "AttributeName=sk,AttributeType=S" \
  --key-schema \
    "AttributeName=user_id,KeyType=HASH" \
    "AttributeName=sk,KeyType=RANGE" \
  --billing-mode PAY_PER_REQUEST \
  --region $REGION

# Podcast DB — podcast episode metadata
# PK: podcast_id (S)  — format: podcast_{news_id}_{mbti_group}_{timestamp}
# GSI: date-index for listing podcasts by date
echo ""
echo "[2.2] sedaily-mbti-podcast-dev (podcast metadata)"
run aws dynamodb create-table \
  --table-name sedaily-mbti-podcast-dev \
  --attribute-definitions \
    "AttributeName=podcast_id,AttributeType=S" \
    "AttributeName=created_date,AttributeType=S" \
  --key-schema \
    "AttributeName=podcast_id,KeyType=HASH" \
  --global-secondary-indexes \
    "'[{
      \"IndexName\": \"date-index\",
      \"KeySchema\": [
        {\"AttributeName\": \"created_date\", \"KeyType\": \"HASH\"},
        {\"AttributeName\": \"podcast_id\", \"KeyType\": \"RANGE\"}
      ],
      \"Projection\": {\"ProjectionType\": \"ALL\"}
    }]'" \
  --billing-mode PAY_PER_REQUEST \
  --region $REGION

echo ""

# Wait for tables to become active
if [ "$DRY_RUN" = false ]; then
  echo "  Waiting for tables to become ACTIVE..."
  aws dynamodb wait table-exists --table-name sedaily-mbti-personal-dev --region $REGION
  aws dynamodb wait table-exists --table-name sedaily-mbti-podcast-dev --region $REGION
  echo "  [OK] DynamoDB tables active"
else
  echo "[dry-run] Would wait for table-exists"
fi
echo ""

# =============================================================================
# 3. LAMBDA FUNCTIONS — API
# =============================================================================
echo "── 3. Lambda Functions (API) ──────────────────────────────"

create_lambda() {
  local NAME=$1
  local HANDLER=$2
  local MEMORY=${3:-512}
  local TIMEOUT=${4:-300}

  echo ""
  echo "[Lambda] $NAME"
  echo "         handler: $HANDLER"
  echo "         memory: ${MEMORY}MB, timeout: ${TIMEOUT}s"

  run aws lambda create-function \
    --function-name "$NAME" \
    --runtime python3.11 \
    --handler "$HANDLER" \
    --role "$LAMBDA_ROLE" \
    --code "$LAMBDA_CODE" \
    --timeout "$TIMEOUT" \
    --memory-size "$MEMORY" \
    --region $REGION \
    --environment "Variables={AWS_REGION=$REGION,DYNAMODB_TABLE_ARTICLES=sedaily-mbti-articles-dev,DYNAMODB_TABLE_PERSONAL=sedaily-mbti-personal-dev,DYNAMODB_TABLE_PODCAST=sedaily-mbti-podcast-dev,S3_ARTICLE_BODY_BUCKET=sedaily-mbti-article-body-dev,S3_AUDIO_BUCKET=sedaily-mbti-audio-dev}"
}

# Archive (내 서랍) — sentence archiving with pgvector similarity
create_lambda \
  "sedaily-mbti-archive-dev" \
  "handlers.archive_handler.lambda_handler" \
  512 300

# Podcast — audio generation (Bedrock script + Polly TTS + S3 upload)
create_lambda \
  "sedaily-mbti-podcast-dev" \
  "handlers.podcast_handler.lambda_handler" \
  512 300

# Recommendations — personalized article recommendations + DNA analysis
create_lambda \
  "sedaily-mbti-recommend-dev" \
  "handlers.recommendation_handler.lambda_handler" \
  512 300

echo ""
echo "  [OK] API Lambda functions created"
echo ""

# =============================================================================
# SUMMARY
# =============================================================================
echo "============================================"
echo "  Provisioning Complete!"
echo "============================================"
echo ""
echo "Resources created:"
echo "  S3 Buckets:       2 (article-body, audio)"
echo "  DynamoDB Tables:  2 (personal, podcast)"
echo "  Lambda Functions: 3 (API)"
echo ""
echo "Next steps:"
echo "  1. Run deploy.sh to upload latest Lambda code"
echo "  2. Configure API Gateway routes for new Lambda functions"
echo ""
echo "Phase 2 (not provisioned yet — requires AWS engineer):"
echo "  - OpenSearch domain (RAG hybrid search)"
echo "  - RDS PostgreSQL + pgvector extension (similarity search)"
echo ""

# =============================================================================
# CLEANUP COMMANDS (uncomment to tear down)
# =============================================================================
# echo "Tearing down resources..."
#
# # Lambda — API
# aws lambda delete-function --function-name sedaily-mbti-archive-dev --region $REGION
# aws lambda delete-function --function-name sedaily-mbti-podcast-dev --region $REGION
# aws lambda delete-function --function-name sedaily-mbti-recommend-dev --region $REGION
#
# # DynamoDB (WARNING: deletes all data)
# aws dynamodb delete-table --table-name sedaily-mbti-personal-dev --region $REGION
# aws dynamodb delete-table --table-name sedaily-mbti-podcast-dev --region $REGION
#
# # S3 (must empty buckets first)
# aws s3 rm s3://sedaily-mbti-article-body-dev --recursive
# aws s3api delete-bucket --bucket sedaily-mbti-article-body-dev --region $REGION
# aws s3 rm s3://sedaily-mbti-audio-dev --recursive
# aws s3api delete-bucket --bucket sedaily-mbti-audio-dev --region $REGION
#
# echo "Teardown complete."
