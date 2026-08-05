#!/bin/bash
# =============================================================================
# Provision RDS PostgreSQL + pgvector for AI LENS Storage Hub (v2)
# =============================================================================
#
# Creates the v2 RDS PostgreSQL instance that backs the Storage Hub described
# in backend/v2/CLAUDE.md section 2 (Core 1/2 write, Core 3 read).
#
# Relationship to v1:
#   The v1 pgvector instance (sedaily-mbti-pgvector-dev) is untouched and
#   remains in production. v2 adds a SEPARATE instance in the same default VPC
#   with distinct credentials and env var names. v1/v2 isolation is enforced
#   at the env var layer per .clauderules #5 (PG_V2_HOST / PG_V2_PASSWORD only).
#
# Instance class: db.t3.small (v1 uses db.t3.micro)
# Cost delta: ~$14/month → ~$30/month (us-east-1, on-demand)
# Reason: v2 stores ALL collected articles (vs v1's ~30/day selection),
#         expecting ~7x data volume growth. Storage also 20GB → 50GB.
#
# What gets created:
#   1. Security group   — sedaily-mbti-pgvector-v2-sg (default VPC, port 5432)
#   2. DB subnet group  — sedaily-mbti-pgvector-v2-subnet (all default VPC subnets)
#   3. RDS instance     — sedaily-mbti-pgvector-v2-dev
#        Engine:    PostgreSQL 16.6
#        Instance:  db.t3.small (~$30/month)
#        Storage:   50 GB gp3
#        Database:  ailens_v2
#        Master user: ailens
#
# Takes ~10 minutes to become 'available'. pgvector extension + schema are
# created separately by v2/infrastructure/init_pgvector_v2.py (TASK-1.2).
#
# Usage:
#   ./provision_pgvector_v2.sh                  # Create RDS instance
#   ./provision_pgvector_v2.sh --dry-run        # Print commands only
#   ./provision_pgvector_v2.sh --status         # Check instance status
#   ./provision_pgvector_v2.sh --endpoint       # Print connection endpoint
#
# Per .clauderules #4, Claude Code does NOT execute the create path. The
# human operator runs this script with PG_V2_PASSWORD set.
# =============================================================================

set -e

REGION="us-east-1"
DRY_RUN=false

DB_INSTANCE_ID="sedaily-mbti-pgvector-v2-dev"
DB_NAME="ailens_v2"
DB_USER="ailens"
DB_PORT="5432"
DB_INSTANCE_CLASS="db.t3.small"
DB_STORAGE_GB=50
DB_ENGINE_VERSION="16.6"
SG_NAME="sedaily-mbti-pgvector-v2-sg"
SUBNET_GROUP="sedaily-mbti-pgvector-v2-subnet"

# Password from env or prompt
DB_PASSWORD="${PG_V2_PASSWORD:-}"

if [ "$1" = "--dry-run" ]; then
  DRY_RUN=true
  echo "[DRY RUN]"
  echo ""
fi

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "UNKNOWN")
echo "AWS Account: $AWS_ACCOUNT_ID"
echo ""

# ── Status check ─────────────────────────────────────────────────────────────

if [ "$1" = "--status" ]; then
  echo "Checking RDS instance status..."
  aws rds describe-db-instances \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --region "$REGION" \
    --query 'DBInstances[0].{Status:DBInstanceStatus,Endpoint:Endpoint.Address,Port:Endpoint.Port,Engine:Engine,EngineVersion:EngineVersion,Class:DBInstanceClass}' \
    --output table 2>&1 || echo "Instance not found."
  exit 0
fi

if [ "$1" = "--endpoint" ]; then
  ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --region "$REGION" \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text 2>/dev/null)
  if [ "$ENDPOINT" = "None" ] || [ -z "$ENDPOINT" ]; then
    echo "Instance not ready yet or not found."
    exit 1
  fi
  echo "$ENDPOINT"
  exit 0
fi

# ── Password check ───────────────────────────────────────────────────────────

if [ -z "$DB_PASSWORD" ] && [ "$DRY_RUN" = false ]; then
  echo "ERROR: PG_V2_PASSWORD environment variable is required."
  echo ""
  echo "  export PG_V2_PASSWORD='your-secure-password'"
  echo "  ./provision_pgvector_v2.sh"
  exit 1
fi

# =============================================================================
# 1. SECURITY GROUP
# =============================================================================
echo "── 1. Security Group: ${SG_NAME} ──"

DEFAULT_VPC=$(aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --region "$REGION" \
  --query 'Vpcs[0].VpcId' \
  --output text 2>/dev/null)

echo "  Default VPC: $DEFAULT_VPC"

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] Would create security group in VPC $DEFAULT_VPC"
else
  # Check if SG exists
  EXISTING_SG=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=$SG_NAME" "Name=vpc-id,Values=$DEFAULT_VPC" \
    --region "$REGION" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null)

  if [ "$EXISTING_SG" != "None" ] && [ -n "$EXISTING_SG" ]; then
    SG_ID="$EXISTING_SG"
    echo "  Security group exists: $SG_ID"
  else
    SG_ID=$(aws ec2 create-security-group \
      --group-name "$SG_NAME" \
      --description "RDS pgvector v2 access for AI LENS v2 Lambda functions" \
      --vpc-id "$DEFAULT_VPC" \
      --region "$REGION" \
      --query 'GroupId' \
      --output text)

    # Allow PostgreSQL from within VPC (Lambda functions)
    VPC_CIDR=$(aws ec2 describe-vpcs \
      --vpc-ids "$DEFAULT_VPC" \
      --region "$REGION" \
      --query 'Vpcs[0].CidrBlock' \
      --output text)

    aws ec2 authorize-security-group-ingress \
      --group-id "$SG_ID" \
      --protocol tcp \
      --port 5432 \
      --cidr "$VPC_CIDR" \
      --region "$REGION" > /dev/null

    # Allow from local dev (current IP)
    MY_IP=$(curl -s https://checkip.amazonaws.com)
    aws ec2 authorize-security-group-ingress \
      --group-id "$SG_ID" \
      --protocol tcp \
      --port 5432 \
      --cidr "${MY_IP}/32" \
      --region "$REGION" > /dev/null 2>&1 || true

    echo "  Created: $SG_ID (VPC CIDR: $VPC_CIDR, dev IP: $MY_IP)"
  fi
fi

echo ""

# =============================================================================
# 2. DB SUBNET GROUP
# =============================================================================
echo "── 2. DB Subnet Group ──"

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] Would create DB subnet group: $SUBNET_GROUP"
else
  SUBNETS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$DEFAULT_VPC" \
    --region "$REGION" \
    --query 'Subnets[*].SubnetId' \
    --output text)

  SUBNET_LIST=$(echo "$SUBNETS" | tr '\t' ' ')

  # Create or skip if exists
  aws rds create-db-subnet-group \
    --db-subnet-group-name "$SUBNET_GROUP" \
    --db-subnet-group-description "Subnets for pgvector v2 RDS" \
    --subnet-ids $SUBNET_LIST \
    --region "$REGION" > /dev/null 2>&1 || echo "  Subnet group already exists"

  echo "  [OK] $SUBNET_GROUP"
fi

echo ""

# =============================================================================
# 3. RDS INSTANCE
# =============================================================================
echo "── 3. RDS Instance: ${DB_INSTANCE_ID} ──"
echo ""
echo "  Engine:   PostgreSQL ${DB_ENGINE_VERSION}"
echo "  Instance: ${DB_INSTANCE_CLASS} (~\$30/month)"
echo "  Storage:  ${DB_STORAGE_GB} GB gp3"
echo "  Database: ${DB_NAME}"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] aws rds create-db-instance --db-instance-identifier $DB_INSTANCE_ID ..."
else
  # Check if instance already exists
  EXISTING=$(aws rds describe-db-instances \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --region "$REGION" \
    --query 'DBInstances[0].DBInstanceStatus' \
    --output text 2>/dev/null || echo "NONE")

  if [ "$EXISTING" != "NONE" ]; then
    echo "  Instance exists (status: $EXISTING)"
    if [ "$EXISTING" = "available" ]; then
      ENDPOINT=$(aws rds describe-db-instances \
        --db-instance-identifier "$DB_INSTANCE_ID" \
        --region "$REGION" \
        --query 'DBInstances[0].Endpoint.Address' \
        --output text)
      echo "  Endpoint: $ENDPOINT"
    fi
  else
    echo "  Creating instance (takes ~10 minutes)..."

    aws rds create-db-instance \
      --db-instance-identifier "$DB_INSTANCE_ID" \
      --db-instance-class "$DB_INSTANCE_CLASS" \
      --engine postgres \
      --engine-version "$DB_ENGINE_VERSION" \
      --allocated-storage "$DB_STORAGE_GB" \
      --storage-type gp3 \
      --db-name "$DB_NAME" \
      --master-username "$DB_USER" \
      --master-user-password "$DB_PASSWORD" \
      --vpc-security-group-ids "$SG_ID" \
      --db-subnet-group-name "$SUBNET_GROUP" \
      --publicly-accessible \
      --no-multi-az \
      --backup-retention-period 1 \
      --no-auto-minor-version-upgrade \
      --region "$REGION" \
      --output text \
      --query 'DBInstance.DBInstanceStatus'

    echo ""
    echo "  [OK] Instance creation initiated"
    echo ""
    echo "  *** Takes ~10 minutes to become available ***"
  fi
fi

echo ""

# =============================================================================
# POST-CREATION STEPS
# =============================================================================
echo "── Next steps ──"
echo ""
echo "  1. Wait 5-10 min for RDS to become 'available'"
echo "       ./provision_pgvector_v2.sh --status"
echo ""
echo "  2. Run: python3 v2/infrastructure/init_pgvector_v2.py --apply"
echo "       (creates tables + CREATE EXTENSION vector — TASK-1.2)"
echo ""
echo "  3. Set PG_V2_HOST, PG_V2_PASSWORD env vars on v2 Lambdas (Phase 2+)"
echo "       (manual via AWS Console — .clauderules #4)"
echo ""

# =============================================================================
# CLEANUP (commented out — keep for reference, never auto-run)
# =============================================================================
# aws rds delete-db-instance \
#   --db-instance-identifier sedaily-mbti-pgvector-v2-dev \
#   --skip-final-snapshot \
#   --region us-east-1
# aws rds wait db-instance-deleted --db-instance-identifier sedaily-mbti-pgvector-v2-dev --region us-east-1
# aws rds delete-db-subnet-group --db-subnet-group-name sedaily-mbti-pgvector-v2-subnet --region us-east-1
# aws ec2 delete-security-group --group-id $SG_ID --region us-east-1
