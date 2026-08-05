#!/bin/bash
# =============================================================================
# Register EventBridge rule to invoke Core 2 Transform every 5 minutes (TASK-2.3).
# =============================================================================
#
# Per backend/v2/.clauderules rule #4, Claude Code may create AWS resources
# when (a) plan documented, (b) user approved, (c) cost confirmed, (d) each
# create announced, (e) IDs tracked, (f) stop on anomaly. All six are met
# for this script — see the TASK-2.3 Phase E handover in PR description.
#
# Resources created:
#   1. EventBridge rule `sedaily-mbti-v2-transform-trigger`
#      rate(5 minutes)  →  fires every 5 minutes
#      State: DISABLED at creation. The Transform Lambda is cost-sensitive
#      (Opus 4.6 input/output tokens ~$0.93/article at current sizing;
#      20 articles/fire × 12 fires/hour ≈ $220/hour if a backlog exists,
#      tapering to ~$220/day when steady-state at 300 articles/day).
#      Enable explicitly when ready:
#        aws events enable-rule --name sedaily-mbti-v2-transform-trigger --region us-east-1
#   2. Lambda resource-policy statement on `sedaily-mbti-v2-transform-dev`
#      SID=EventBridgeV2TransformTrigger, action=lambda:InvokeFunction.
#   3. Rule target → Transform Lambda ARN (Id=transform-lambda).
#
# Input: intentionally empty. The Transform handler polls pgvector for raw
# articles — no date/ID needed in the event.
#
# Why a separate script (not a target flag on setup_eventbridge_v2.sh):
# the collector script hardcodes its config (rule name, schedule, Lambda,
# description, time-zone math in the summary) and is already in production
# for TASK-2.2. Parameterising it risks breaking the live schedule. A
# dedicated script for the transform trigger mirrors the same pattern at
# low refactor risk.
#
# Usage:
#   ./setup_transform_trigger.sh                 — dry-run (default)
#   ./setup_transform_trigger.sh --dry-run       — explicit dry-run
#   ./setup_transform_trigger.sh --apply         — create resources (state=DISABLED)
#   ./setup_transform_trigger.sh --enable        — enable an already-created rule
#   ./setup_transform_trigger.sh --disable       — disable the rule (emergency stop)
#   ./setup_transform_trigger.sh --status        — read-only query of current state
#   ./setup_transform_trigger.sh --help | -h     — this help text
#
# Idempotent: safe to re-run with --apply. put-rule / put-targets are
# overwrite semantics; add-permission with an existing SID is caught and
# skipped (ResourceConflictException).
# =============================================================================

set -e

# ── Configuration ────────────────────────────────────────────────────────────
REGION="us-east-1"
LAMBDA_NAME="sedaily-mbti-v2-transform-dev"
RULE_NAME="sedaily-mbti-v2-transform-trigger"
SCHEDULE_EXPRESSION="rate(5 minutes)"
TARGET_ID="transform-lambda"
PERMISSION_SID="EventBridgeV2TransformTrigger"
INITIAL_STATE="DISABLED"

RULE_DESCRIPTION="Core 2 Transform 5-minute trigger. Polls pgvector for raw articles and runs Opus 4.6 on up to BATCH_SIZE=20 per fire. Empty payload — handler polls independently."

# ── Usage helper ─────────────────────────────────────────────────────────────
print_usage() {
  cat <<EOF
setup_transform_trigger.sh — Register EventBridge 5-minute trigger for Core 2 Transform.

Default behavior is dry-run: AWS CLI commands are printed, NOT executed.
Pass --apply to actually create/update the rule. Safe to re-run.

Flags:
  (none)         dry-run (print commands only, no AWS changes)
  --dry-run      dry-run (explicit)
  --apply        execute commands (creates resources in DISABLED state)
  --enable       enable an existing disabled rule
  --disable      disable the rule (emergency stop)
  --status       read-only query of current state
  --help | -h    show this message

Target: ${RULE_NAME} in ${REGION}
  schedule        ${SCHEDULE_EXPRESSION}
  target Lambda   ${LAMBDA_NAME}
  input           empty (handler polls pgvector independently)
  initial state   ${INITIAL_STATE} (Opus cost safety — enable explicitly)
EOF
}

# ── Flag parsing ─────────────────────────────────────────────────────────────
MODE="dry-run"
case "${1:-}" in
  "" | "--dry-run") MODE="dry-run" ;;
  "--apply")        MODE="apply" ;;
  "--enable")       MODE="enable" ;;
  "--disable")      MODE="disable" ;;
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
run_cmd() {
  echo "  \$ $*"
  if [ "$MODE" = "apply" ]; then
    "$@"
  fi
}

# ── Fetch immutable inputs ───────────────────────────────────────────────────
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "UNKNOWN")

LAMBDA_ARN=$(aws lambda get-function-configuration \
  --function-name "$LAMBDA_NAME" \
  --region "$REGION" \
  --query FunctionArn \
  --output text 2>/dev/null || true)

if [ -z "$LAMBDA_ARN" ] || [ "$LAMBDA_ARN" = "None" ]; then
  echo "ERROR: Lambda $LAMBDA_NAME not found in $REGION." >&2
  echo "       TASK-2.3 Phase C must be complete first (Lambda config + IAM)." >&2
  exit 1
fi

RULE_ARN="arn:aws:events:${REGION}:${AWS_ACCOUNT_ID}:rule/${RULE_NAME}"

# ── --enable / --disable (fast paths) ────────────────────────────────────────
if [ "$MODE" = "enable" ]; then
  echo "[ENABLE] $RULE_NAME"
  aws events enable-rule --name "$RULE_NAME" --region "$REGION"
  echo "  Now firing every 5 minutes. Monitor:"
  echo "    aws logs tail /aws/lambda/$LAMBDA_NAME --since 10m --region $REGION --follow"
  exit 0
fi

if [ "$MODE" = "disable" ]; then
  echo "[DISABLE] $RULE_NAME"
  aws events disable-rule --name "$RULE_NAME" --region "$REGION"
  echo "  Rule disabled — no new fires. In-flight invocations will complete."
  exit 0
fi

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
echo "          Initial state: $INITIAL_STATE (cost-safety; enable with --enable)"
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

# ── 2. put-rule (idempotent, starts DISABLED) ────────────────────────────────
echo "── 2. Put rule ──"
echo "  [CREATE] rule $RULE_NAME ($SCHEDULE_EXPRESSION, $INITIAL_STATE)"
run_cmd aws events put-rule \
  --name "$RULE_NAME" \
  --schedule-expression "$SCHEDULE_EXPRESSION" \
  --description "$RULE_DESCRIPTION" \
  --state "$INITIAL_STATE" \
  --region "$REGION"
echo ""

# ── 3. Lambda add-permission (catch ResourceConflictException) ───────────────
echo "── 3. Grant EventBridge invoke permission on $LAMBDA_NAME ──"
echo "  [IAM] add-permission SID=$PERMISSION_SID principal=events.amazonaws.com"
if [ "$MODE" = "apply" ]; then
  TMP_ERR="$(mktemp -t setup-transform-trigger-perm.XXXXXX)"
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
echo "── 4. Register Lambda as rule target ──"
echo "  [CREATE] target Id=$TARGET_ID → $LAMBDA_ARN"
run_cmd aws events put-targets \
  --rule "$RULE_NAME" \
  --targets "Id=${TARGET_ID},Arn=${LAMBDA_ARN}" \
  --region "$REGION"
echo ""

# ── 5. Summary + next steps ──────────────────────────────────────────────────
if [ "$MODE" = "apply" ]; then
  echo "── Session-created resources (rollback reference per .clauderules 4e) ──"
  echo "  Rule ARN:        $RULE_ARN"
  echo "  Target ID:       $TARGET_ID → $LAMBDA_ARN"
  echo "  Permission SID:  $PERMISSION_SID on $LAMBDA_NAME"
  echo "  Schedule:        $SCHEDULE_EXPRESSION"
  echo "  State:           $INITIAL_STATE"
  echo ""
  echo "[NEXT] Rule is DISABLED. To enable 5-min firing:"
  echo "       ./v2/infrastructure/setup_transform_trigger.sh --enable"
  echo ""
  echo "[MONITOR] Once enabled:"
  echo "       aws logs tail /aws/lambda/$LAMBDA_NAME --since 10m --region $REGION --follow"
  echo ""
  echo "── Rollback commands (run in this order if the rule needs to go away) ──"
  echo "  aws events disable-rule --name $RULE_NAME --region $REGION"
  echo "  aws events remove-targets --rule $RULE_NAME --ids $TARGET_ID --region $REGION"
  echo "  aws events delete-rule --name $RULE_NAME --region $REGION"
  echo "  aws lambda remove-permission --function-name $LAMBDA_NAME --statement-id $PERMISSION_SID --region $REGION"
else
  echo "[DRY RUN] Re-run with --apply to create the rule above (will start DISABLED)."
fi
