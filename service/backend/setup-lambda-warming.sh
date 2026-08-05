#!/bin/bash
# Setup Lambda Warming with CloudWatch Events
# Pings Lambda functions every 5 minutes to prevent cold starts

set -e

REGION="us-east-1"
RULE_NAME="sedaily-mbti-lambda-warming"
SCHEDULE="rate(5 minutes)"

# Lambda functions to keep warm (most critical for user experience)
LAMBDA_FUNCTIONS=(
  "sedaily-mbti-search-dev"
  "sedaily-mbti-article-dev"
  "sedaily-mbti-post-dev"
)

echo "Setting up Lambda Warming..."
echo ""

# ============================================
# Step 1: Create CloudWatch Events Rule
# ============================================
echo "[1/3] Creating CloudWatch Events rule..."

aws events put-rule \
  --name "$RULE_NAME" \
  --schedule-expression "$SCHEDULE" \
  --state ENABLED \
  --description "Keep Lambda functions warm to prevent cold starts" \
  --region "$REGION" \
  > /dev/null

echo "  [OK] Rule created: $RULE_NAME ($SCHEDULE)"
echo ""

# ============================================
# Step 2: Add Lambda Permission & Target
# ============================================
echo "[2/3] Adding Lambda targets..."

# Build targets JSON
TARGETS="["
FIRST=true

for FUNCTION_NAME in "${LAMBDA_FUNCTIONS[@]}"; do
  echo "  -> Adding $FUNCTION_NAME..."

  # Get Lambda ARN
  LAMBDA_ARN=$(aws lambda get-function \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION" \
    --query 'Configuration.FunctionArn' \
    --output text)

  # Add permission for CloudWatch Events to invoke Lambda
  # Remove existing permission first (ignore error if not exists)
  aws lambda remove-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id "lambda-warming-permission" \
    --region "$REGION" 2>/dev/null || true

  aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id "lambda-warming-permission" \
    --action "lambda:InvokeFunction" \
    --principal "events.amazonaws.com" \
    --source-arn "arn:aws:events:$REGION:$(aws sts get-caller-identity --query Account --output text):rule/$RULE_NAME" \
    --region "$REGION" \
    > /dev/null

  # Build target entry
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    TARGETS+=","
  fi

  TARGETS+="{\"Id\":\"$FUNCTION_NAME\",\"Arn\":\"$LAMBDA_ARN\",\"Input\":\"{\\\"warmup\\\":true}\"}"

  echo "    [OK] Permission added"
done

TARGETS+="]"

# ============================================
# Step 3: Set Targets
# ============================================
echo ""
echo "[3/3] Setting rule targets..."

aws events put-targets \
  --rule "$RULE_NAME" \
  --targets "$TARGETS" \
  --region "$REGION" \
  > /dev/null

echo "  [OK] Targets configured"
echo ""

# ============================================
# Verification
# ============================================
echo "Lambda Warming Setup Complete!"
echo ""
echo "Configuration:"
echo "  - Rule: $RULE_NAME"
echo "  - Schedule: Every 5 minutes"
echo "  - Functions: ${LAMBDA_FUNCTIONS[*]}"
echo ""
echo "Verification command:"
echo "  aws events describe-rule --name $RULE_NAME --region $REGION"
echo ""
echo "Check logs:"
echo "  aws logs tail /aws/lambda/sedaily-mbti-search-dev --follow --filter-pattern 'warmup'"
echo ""
