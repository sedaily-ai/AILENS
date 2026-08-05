#!/bin/bash
# =============================================================================
# Provision OpenSearch for AI LENS RAG Search
# =============================================================================
#
# Creates an OpenSearch managed domain (single-node, cheapest option for dev).
# OpenSearch Serverless is an alternative but has different API compatibility.
#
# IMPORTANT: This script provisions a managed domain which takes 15-20 minutes
# to create. Run this ahead of the 4/16 AWS engineer meeting or with their guidance.
#
# What gets created:
#   1. OpenSearch domain: sedaily-mbti-search-dev
#      - Engine: OpenSearch 2.11
#      - Instance: t3.small.search (single node, ~$26/month)
#      - Storage: 10 GB EBS gp3
#      - Plugins: analysis-nori (Korean tokenizer)
#      - Access: IAM-based (same AWS credentials as Lambda)
#   2. Nori (Korean analyzer) plugin is included by default in OpenSearch 2.x
#
# After creation:
#   - Run test_opensearch.py to create index + verify
#   - Update OPENSEARCH_ENDPOINT in Lambda env vars (via update_lambda_env.sh)
#
# Usage:
#   ./provision_opensearch.sh              # Create domain
#   ./provision_opensearch.sh --dry-run    # Print commands only
#   ./provision_opensearch.sh --status     # Check domain status
#   ./provision_opensearch.sh --endpoint   # Print endpoint (after creation)
#
# Does NOT create:
#   - OpenSearch Serverless (different API, consider for production)
#   - RDS PostgreSQL + pgvector (separate provisioning)
# =============================================================================

set -e

REGION="us-east-1"
DOMAIN_NAME="sedaily-mbti-search-dev"
DRY_RUN=false

if [ "$1" = "--dry-run" ]; then
  DRY_RUN=true
  echo "[DRY RUN]"
  echo ""
fi

AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "UNKNOWN")
echo "AWS Account: $AWS_ACCOUNT_ID"
echo ""

# ── Check status ─────────────────────────────────────────────────────────────

if [ "$1" = "--status" ]; then
  echo "Checking domain status..."
  aws opensearch describe-domain \
    --domain-name "$DOMAIN_NAME" \
    --region "$REGION" \
    --query '{Status: DomainStatus.Processing, Endpoint: DomainStatus.Endpoint, Engine: DomainStatus.EngineVersion, Instance: DomainStatus.ClusterConfig.InstanceType}' \
    --output table 2>&1 || echo "Domain not found."
  exit 0
fi

if [ "$1" = "--endpoint" ]; then
  ENDPOINT=$(aws opensearch describe-domain \
    --domain-name "$DOMAIN_NAME" \
    --region "$REGION" \
    --query 'DomainStatus.Endpoint' \
    --output text 2>/dev/null)
  if [ "$ENDPOINT" = "None" ] || [ -z "$ENDPOINT" ]; then
    echo "Domain not ready yet or not found."
    exit 1
  fi
  echo "https://$ENDPOINT"
  exit 0
fi

# =============================================================================
# 1. CREATE OPENSEARCH DOMAIN
# =============================================================================
echo "── Creating OpenSearch Domain: ${DOMAIN_NAME} ──"
echo ""
echo "  Engine:   OpenSearch 2.11"
echo "  Instance: t3.small.search (single node)"
echo "  Storage:  10 GB EBS gp3"
echo "  Cost:     ~\$26/month"
echo ""

# Access policy: allow the same AWS account (IAM-based)
ACCESS_POLICY="{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Effect\": \"Allow\",
    \"Principal\": { \"AWS\": \"arn:aws:iam::${AWS_ACCOUNT_ID}:root\" },
    \"Action\": \"es:*\",
    \"Resource\": \"arn:aws:es:${REGION}:${AWS_ACCOUNT_ID}:domain/${DOMAIN_NAME}/*\"
  }]
}"

if [ "$DRY_RUN" = true ]; then
  echo "[dry-run] aws opensearch create-domain --domain-name $DOMAIN_NAME ..."
  echo ""
  echo "[dry-run] Access policy:"
  echo "$ACCESS_POLICY" | python3 -m json.tool 2>/dev/null || echo "$ACCESS_POLICY"
else
  # Check if domain already exists
  EXISTING=$(aws opensearch describe-domain \
    --domain-name "$DOMAIN_NAME" \
    --region "$REGION" \
    --query 'DomainStatus.DomainName' \
    --output text 2>/dev/null || echo "NONE")

  if [ "$EXISTING" = "$DOMAIN_NAME" ]; then
    echo "  Domain already exists. Checking status..."
    PROCESSING=$(aws opensearch describe-domain \
      --domain-name "$DOMAIN_NAME" \
      --region "$REGION" \
      --query 'DomainStatus.Processing' \
      --output text)
    ENDPOINT=$(aws opensearch describe-domain \
      --domain-name "$DOMAIN_NAME" \
      --region "$REGION" \
      --query 'DomainStatus.Endpoint' \
      --output text)

    if [ "$PROCESSING" = "True" ]; then
      echo "  Domain is still being created. Please wait 15-20 minutes."
    elif [ "$ENDPOINT" != "None" ] && [ -n "$ENDPOINT" ]; then
      echo "  Domain is active!"
      echo "  Endpoint: https://$ENDPOINT"
    fi
    echo ""
  else
    echo "  Creating domain (this takes 15-20 minutes)..."

    aws opensearch create-domain \
      --domain-name "$DOMAIN_NAME" \
      --engine-version "OpenSearch_2.11" \
      --cluster-config '{
        "InstanceType": "t3.small.search",
        "InstanceCount": 1,
        "DedicatedMasterEnabled": false,
        "ZoneAwarenessEnabled": false,
        "WarmEnabled": false
      }' \
      --ebs-options '{
        "EBSEnabled": true,
        "VolumeType": "gp3",
        "VolumeSize": 10
      }' \
      --node-to-node-encryption-options '{"Enabled": true}' \
      --encryption-at-rest-options '{"Enabled": true}' \
      --domain-endpoint-options '{"EnforceHTTPS": true, "TLSSecurityPolicy": "Policy-Min-TLS-1-2-2019-07"}' \
      --advanced-security-options '{
        "Enabled": true,
        "InternalUserDatabaseEnabled": false,
        "MasterUserOptions": {
          "MasterUserARN": "arn:aws:iam::'$AWS_ACCOUNT_ID':root"
        }
      }' \
      --access-policies "$ACCESS_POLICY" \
      --region "$REGION" \
      --output text \
      --query 'DomainStatus.DomainName'

    echo ""
    echo "  [OK] Domain creation initiated: $DOMAIN_NAME"
    echo ""
    echo "  *** Domain takes 15-20 minutes to become active ***"
    echo ""
    echo "  Check status:"
    echo "    ./provision_opensearch.sh --status"
    echo ""
    echo "  Get endpoint (after active):"
    echo "    ./provision_opensearch.sh --endpoint"
  fi
fi

# =============================================================================
# 2. UPDATE LAMBDA ENVIRONMENT VARIABLES
# =============================================================================

echo "── Post-creation steps ──"
echo ""
echo "After the domain is active, run these commands:"
echo ""
echo "  # 1. Get the endpoint"
echo "  ENDPOINT=\$(./provision_opensearch.sh --endpoint)"
echo ""
echo "  # 2. Update all Lambda functions with OpenSearch endpoint"
echo "  for FUNC in \\"
echo "    sedaily-mbti-chatbot-dev \\"
echo "    sedaily-mbti-pipeline-supervisor-dev \\"
echo "    sedaily-mbti-archive-dev \\"
echo "    sedaily-mbti-recommend-dev; do"
echo "    aws lambda update-function-configuration \\"
echo "      --function-name \$FUNC \\"
echo "      --environment \"Variables={OPENSEARCH_ENDPOINT=\$ENDPOINT,OPENSEARCH_INDEX=sedaily-articles}\" \\"
echo "      --region $REGION"
echo "  done"
echo ""
echo "  # 3. Create the index and run tests"
echo "  OPENSEARCH_ENDPOINT=\$ENDPOINT python tests/test_opensearch.py"
echo ""

# =============================================================================
# CLEANUP (commented out)
# =============================================================================
# echo "Deleting OpenSearch domain..."
# aws opensearch delete-domain \
#   --domain-name sedaily-mbti-search-dev \
#   --region us-east-1
# echo "Domain deletion initiated (takes a few minutes)."
