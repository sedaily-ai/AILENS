#!/bin/bash
# =============================================================================
# Register EventBridge rule to invoke Core 1 Collector every 3 hours (TASK-2.2).
# =============================================================================
#
# Per backend/v2/.clauderules rule #4, Claude Code may create AWS resources
# when (a) plan documented, (b) user approved, (c) cost confirmed, (d) each
# create announced, (e) IDs tracked, (f) stop on anomaly. All six are met
# for this script — see the TASK-2.2 session plan in the PR description.
#
# Resources created:
#   1. EventBridge rule `sedaily-mbti-v2-collector-schedule`
#      cron(0 0/3 * * ? *) UTC  →  fires at 00/03/06/09/12/15/18/21 UTC
#                                  (09/12/15/18/21/00/03/06 KST daily).
#      State: ENABLED — Collector Lambda already live-verified in TASK-2.1
#      (234 articles collected on 2026-04-22).
#   2. Lambda resource-policy statement on `sedaily-mbti-v2-collector-dev`
#      SID=EventBridgeV2CollectorSchedule, action=lambda:InvokeFunction.
#   3. Rule target → Collector Lambda ARN (Id=collector-lambda).
#
# Input: intentionally empty. The Collector handler's _extract_date() falls
# back to today KST via _today_kst() when neither event.date nor
# event.detail.date is set. See backend/v2/handlers/core1_collector.py.
# This is simpler than an input transformer and keeps EventBridge config
# free of time-zone math — the date contract lives in one place (Lambda).
#
# Cost: ~$0/month. EventBridge default bus is free; 240 Lambda invocations/
# month from this rule are rounding-error next to the existing Collector's
# per-run cost (Titan V2 embedding + pgvector/S3 writes).
#
# NOTE: The Transform trigger (rate(5 min), TASK-2.3 in TASKS.md) is
# intentionally NOT created here. It depends on `sedaily-mbti-v2-transform-dev`
# which does not yet exist. Add it in a follow-up PR when TASK-2.3 lands.
#
# Usage:
#   ./setup_eventbridge_v2.sh                 — dry-run (default, nothing created)
#   ./setup_eventbridge_v2.sh --dry-run       — explicit dry-run (same as above)
#   ./setup_eventbridge_v2.sh --apply         — actually create / update resources
#   ./setup_eventbridge_v2.sh --status        — read-only query of current state
#   ./setup_eventbridge_v2.sh --help | -h     — this help text
#
# Idempotent: safe to re-run with --apply. put-rule / put-targets are
# overwrite semantics; add-permission with an existing SID is caught and
# skipped (ResourceConflictException).
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Configuration ────────────────────────────────────────────────────────────
REGION="us-east-1"
LAMBDA_NAME="sedaily-mbti-v2-collector-dev"
RULE_NAME="sedaily-mbti-v2-collector-schedule"
SCHEDULE_EXPRESSION="cron(0 0/3 * * ? *)"
TARGET_ID="collector-lambda"
PERMISSION_SID="EventBridgeV2CollectorSchedule"

RULE_DESCRIPTION="Core 1 Collector 3-hour schedule. Fires at 00/03/06/09/12/15/18/21 UTC (09/12/15/18/21/00/03/06 KST). Empty payload — Lambda falls back to today's KST date via _today_kst()."

# ── Usage helper ─────────────────────────────────────────────────────────────
print_usage() {
  cat <<EOF
setup_eventbridge_v2.sh — Register EventBridge 3-hour schedule for Core 1 Collector.

Default behavior is dry-run: AWS CLI commands are printed, NOT executed.
Pass --apply to actually create/update the rule. Safe to re-run.

Flags:
  (none)         dry-run (print commands only, no AWS changes)
  --dry-run      dry-run (explicit)
  --apply        execute commands (creates / updates resources)
  --status       read-only query of current state
  --help | -h    show this message

Target: ${RULE_NAME} in ${REGION}
  schedule        ${SCHEDULE_EXPRESSION}
  fires at        00/03/06/09/12/15/18/21 UTC  (09/12/15/18/21/00/03/06 KST)
  target Lambda   ${LAMBDA_NAME}
  input           empty (Lambda falls back to today KST)
  state           ENABLED
EOF
}

# ── Flag parsing ─────────────────────────────────────────────────────────────
MODE="dry-run"
case "${1:-}" in
  "" | "--dry-run") MODE="dry-run" ;;
  "--apply")        MODE="apply" ;;
  "--status")       MODE="status" ;;
  "--help" | "-h")  print_usage; exit 0 ;;
  *)
    echo "ERROR: unknown flag '$1'" >&2
    echo "" >&2
    print_usage >&2
    exit 2
    ;;
esac

# ── Command runner ───────────────────────────────────────────────────────────
# Prints the command in both modes; executes only under --apply.
run_cmd() {
  echo "  \$ $*"
  if [ "$MODE" = "apply" ]; then
    "$@"
  fi
}

# ── Fetch immutable inputs (Lambda ARN, Account ID) ──────────────────────────
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "UNKNOWN")

LAMBDA_ARN=$(aws lambda get-function-configuration \
  --function-name "$LAMBDA_NAME" \
  --region "$REGION" \
  --query FunctionArn \
  --output text 2>/dev/null || true)

if [ -z "$LAMBDA_ARN" ] || [ "$LAMBDA_ARN" = "None" ]; then
  echo "ERROR: Lambda $LAMBDA_NAME not found in $REGION." >&2
  echo "       TASK-2.1 (Core 1 Collector Lambda) must be deployed first." >&2
  exit 1
fi

# Rule ARN is deterministic: arn:aws:events:<region>:<account>:rule/<name>.
# Constructing it ahead of creation lets add-permission reference it under
# both --dry-run (nothing created yet) and --apply (idempotent re-run).
RULE_ARN="arn:aws:events:${REGION}:${AWS_ACCOUNT_ID}:rule/${RULE_NAME}"

# ── --status (read-only) ─────────────────────────────────────────────────────
if [ "$MODE" = "status" ]; then
  echo "[STATUS] AWS Account: $AWS_ACCOUNT_ID, Region: $REGION"
  echo ""

  echo "── Rule: $RULE_NAME ──"
  if aws events describe-rule --name "$RULE_NAME" --region "$REGION" >/dev/null 2>&1; then
    aws events describe-rule --name "$RULE_NAME" --region "$REGION" \
      --query '{Name:Name,Arn:Arn,ScheduleExpression:ScheduleExpression,State:State,Description:Description}' \
      --output json | python3 -m json.tool | sed 's/^/  /'
  else
    echo "  (not found)"
    exit 1
  fi
  echo ""

  echo "── Targets ──"
  TARGETS_JSON=$(aws events list-targets-by-rule --rule "$RULE_NAME" --region "$REGION" \
    --query Targets --output json 2>/dev/null || echo "[]")
  if [ "$TARGETS_JSON" = "[]" ]; then
    echo "  (none)"
  else
    printf '%s' "$TARGETS_JSON" | python3 -m json.tool | sed 's/^/  /'
  fi
  echo ""

  echo "── Lambda Permission (SID=$PERMISSION_SID) ──"
  POLICY_JSON=$(aws lambda get-policy \
    --function-name "$LAMBDA_NAME" \
    --region "$REGION" \
    --query Policy --output text 2>/dev/null || echo "")
  if [ -z "$POLICY_JSON" ]; then
    echo "  (no resource policy set)"
  else
    printf '%s' "$POLICY_JSON" | python3 -c "
import json, sys
doc = json.loads(sys.stdin.read())
match = [s for s in doc.get('Statement', []) if s.get('Sid') == '$PERMISSION_SID']
if match:
    print(json.dumps(match[0], indent=2))
else:
    print('(SID $PERMISSION_SID not present; rule cannot invoke Lambda yet)')
" | sed 's/^/  /'
  fi
  exit 0
fi

# ── Banner ───────────────────────────────────────────────────────────────────
if [ "$MODE" = "apply" ]; then
  echo "[APPLY]   AWS Account: $AWS_ACCOUNT_ID, Region: $REGION"
else
  echo "[DRY RUN] AWS Account: $AWS_ACCOUNT_ID, Region: $REGION"
  echo "          (no AWS resources will be created — re-run with --apply to commit)"
fi
echo "          Lambda:       $LAMBDA_ARN"
echo "          Planned rule: $RULE_ARN"
echo ""

# ── 1. Check existing rule (stop-on-anomaly per .clauderules 4f) ─────────────
echo "── 1. Check rule: $RULE_NAME ──"
if aws events describe-rule --name "$RULE_NAME" --region "$REGION" >/dev/null 2>&1; then
  EXISTING_EXPR=$(aws events describe-rule --name "$RULE_NAME" --region "$REGION" \
    --query ScheduleExpression --output text)
  EXISTING_STATE=$(aws events describe-rule --name "$RULE_NAME" --region "$REGION" \
    --query State --output text)
  echo "  Rule exists: expression=$EXISTING_EXPR state=$EXISTING_STATE"

  if [ "$EXISTING_EXPR" != "$SCHEDULE_EXPRESSION" ]; then
    echo ""
    echo "  WARNING: existing schedule expression differs from planned."
    echo "    Existing: $EXISTING_EXPR"
    echo "    Planned:  $SCHEDULE_EXPRESSION"
    if [ "$MODE" = "apply" ]; then
      echo "  ABORT: refusing to overwrite an unrelated schedule. Review manually." >&2
      exit 1
    else
      echo "  (dry-run would abort under --apply — review before proceeding)"
    fi
  fi
else
  echo "  Rule does not exist yet."
fi
echo ""

# ── 2. put-rule (idempotent) ─────────────────────────────────────────────────
echo "── 2. Put rule ──"
echo "  [CREATE] rule $RULE_NAME ($SCHEDULE_EXPRESSION, ENABLED)"
run_cmd aws events put-rule \
  --name "$RULE_NAME" \
  --schedule-expression "$SCHEDULE_EXPRESSION" \
  --description "$RULE_DESCRIPTION" \
  --state ENABLED \
  --region "$REGION"
echo ""

# ── 3. Lambda add-permission (catch ResourceConflictException) ───────────────
echo "── 3. Grant EventBridge invoke permission on $LAMBDA_NAME ──"
echo "  [IAM] add-permission SID=$PERMISSION_SID principal=events.amazonaws.com"
if [ "$MODE" = "apply" ]; then
  TMP_ERR="$(mktemp -t setup-eventbridge-v2-perm.XXXXXX)"
  if aws lambda add-permission \
    --function-name "$LAMBDA_NAME" \
    --statement-id "$PERMISSION_SID" \
    --action "lambda:InvokeFunction" \
    --principal "events.amazonaws.com" \
    --source-arn "$RULE_ARN" \
    --region "$REGION" >/dev/null 2>"$TMP_ERR"; then
    echo "  permission added."
  elif grep -q "ResourceConflictException" "$TMP_ERR"; then
    echo "  permission already exists (SID=$PERMISSION_SID) — skipping (idempotent)."
  else
    echo "  add-permission failed:" >&2
    cat "$TMP_ERR" >&2
    rm -f "$TMP_ERR"
    exit 1
  fi
  rm -f "$TMP_ERR"
else
  echo "  \$ aws lambda add-permission \\"
  echo "      --function-name $LAMBDA_NAME \\"
  echo "      --statement-id $PERMISSION_SID \\"
  echo "      --action lambda:InvokeFunction \\"
  echo "      --principal events.amazonaws.com \\"
  echo "      --source-arn $RULE_ARN \\"
  echo "      --region $REGION"
fi
echo ""

# ── 4. put-targets (idempotent) ──────────────────────────────────────────────
# No --input argument: EventBridge's default Scheduled Event payload flows
# through to the Lambda. Its `detail` is an empty dict, which the handler's
# _extract_date() treats as "no date supplied" and falls back to today KST.
echo "── 4. Register Lambda as rule target ──"
echo "  [CREATE] target Id=$TARGET_ID → $LAMBDA_ARN"
run_cmd aws events put-targets \
  --rule "$RULE_NAME" \
  --targets "Id=${TARGET_ID},Arn=${LAMBDA_ARN}" \
  --region "$REGION"
echo ""

# ── 5. Summary + next fire ───────────────────────────────────────────────────
if [ "$MODE" = "apply" ]; then
  echo "── Session-created resources (rollback reference per .clauderules 4e) ──"
  echo "  Rule ARN:        $RULE_ARN"
  echo "  Target ID:       $TARGET_ID → $LAMBDA_ARN"
  echo "  Permission SID:  $PERMISSION_SID on $LAMBDA_NAME"
  echo "  Schedule:        $SCHEDULE_EXPRESSION  (UTC → KST +9h)"
  echo ""

  # Compute current + next scheduled fire time. Python is used (not bash
  # `date` arithmetic) because macOS BSD `date` and Linux GNU `date` have
  # divergent flag sets, and this script may run in either environment.
  TIME_INFO=$(python3 <<'PY'
from datetime import datetime, timedelta, timezone
KST = timezone(timedelta(hours=9))
now_utc = datetime.now(timezone.utc)
now_kst = now_utc.astimezone(KST)
slots = [0, 3, 6, 9, 12, 15, 18, 21]
today_slots = [now_utc.replace(hour=h, minute=0, second=0, microsecond=0) for h in slots]
future = [s for s in today_slots if s > now_utc]
nxt_utc = future[0] if future else today_slots[0] + timedelta(days=1)
nxt_kst = nxt_utc.astimezone(KST)
print(f"{now_utc.strftime('%Y-%m-%d %H:%M:%S UTC')}  ({now_kst.strftime('%Y-%m-%d %H:%M:%S KST')})")
print(f"{nxt_utc.strftime('%Y-%m-%d %H:%M UTC')}     ({nxt_kst.strftime('%Y-%m-%d %H:%M KST')})")
PY
  )
  NOW_LINE=$(printf '%s\n' "$TIME_INFO" | sed -n '1p')
  NEXT_LINE=$(printf '%s\n' "$TIME_INFO" | sed -n '2p')
  echo "[INFO] Current time:    $NOW_LINE"
  echo "[INFO] Next fire time:  $NEXT_LINE"
  echo "[INFO] Verify first fire (copy-paste):"
  echo "       aws logs tail /aws/lambda/$LAMBDA_NAME --since 1h --region $REGION --follow"
  echo ""

  echo "── Rollback commands (run in this order if the rule needs to go away) ──"
  echo "  aws events remove-targets --rule $RULE_NAME --ids $TARGET_ID --region $REGION"
  echo "  aws events delete-rule --name $RULE_NAME --region $REGION"
  echo "  aws lambda remove-permission --function-name $LAMBDA_NAME --statement-id $PERMISSION_SID --region $REGION"
else
  echo "[DRY RUN] Re-run with --apply to create the rule above."
fi
