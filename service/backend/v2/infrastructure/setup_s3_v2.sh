#!/bin/bash
# =============================================================================
# Provision S3 bucket for AI LENS v2 article body storage (TASK-1.4).
# =============================================================================
#
# Per backend/v2/.clauderules rule #4, Claude Code must NOT call
# `aws s3api create-bucket` on its own. This script therefore defaults to
# dry-run (prints the exact AWS CLI commands it would run) and requires an
# explicit `--apply` flag from a human operator before touching AWS.
#
# Bucket spec (matches backend/v2/CLAUDE.md §5 and the TASK-1.4 guideline):
#   name            sedaily-mbti-article-body-v2-dev
#   region          us-east-1
#   ACLs            private + full public-access block
#   encryption      SSE-S3 (AES256)
#   lifecycle       articles/ prefix → GLACIER_IR after 90 days
#   CORS            GET/HEAD from https://mbti.sedaily.ai + http://localhost:3000
#
# Storage class choice: GLACIER_IR (Instant Retrieval) rather than GLACIER
# (Flexible Retrieval). Archived articles must stay reachable via /api/archive
# and Phase 3 kNN search; Flexible Retrieval's minutes-to-hours restore would
# break that UX, whereas GLACIER_IR preserves sub-second reads at ~83% cost
# reduction vs Standard ($0.023 → $0.004 /GB/month).
#
# NOTE: Versioning intentionally OFF. Enable later with
# `aws s3api put-bucket-versioning` if prompt improvements trigger frequent
# overwrites requiring historical recovery.
#
# Usage:
#   ./setup_s3_v2.sh                 — dry-run (default, nothing created)
#   ./setup_s3_v2.sh --dry-run       — explicit dry-run (same as above)
#   ./setup_s3_v2.sh --apply         — actually create / update resources
#   ./setup_s3_v2.sh --status        — query current state (read-only)
#   ./setup_s3_v2.sh --help | -h     — this help text
#
# Idempotent: safe to re-run with --apply. If the bucket already exists,
# creation is skipped; all configuration puts are idempotent overwrites.
# =============================================================================

set -e

# Script directory (for potential future relative-path needs).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Configuration ────────────────────────────────────────────────────────────
REGION="us-east-1"
BUCKET_NAME="sedaily-mbti-article-body-v2-dev"
LIFECYCLE_PREFIX="articles/"
LIFECYCLE_TRANSITION_DAYS=90
LIFECYCLE_STORAGE_CLASS="GLACIER_IR"

# ── Usage helper ─────────────────────────────────────────────────────────────
print_usage() {
  cat <<EOF
setup_s3_v2.sh — Provision S3 bucket for v2 article body storage.

Default behavior is dry-run: AWS CLI commands are printed, NOT executed.
Pass --apply to actually create/update the bucket. Safe to re-run.

Flags:
  (none)         dry-run (print commands only, no AWS changes)
  --dry-run      dry-run (explicit)
  --apply        execute commands (creates / updates resources)
  --status       read-only query of current state
  --help | -h    show this message

Target: ${BUCKET_NAME} in ${REGION}
  public access   blocked (all four settings)
  encryption      SSE-S3 (AES256)
  lifecycle       ${LIFECYCLE_PREFIX} → ${LIFECYCLE_STORAGE_CLASS} after ${LIFECYCLE_TRANSITION_DAYS} days
  CORS            GET/HEAD from https://mbti.sedaily.ai + http://localhost:3000
  versioning      OFF (intentional, see header comment)
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

# ── JSON policy documents (built once, reused in apply + status diffing) ─────
LIFECYCLE_POLICY=$(cat <<EOF
{
  "Rules": [
    {
      "ID": "ArchiveArticleBodiesAfter${LIFECYCLE_TRANSITION_DAYS}Days",
      "Status": "Enabled",
      "Filter": {"Prefix": "${LIFECYCLE_PREFIX}"},
      "Transitions": [
        {"Days": ${LIFECYCLE_TRANSITION_DAYS}, "StorageClass": "${LIFECYCLE_STORAGE_CLASS}"}
      ]
    }
  ]
}
EOF
)

CORS_POLICY=$(cat <<'EOF'
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "https://mbti.sedaily.ai",
        "http://localhost:3000"
      ],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
      "MaxAgeSeconds": 3600
    }
  ]
}
EOF
)

ENCRYPTION_CONFIG='{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Compact (single-line) variants for AWS CLI. Pretty heredocs above are kept
# for human-readable echo; the CLI receives the compact form so dry-run
# command output stays on one line.
LIFECYCLE_POLICY_COMPACT=$(printf '%s' "$LIFECYCLE_POLICY" \
  | python3 -c 'import sys, json; print(json.dumps(json.load(sys.stdin), separators=(",", ":")))')
CORS_POLICY_COMPACT=$(printf '%s' "$CORS_POLICY" \
  | python3 -c 'import sys, json; print(json.dumps(json.load(sys.stdin), separators=(",", ":")))')

# ── --status (read-only) ─────────────────────────────────────────────────────
if [ "$MODE" = "status" ]; then
  AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "UNKNOWN")
  echo "[STATUS] AWS Account: $AWS_ACCOUNT_ID, Region: $REGION"
  echo ""

  echo "── Bucket: $BUCKET_NAME ──"
  if aws s3api head-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null; then
    echo "  Exists: yes"
  else
    echo "  Exists: no"
    exit 1
  fi
  echo ""

  echo "── Public Access Block ──"
  PAB_JSON=$(aws s3api get-public-access-block \
    --bucket "$BUCKET_NAME" --region "$REGION" \
    --query PublicAccessBlockConfiguration --output json 2>/dev/null || true)
  if [ -z "$PAB_JSON" ]; then
    echo "  (not set)"
  else
    printf '%s' "$PAB_JSON" | python3 -m json.tool | sed 's/^/  /'
  fi
  echo ""

  echo "── Default Encryption ──"
  ENC_JSON=$(aws s3api get-bucket-encryption \
    --bucket "$BUCKET_NAME" --region "$REGION" \
    --query ServerSideEncryptionConfiguration --output json 2>/dev/null || true)
  if [ -z "$ENC_JSON" ]; then
    echo "  (not set)"
  else
    printf '%s' "$ENC_JSON" | python3 -m json.tool | sed 's/^/  /'
  fi
  echo ""

  echo "── Lifecycle Configuration ──"
  LIFECYCLE_JSON=$(aws s3api get-bucket-lifecycle-configuration \
    --bucket "$BUCKET_NAME" --region "$REGION" \
    --output json 2>/dev/null || true)
  if [ -z "$LIFECYCLE_JSON" ]; then
    echo "  (not set)"
  else
    printf '%s' "$LIFECYCLE_JSON" | python3 -m json.tool | sed 's/^/  /'
  fi
  echo ""

  echo "── CORS Configuration ──"
  CORS_JSON=$(aws s3api get-bucket-cors \
    --bucket "$BUCKET_NAME" --region "$REGION" \
    --output json 2>/dev/null || true)
  if [ -z "$CORS_JSON" ]; then
    echo "  (not set)"
  else
    printf '%s' "$CORS_JSON" | python3 -m json.tool | sed 's/^/  /'
  fi
  echo ""

  echo "── Versioning ──"
  VERSIONING=$(aws s3api get-bucket-versioning \
    --bucket "$BUCKET_NAME" --region "$REGION" \
    --query Status --output text 2>/dev/null || echo "")
  if [ -z "$VERSIONING" ] || [ "$VERSIONING" = "None" ]; then
    echo "  Disabled (expected — see header comment)"
  else
    echo "  $VERSIONING"
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
echo "── 1. Check bucket: $BUCKET_NAME ──"
EXISTS="no"
if aws s3api head-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null; then
  EXISTS="yes"
  echo "  Bucket already exists — skipping create."
else
  echo "  Bucket does not exist yet."
fi
echo ""

# ── 2. Create bucket (only if missing) ───────────────────────────────────────
# us-east-1 must NOT receive --create-bucket-configuration LocationConstraint.
# (For us-east-1 the constraint defaults correctly; passing it causes
#  InvalidLocationConstraint on some SDK/CLI versions.)
if [ "$EXISTS" = "no" ]; then
  echo "── 2. Create bucket ──"
  run_cmd aws s3api create-bucket \
    --bucket "$BUCKET_NAME" \
    --region "$REGION"
  echo ""
fi

# ── 3. Public Access Block (always re-applied — put is overwrite) ────────────
echo "── 3. Apply public access block (block all public access) ──"
run_cmd aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --region "$REGION"
echo ""

# ── 4. Default Encryption (SSE-S3 / AES256) ──────────────────────────────────
# Newly created buckets have SSE-S3 on by default since 2023-01, but we set it
# explicitly so the intent is readable in code review and survives any future
# AWS default changes.
echo "── 4. Apply default encryption (SSE-S3 / AES256) ──"
run_cmd aws s3api put-bucket-encryption \
  --bucket "$BUCKET_NAME" \
  --server-side-encryption-configuration "$ENCRYPTION_CONFIG" \
  --region "$REGION"
echo ""

# ── 5. Lifecycle Configuration ───────────────────────────────────────────────
echo "── 5. Apply lifecycle (${LIFECYCLE_PREFIX} → ${LIFECYCLE_STORAGE_CLASS} after ${LIFECYCLE_TRANSITION_DAYS} days) ──"
echo "  Policy:"
printf '%s' "$LIFECYCLE_POLICY" | python3 -m json.tool | sed 's/^/    /'
run_cmd aws s3api put-bucket-lifecycle-configuration \
  --bucket "$BUCKET_NAME" \
  --lifecycle-configuration "$LIFECYCLE_POLICY_COMPACT" \
  --region "$REGION"
echo ""

# ── 6. CORS Configuration ────────────────────────────────────────────────────
echo "── 6. Apply CORS (GET/HEAD from mbti.sedaily.ai + localhost:3000) ──"
echo "  Policy:"
printf '%s' "$CORS_POLICY" | python3 -m json.tool | sed 's/^/    /'
run_cmd aws s3api put-bucket-cors \
  --bucket "$BUCKET_NAME" \
  --cors-configuration "$CORS_POLICY_COMPACT" \
  --region "$REGION"
echo ""

# ── Summary / next steps ─────────────────────────────────────────────────────
BUCKET_URI="s3://${BUCKET_NAME}"

if [ "$MODE" = "apply" ]; then
  echo "── Summary ──"
  echo "  Bucket URI: $BUCKET_URI"
  echo "  Region:     $REGION"
  echo ""
  echo "  Next steps (Core 1/2, TASK-2.1+):"
  echo "    1. Core 1 Collector writes ${BUCKET_URI}/${LIFECYCLE_PREFIX}{news_id}/original.json"
  echo "    2. Core 2 Transform writes ${BUCKET_URI}/${LIFECYCLE_PREFIX}{news_id}/version_{NT|NF|ST|SF}.json"
  echo "    3. Grant v2 Lambda role s3:GetObject/s3:PutObject on ${BUCKET_URI}/*"
  echo "       (manual via AWS Console — .clauderules #4)"
  echo "    4. Set S3_ARTICLE_BODY_V2_BUCKET=$BUCKET_NAME on v2 Lambdas"
  echo "       (manual via AWS Console — .clauderules #4)"
else
  echo "[DRY RUN] Re-run with --apply to create / update the resources above."
fi
