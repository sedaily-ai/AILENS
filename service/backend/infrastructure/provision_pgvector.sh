#!/bin/bash
# =============================================================================
# Provision RDS PostgreSQL + pgvector for AI LENS Similarity Search
# =============================================================================
#
# Creates an RDS PostgreSQL instance with pgvector extension support.
# Takes ~10 minutes to create. Run ahead of or during the 4/16 meeting.
#
# What gets created:
#   1. DB subnet group (uses default VPC subnets)
#   2. Security group (allows Lambda + local dev access)
#   3. RDS instance: sedaily-mbti-pgvector-dev
#      - Engine: PostgreSQL 16.6
#      - Instance: db.t3.micro (~$14/month)
#      - Storage: 20 GB gp3
#      - DB name: sedaily_mbti
#   4. pgvector extension (enabled via post-creation SQL)
#
# After creation:
#   - Run tests/test_pgvector.py to init tables + verify
#   - Update PG_HOST/PG_PASSWORD in Lambda env vars
#
# Usage:
#   ./provision_pgvector.sh                  # Create RDS instance
#   ./provision_pgvector.sh --dry-run        # Print commands only
#   ./provision_pgvector.sh --status         # Check instance status
#   ./provision_pgvector.sh --endpoint       # Print connection endpoint
#   ./provision_pgvector.sh --init-ext       # Run CREATE EXTENSION vector
# =============================================================================

set -e

REGION="us-east-1"
DRY_RUN=false

DB_INSTANCE_ID="sedaily-mbti-pgvector-dev"
DB_NAME="ailens"
DB_USER="ailens"
DB_PORT="5432"
DB_INSTANCE_CLASS="db.t3.micro"
DB_STORAGE_GB=20
DB_ENGINE_VERSION="16.6"
SG_NAME="sedaily-mbti-pgvector-sg"

# Password from env or prompt
DB_PASSWORD="${PG_PASSWORD:-}"

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

# ── Init pgvector extension ──────────────────────────────────────────────────

if [ "$1" = "--init-ext" ]; then
  ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier "$DB_INSTANCE_ID" \
    --region "$REGION" \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text 2>/dev/null)

  if [ "$ENDPOINT" = "None" ] || [ -z "$ENDPOINT" ]; then
    echo "Instance not ready. Check --status first."
    exit 1
  fi

  if [ -z "$DB_PASSWORD" ]; then
    echo "Set PG_PASSWORD env var first."
    exit 1
  fi

  echo "Connecting to $ENDPOINT:$DB_PORT/$DB_NAME as $DB_USER..."
  echo "Running: CREATE EXTENSION IF NOT EXISTS vector"
  echo ""

  # Use pg8000 via Python since psql may not be installed
  python3 -c "
import pg8000.native
conn = pg8000.native.Connection(
    host='$ENDPOINT', port=$DB_PORT, database='$DB_NAME',
    user='$DB_USER', password='$DB_PASSWORD', ssl_context=True,
)
conn.run('CREATE EXTENSION IF NOT EXISTS vector')
print('pgvector extension enabled.')
result = conn.run(\"SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'\")
for row in result:
    print(f'  Extension: {row[0]} v{row[1]}')
conn.close()
"
  exit 0
fi

# ── Password check ───────────────────────────────────────────────────────────

if [ -z "$DB_PASSWORD" ] && [ "$DRY_RUN" = false ]; then
  echo "ERROR: PG_PASSWORD environment variable is required."
  echo ""
  echo "  export PG_PASSWORD='your-secure-password'"
  echo "  ./provision_pgvector.sh"
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
      --description "RDS pgvector access for AI LENS Lambda functions" \
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

SUBNET_GROUP="sedaily-mbti-pgvector-subnet"

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] Would create DB subnet group"
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
    --db-subnet-group-description "Subnets for pgvector RDS" \
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
echo "  Instance: ${DB_INSTANCE_CLASS} (~\$14/month)"
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
    echo ""
    echo "  Check status:   ./provision_pgvector.sh --status"
    echo "  Get endpoint:   ./provision_pgvector.sh --endpoint"
    echo "  Init extension: PG_PASSWORD=xxx ./provision_pgvector.sh --init-ext"
  fi
fi

echo ""

# =============================================================================
# POST-CREATION STEPS
# =============================================================================
echo "── Post-creation steps ──"
echo ""
echo "After instance is available:"
echo ""
echo "  # 1. Enable pgvector extension"
echo "  PG_PASSWORD=xxx ./provision_pgvector.sh --init-ext"
echo ""
echo "  # 2. Run tests to create tables and verify"
echo "  PG_HOST=\$(./provision_pgvector.sh --endpoint) \\"
echo "  PG_PASSWORD=xxx \\"
echo "  python tests/test_pgvector.py"
echo ""
echo "  # 3. Update Lambda env vars"
echo "  PG_HOST=\$(./provision_pgvector.sh --endpoint)"
echo "  for FUNC in sedaily-mbti-archive-dev sedaily-mbti-pipeline-supervisor-dev sedaily-mbti-recommend-dev; do"
echo "    aws lambda update-function-configuration \\"
echo "      --function-name \$FUNC \\"
echo "      --environment \"Variables={PG_HOST=\$PG_HOST,PG_PORT=$DB_PORT,PG_DATABASE=$DB_NAME,PG_USER=$DB_USER,PG_PASSWORD=xxx}\" \\"
echo "      --region $REGION"
echo "  done"
echo ""

# =============================================================================
# CLEANUP (commented out)
# =============================================================================
# echo "Deleting RDS instance (takes a few minutes)..."
# aws rds delete-db-instance \
#   --db-instance-identifier sedaily-mbti-pgvector-dev \
#   --skip-final-snapshot \
#   --region us-east-1
#
# # Wait for deletion, then clean up subnet group and security group
# aws rds wait db-instance-deleted --db-instance-identifier sedaily-mbti-pgvector-dev --region us-east-1
# aws rds delete-db-subnet-group --db-subnet-group-name sedaily-mbti-pgvector-subnet --region us-east-1
# aws ec2 delete-security-group --group-id $SG_ID --region us-east-1
