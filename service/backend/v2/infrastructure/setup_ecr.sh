#!/bin/bash
# =============================================================================
# Provision ECR repository for the Chat Agent (used from TASK-4.1 onwards).
# =============================================================================
#
# Per backend/v2/.clauderules rule #4, Claude Code must NOT call
# `aws ecr create-repository` on its own. This script therefore defaults to
# dry-run (prints the exact AWS CLI commands it would run) and requires an
# explicit `--apply` flag from a human operator before touching AWS.
#
# Repository spec (matches backend/v2/CLAUDE.md §5 and the TASK-0.3 guideline):
#   name               sedaily-mbti-chat-agent
#   region             us-east-1
#   image scanning     scanOnPush=true
#   tag mutability     MUTABLE     (:latest must be overwritable)
#   lifecycle          keep last 10 images (tagStatus: any)
#
# Usage:
#   ./setup_ecr.sh                 — dry-run (default, nothing created)
#   ./setup_ecr.sh --dry-run       — explicit dry-run (same as above)
#   ./setup_ecr.sh --apply         — actually create / update resources
#   ./setup_ecr.sh --status        — query current state (read-only)
#   ./setup_ecr.sh --help | -h     — this help text
#
# Idempotent: safe to re-run with --apply. If the repository already exists,
# creation is skipped; the lifecycle policy is always re-applied (put is an
# overwrite, so the same input yields the same result).
# =============================================================================

set -e

# Script directory (for potential future relative-path needs).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Configuration ────────────────────────────────────────────────────────────
REGION="us-east-1"
REPO_NAME="sedaily-mbti-chat-agent"
IMAGE_RETENTION_COUNT=10

# ── Usage helper ─────────────────────────────────────────────────────────────
print_usage() {
  cat <<EOF
setup_ecr.sh — Provision ECR repository for the v2 Chat Agent.

Default behavior is dry-run: AWS CLI commands are printed, NOT executed.
Pass --apply to actually create the repository. Safe to re-run.

Flags:
  (none)         dry-run (print commands only, no AWS changes)
  --dry-run      dry-run (explicit)
  --apply        execute commands (creates / updates resources)
  --status       read-only query of current state
  --help | -h    show this message

Target: ${REPO_NAME} in ${REGION}
  scanning        scanOnPush=true
  mutability      MUTABLE (:latest overwrite allowed)
  lifecycle       keep last ${IMAGE_RETENTION_COUNT} images (any tag status)
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

# ── --status (read-only) ─────────────────────────────────────────────────────
if [ "$MODE" = "status" ]; then
  REPO_JSON=$(aws ecr describe-repositories \
    --repository-names "$REPO_NAME" \
    --region "$REGION" \
    --output json 2>/dev/null || true)

  if [ -z "$REPO_JSON" ]; then
    echo "Repository '$REPO_NAME' not found in region $REGION."
    exit 1
  fi

  printf '%s' "$REPO_JSON" | python3 -c '
import json, sys
r = json.load(sys.stdin)["repositories"][0]
print(f"Name:            {r[\"repositoryName\"]}")
print(f"URI:             {r[\"repositoryUri\"]}")
print(f"Created:         {r[\"createdAt\"]}")
print(f"Scan on push:    {r[\"imageScanningConfiguration\"][\"scanOnPush\"]}")
print(f"Tag mutability:  {r[\"imageTagMutability\"]}")
'

  echo ""
  echo "Lifecycle policy:"
  LIFECYCLE_TEXT=$(aws ecr get-lifecycle-policy \
    --repository-name "$REPO_NAME" \
    --region "$REGION" \
    --query 'lifecyclePolicyText' \
    --output text 2>/dev/null || true)
  if [ -z "$LIFECYCLE_TEXT" ] || [ "$LIFECYCLE_TEXT" = "None" ]; then
    echo "  (not set)"
  else
    printf '%s' "$LIFECYCLE_TEXT" | python3 -m json.tool | sed 's/^/  /'
  fi
  exit 0
fi

# ── Banner ───────────────────────────────────────────────────────────────────
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "UNKNOWN")

if [ "$MODE" = "apply" ]; then
  echo "[APPLY]   AWS Account: $AWS_ACCOUNT_ID, Region: $REGION"
else
  echo "[DRY RUN] AWS Account: $AWS_ACCOUNT_ID, Region: $REGION"
  echo "          (no AWS resources will be created — re-run with --apply to commit)"
fi
echo ""

# ── 1. Check existence (idempotent) ──────────────────────────────────────────
echo "── 1. Check repository: $REPO_NAME ──"
EXISTS="no"
if aws ecr describe-repositories \
  --repository-names "$REPO_NAME" \
  --region "$REGION" \
  > /dev/null 2>&1; then
  EXISTS="yes"
  echo "  Repository already exists — skipping create."
else
  echo "  Repository does not exist yet."
fi
echo ""

# ── 2. Create repository (only if missing) ───────────────────────────────────
if [ "$EXISTS" = "no" ]; then
  echo "── 2. Create repository ──"
  run_cmd aws ecr create-repository \
    --repository-name "$REPO_NAME" \
    --image-scanning-configuration scanOnPush=true \
    --image-tag-mutability MUTABLE \
    --region "$REGION"
  echo ""
fi

# ── 3. Lifecycle policy (always applied — put is an idempotent overwrite) ────
echo "── 3. Apply lifecycle policy (keep last $IMAGE_RETENTION_COUNT images) ──"

LIFECYCLE_POLICY=$(cat <<EOF
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last $IMAGE_RETENTION_COUNT images (any tag status)",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": $IMAGE_RETENTION_COUNT
      },
      "action": {
        "type": "expire"
      }
    }
  ]
}
EOF
)

run_cmd aws ecr put-lifecycle-policy \
  --repository-name "$REPO_NAME" \
  --lifecycle-policy-text "$LIFECYCLE_POLICY" \
  --region "$REGION"
echo ""

# ── Summary / next steps ─────────────────────────────────────────────────────
REPO_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}"

if [ "$MODE" = "apply" ]; then
  echo "── Summary ──"
  echo "  Repository URI: $REPO_URI"
  echo ""
  echo "  Next steps (Chat Agent, TASK-4.1+):"
  echo "    1. Build & tag an ARM64 image"
  echo "       docker buildx build --platform linux/arm64 -t chat-agent:local ."
  echo "    2. Login to ECR"
  echo "       aws ecr get-login-password --region $REGION \\"
  echo "         | docker login --username AWS --password-stdin \\"
  echo "           $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
  echo "    3. Tag & push"
  echo "       docker tag chat-agent:local $REPO_URI:\$GIT_SHA"
  echo "       docker tag chat-agent:local $REPO_URI:latest"
  echo "       docker push $REPO_URI:\$GIT_SHA"
  echo "       docker push $REPO_URI:latest"
else
  echo "[DRY RUN] Re-run with --apply to create / update the resources above."
fi
