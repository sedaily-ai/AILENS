#!/bin/bash
# Apply CloudWatch dashboard from JSON definition.
#
# Usage: ./apply-dashboard.sh [dashboard-name]
# Default name: sedaily-mbti-v2-bedrock-cost
#
# Idempotent — re-running overwrites with the latest JSON.

set -euo pipefail

DASHBOARD_NAME="${1:-sedaily-mbti-v2-bedrock-cost}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JSON_FILE="$SCRIPT_DIR/bedrock-cost.json"
REGION=us-east-1

if [[ ! -f "$JSON_FILE" ]]; then
    echo "ERROR: $JSON_FILE not found" >&2
    exit 1
fi

# Validate JSON
python3 -c "import json; json.load(open('$JSON_FILE'))" || {
    echo "ERROR: Invalid JSON in $JSON_FILE" >&2
    exit 1
}

echo "Applying dashboard '$DASHBOARD_NAME' in $REGION ..."

aws cloudwatch put-dashboard \
    --dashboard-name "$DASHBOARD_NAME" \
    --dashboard-body "file://$JSON_FILE" \
    --region "$REGION"

echo ""
echo "✓ Dashboard applied. View at:"
echo "  https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=$DASHBOARD_NAME"
echo ""
echo "Note: metric 첫 datapoint는 다음 Bedrock 호출 시 emit. Cost-1b 가 5da37f8 commit 이후 fire 한 transform/embed 부터 적재됨."
