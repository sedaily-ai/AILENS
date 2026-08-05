#!/bin/bash
# =============================================================================
# CloudWatch Cost Monitoring Alarms for AI LENS Backend
# =============================================================================
#
# Creates alarms for:
#   1. Bedrock invocation spike (> 500 calls/day)
#   2. DynamoDB write capacity spike (> 1000 WCU/day)
#   3. Lambda concurrency spike (> 50 concurrent)
#   4. S3 storage growth (> 10 GB)
#   5. Estimated daily cost (> $50)
#
# All alarms send to an SNS topic — configure email subscription separately.
#
# Usage:
#   ./cost_monitoring.sh               # Create all alarms
#   ./cost_monitoring.sh --dry-run     # Print commands only
#   ./cost_monitoring.sh --delete      # Remove all alarms
#   ./cost_monitoring.sh --status      # Check alarm states
# =============================================================================

set -e

REGION="us-east-1"
ALARM_PREFIX="sedaily-mbti"
SNS_TOPIC_NAME="${ALARM_PREFIX}-cost-alerts"
DRY_RUN=false

if [ "$1" = "--dry-run" ]; then
  DRY_RUN=true
  echo "[DRY RUN]"
  echo ""
fi

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "UNKNOWN")

# ── Status check ─────────────────────────────────────────────────────────────

if [ "$1" = "--status" ]; then
  echo "CloudWatch Alarm Status:"
  aws cloudwatch describe-alarms \
    --alarm-name-prefix "$ALARM_PREFIX" \
    --region "$REGION" \
    --query 'MetricAlarms[*].{Name:AlarmName,State:StateValue,Metric:MetricName,Threshold:Threshold}' \
    --output table
  exit 0
fi

# ── Delete all alarms ────────────────────────────────────────────────────────

if [ "$1" = "--delete" ]; then
  echo "Deleting all ${ALARM_PREFIX} alarms..."
  ALARMS=$(aws cloudwatch describe-alarms \
    --alarm-name-prefix "$ALARM_PREFIX" \
    --region "$REGION" \
    --query 'MetricAlarms[*].AlarmName' \
    --output text)

  if [ -n "$ALARMS" ]; then
    aws cloudwatch delete-alarms --alarm-names $ALARMS --region "$REGION"
    echo "Deleted: $ALARMS"
  else
    echo "No alarms found."
  fi

  # Delete SNS topic
  TOPIC_ARN="arn:aws:sns:${REGION}:${AWS_ACCOUNT_ID}:${SNS_TOPIC_NAME}"
  aws sns delete-topic --topic-arn "$TOPIC_ARN" --region "$REGION" 2>/dev/null && echo "Deleted SNS topic" || true
  exit 0
fi

echo "AWS Account: $AWS_ACCOUNT_ID"
echo ""

# =============================================================================
# 0. SNS TOPIC (notification target)
# =============================================================================
echo "── 0. SNS Topic ──"

if [ "$DRY_RUN" = true ]; then
  SNS_ARN="arn:aws:sns:${REGION}:\${AWS_ACCOUNT_ID}:${SNS_TOPIC_NAME}"
  echo "[dry-run] Would create SNS topic: $SNS_TOPIC_NAME"
else
  SNS_ARN=$(aws sns create-topic \
    --name "$SNS_TOPIC_NAME" \
    --region "$REGION" \
    --query 'TopicArn' \
    --output text 2>/dev/null)

  echo "  Topic: $SNS_ARN"
  echo ""
  echo "  *** Subscribe your email to receive alerts: ***"
  echo "  aws sns subscribe --topic-arn $SNS_ARN --protocol email --notification-endpoint your@email.com --region $REGION"
fi

echo ""

# =============================================================================
# Helper function
# =============================================================================

create_alarm() {
  local ALARM_NAME="$1"
  local DESCRIPTION="$2"
  local NAMESPACE="$3"
  local METRIC="$4"
  local DIMENSION_NAME="$5"
  local DIMENSION_VALUE="$6"
  local THRESHOLD="$7"
  local COMPARISON="$8"
  local PERIOD="${9:-86400}"       # default: 1 day
  local STAT="${10:-Sum}"
  local EVAL_PERIODS="${11:-1}"

  echo "  [Alarm] $ALARM_NAME"
  echo "          $METRIC $COMPARISON $THRESHOLD ($STAT over ${PERIOD}s)"

  if [ "$DRY_RUN" = true ]; then
    echo "  [dry-run] Would create alarm"
  else
    local DIM_ARG=""
    if [ -n "$DIMENSION_NAME" ] && [ -n "$DIMENSION_VALUE" ]; then
      DIM_ARG="--dimensions Name=$DIMENSION_NAME,Value=$DIMENSION_VALUE"
    fi

    aws cloudwatch put-metric-alarm \
      --alarm-name "$ALARM_NAME" \
      --alarm-description "$DESCRIPTION" \
      --namespace "$NAMESPACE" \
      --metric-name "$METRIC" \
      $DIM_ARG \
      --statistic "$STAT" \
      --period "$PERIOD" \
      --threshold "$THRESHOLD" \
      --comparison-operator "$COMPARISON" \
      --evaluation-periods "$EVAL_PERIODS" \
      --alarm-actions "$SNS_ARN" \
      --treat-missing-data notBreaching \
      --region "$REGION"

    echo "  [OK]"
  fi
  echo ""
}

# =============================================================================
# 1. BEDROCK INVOCATION COUNT (> 500/day)
# =============================================================================
echo "── 1. Bedrock Invocation Alarm ──"
echo ""

create_alarm \
  "${ALARM_PREFIX}-bedrock-invocations-high" \
  "Bedrock model invocations exceed 500/day — possible runaway pipeline" \
  "AWS/Bedrock" \
  "Invocations" \
  "ModelId" "us.anthropic.claude-3-5-haiku-20241022-v1:0" \
  500 \
  "GreaterThanThreshold" \
  86400 "Sum" 1

# =============================================================================
# 2. DYNAMODB WRITE CAPACITY (> 1000 WCU/day)
# =============================================================================
echo "── 2. DynamoDB Write Capacity Alarm ──"
echo ""

create_alarm \
  "${ALARM_PREFIX}-dynamodb-wcu-high" \
  "DynamoDB write capacity exceeds 1000 WCU/day on articles table" \
  "AWS/DynamoDB" \
  "ConsumedWriteCapacityUnits" \
  "TableName" "sedaily-mbti-articles-dev" \
  1000 \
  "GreaterThanThreshold" \
  86400 "Sum" 1

# =============================================================================
# 3. LAMBDA CONCURRENT EXECUTIONS (> 50)
# =============================================================================
echo "── 3. Lambda Concurrency Alarm ──"
echo ""

# Account-level concurrency (all functions)
create_alarm \
  "${ALARM_PREFIX}-lambda-concurrency-high" \
  "Lambda concurrent executions exceed 50 — pipeline may be overloading" \
  "AWS/Lambda" \
  "ConcurrentExecutions" \
  "" "" \
  50 \
  "GreaterThanThreshold" \
  300 "Maximum" 3

# =============================================================================
# 4. S3 STORAGE (> 10 GB)
# =============================================================================
echo "── 4. S3 Storage Alarm ──"
echo ""

create_alarm \
  "${ALARM_PREFIX}-s3-storage-high" \
  "S3 article body bucket exceeds 10 GB — review data retention" \
  "AWS/S3" \
  "BucketSizeBytes" \
  "BucketName" "sedaily-mbti-article-body-dev" \
  10737418240 \
  "GreaterThanThreshold" \
  86400 "Average" 1

# =============================================================================
# 5. ESTIMATED DAILY COST (> $50)
# =============================================================================
echo "── 5. Estimated Cost Alarm ──"
echo ""

# AWS Billing metric (requires billing alerts enabled in account settings)
create_alarm \
  "${ALARM_PREFIX}-daily-cost-high" \
  "Estimated daily charges exceed \$50 — review usage immediately" \
  "AWS/Billing" \
  "EstimatedCharges" \
  "Currency" "USD" \
  50 \
  "GreaterThanThreshold" \
  86400 "Maximum" 1

# =============================================================================
# ADDITIONAL: Pipeline-specific alarms
# =============================================================================
echo "── 6. Pipeline Error Alarm ──"
echo ""

create_alarm \
  "${ALARM_PREFIX}-pipeline-errors" \
  "Pipeline Lambda errors exceed 5/hour — check logs" \
  "AWS/Lambda" \
  "Errors" \
  "FunctionName" "sedaily-mbti-pipeline-step3-dev" \
  5 \
  "GreaterThanThreshold" \
  3600 "Sum" 1

# =============================================================================
# SUMMARY
# =============================================================================
echo "============================================"
echo "  Cost Monitoring Alarms Created"
echo "============================================"
echo ""
echo "  Alarms:"
echo "    1. Bedrock invocations > 500/day"
echo "    2. DynamoDB WCU > 1000/day"
echo "    3. Lambda concurrency > 50"
echo "    4. S3 storage > 10 GB"
echo "    5. Daily cost > \$50"
echo "    6. Pipeline errors > 5/hour"
echo ""
echo "  SNS Topic: $SNS_TOPIC_NAME"
echo ""
echo "  Next: subscribe your email for notifications"
echo "  aws sns subscribe \\"
echo "    --topic-arn $SNS_ARN \\"
echo "    --protocol email \\"
echo "    --notification-endpoint your@email.com \\"
echo "    --region $REGION"
echo ""
echo "  Check alarm states:"
echo "    ./cost_monitoring.sh --status"
echo ""
