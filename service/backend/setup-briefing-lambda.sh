#!/bin/bash
# Setup script for the News Briefing Generator Lambda
# Run this ONCE to create the Lambda function and EventBridge daily schedule.
#
# Prerequisites:
#   - AWS CLI configured
#   - lambda_package.zip already uploaded to S3 (run deploy.sh first)
#   - IAM role 'sedaily-mbti-lambda-role' exists (same as other Lambdas)
#
# Usage:
#   chmod +x setup-briefing-lambda.sh
#   ./setup-briefing-lambda.sh

set -e

FUNCTION_NAME="sedaily-mbti-briefing-dev"
REGION="us-east-1"
S3_BUCKET="sedaily-mbti-lambda-packages-dev"
S3_KEY="lambda_package.zip"
HANDLER="handlers.briefing_handler.lambda_handler"
RUNTIME="python3.11"
TIMEOUT=120
MEMORY=256

# Use the same IAM role as other Lambdas
# Replace this ARN with your actual role ARN
ROLE_ARN="arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/sedaily-mbti-lambda-role"

echo "=== Creating Briefing Generator Lambda ==="

# Step 1: Create Lambda function
echo "  -> Creating Lambda function: $FUNCTION_NAME"
aws lambda create-function \
  --function-name "$FUNCTION_NAME" \
  --runtime "$RUNTIME" \
  --role "$ROLE_ARN" \
  --handler "$HANDLER" \
  --code S3Bucket="$S3_BUCKET",S3Key="$S3_KEY" \
  --timeout "$TIMEOUT" \
  --memory-size "$MEMORY" \
  --region "$REGION" \
  --description "Generates daily MBTI-styled news briefings for the chatbot" \
  --output json \
  --query 'FunctionArn' 2>/dev/null || echo "    (Function may already exist)"

LAMBDA_ARN=$(aws lambda get-function \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --query 'Configuration.FunctionArn' \
  --output text)

echo "    Lambda ARN: $LAMBDA_ARN"

# Step 2: Create EventBridge rule (daily at 07:00 KST = 22:00 UTC previous day)
RULE_NAME="sedaily-mbti-daily-briefing"
SCHEDULE="cron(0 22 * * ? *)"  # 22:00 UTC = 07:00 KST next day

echo ""
echo "  -> Creating EventBridge schedule: $RULE_NAME"
echo "     Schedule: Daily at 07:00 KST (22:00 UTC)"

aws events put-rule \
  --name "$RULE_NAME" \
  --schedule-expression "$SCHEDULE" \
  --state ENABLED \
  --description "Triggers daily news briefing generation at 07:00 KST" \
  --region "$REGION" \
  --output json \
  --query 'RuleArn' 2>/dev/null

# Step 3: Grant EventBridge permission to invoke Lambda
echo "  -> Adding Lambda invoke permission for EventBridge"
aws lambda add-permission \
  --function-name "$FUNCTION_NAME" \
  --statement-id "EventBridgeDailyBriefing" \
  --action "lambda:InvokeFunction" \
  --principal "events.amazonaws.com" \
  --source-arn "arn:aws:events:${REGION}:$(aws sts get-caller-identity --query Account --output text):rule/${RULE_NAME}" \
  --region "$REGION" 2>/dev/null || echo "    (Permission may already exist)"

# Step 4: Add Lambda as target for EventBridge rule
echo "  -> Setting Lambda as EventBridge target"
aws events put-targets \
  --rule "$RULE_NAME" \
  --targets "Id=BriefingLambdaTarget,Arn=$LAMBDA_ARN" \
  --region "$REGION" \
  --output json 2>/dev/null

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Schedule: Daily at 07:00 KST (22:00 UTC)"
echo "Lambda:   $FUNCTION_NAME"
echo "Rule:     $RULE_NAME"
echo ""
echo "Test manually:"
echo "  aws lambda invoke --function-name $FUNCTION_NAME --region $REGION /dev/stdout"
echo ""
echo "Check logs:"
echo "  aws logs tail /aws/lambda/$FUNCTION_NAME --follow --region $REGION"
