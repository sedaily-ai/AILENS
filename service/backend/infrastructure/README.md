# Infrastructure — AI LENS Backend Deployment Guide

## Quick Start (Zero to Running)

```bash
# 1. Deploy Lambda code
cd backend
./deploy.sh

# 2. Provision new AWS resources (S3, DynamoDB, Lambda)
./infrastructure/provision.sh

# 3. Deploy Step Functions pipeline
./infrastructure/deploy_step_functions.sh

# 4. (Optional) Provision OpenSearch — takes 15-20 min
./infrastructure/provision_opensearch.sh

# 5. (Optional) Provision pgvector RDS — takes ~10 min
PG_PASSWORD=your-password ./infrastructure/provision_pgvector.sh

# 6. Set up cost monitoring alarms
./infrastructure/cost_monitoring.sh

# 7. Run demo data setup
python tests/demo_data_setup.py

# 8. Verify everything works
python tests/run_demo_checks.py
```

---

## Architecture

```
서울경제 XML (S3, ap-northeast-2)
  → EventBridge (daily 07:00 KST)
  → Step Functions Pipeline (5 stages)
    Step 1: Select (Nova) → Step 2: Classify (Nova)
    → Step 3: Transform (Claude, parallel Map)
    → Step 4: Validate (Nova) → Supervisor
  → DynamoDB (metadata) + S3 (body JSON)
  → OpenSearch (RAG) + pgvector (similarity)
  → API Gateway → Frontend (mbti.sedaily.ai)
```

## AWS Resources

### Compute

| Resource | Name | Region |
|----------|------|--------|
| Lambda (API) | 13 functions | us-east-1 |
| Lambda (Pipeline) | 6 functions | us-east-1 |
| Step Functions | `sedaily-mbti-transform-pipeline-dev` | us-east-1 |
| EventBridge | `sedaily-mbti-pipeline-schedule-dev` | us-east-1 |

### Storage

| Resource | Name | Region |
|----------|------|--------|
| DynamoDB | `sedaily-mbti-articles-dev` | us-east-1 |
| DynamoDB | `sedaily-mbti-personal-dev` | us-east-1 |
| DynamoDB | `sedaily-mbti-podcast-dev` | us-east-1 |
| DynamoDB | `sedaily-mbti-engagement-dev` | us-east-1 |
| S3 | `sedaily-mbti-article-body-dev` | us-east-1 |
| S3 | `sedaily-mbti-audio-dev` | us-east-1 |
| S3 | `sedaily-news-xml-storage` | ap-northeast-2 |

### AI & Search (Optional)

| Resource | Cost |
|----------|------|
| OpenSearch `sedaily-mbti-search-dev` (t3.small) | ~$26/month |
| RDS pgvector `sedaily-mbti-pgvector-dev` (db.t3.micro) | ~$14/month |
| Bedrock (Claude + Nova + Titan Embed) | ~$0.10/day |

## Deployment Scripts

| Script | Purpose | Time |
|--------|---------|------|
| `deploy.sh` | Build + deploy all 19 Lambda functions | ~2 min |
| `deploy.sh api` | API functions only | ~1 min |
| `deploy.sh pipeline` | Pipeline functions only | ~1 min |
| `provision.sh` | Create S3 + DynamoDB + Lambda + SFN + EventBridge | ~3 min |
| `deploy_step_functions.sh` | Create/update state machine + IAM roles | ~1 min |
| `provision_opensearch.sh` | Create OpenSearch domain | 15-20 min |
| `provision_pgvector.sh` | Create RDS PostgreSQL + pgvector | ~10 min |
| `cost_monitoring.sh` | Create CloudWatch alarms | ~1 min |

All scripts support `--dry-run` to preview commands.

## Step Functions Pipeline

```
Step1_Select → CheckStep1HasArticles → Step2_Classify
  → Step3_TransformMap (parallel, 3 concurrent batches)
  → MergeTransformResults → Step4_Validate → Supervisor → END
```

Timeouts: 15 min total, 5 min per step.
Retries: 2 per step, exponential backoff.
Error path: any failure → PipelineFailure → Supervisor logs → END.

### Manual Trigger

```bash
aws stepfunctions start-execution \
  --state-machine-arn arn:aws:states:us-east-1:${AWS_ACCOUNT_ID}:stateMachine:sedaily-mbti-transform-pipeline-dev \
  --input '{"date": "20260410", "source": "manual"}'
```

## Cost Summary

| Service | Monthly |
|---------|---------|
| Bedrock | ~$3-5 |
| DynamoDB (4 tables) | ~$1-3 |
| Lambda (19 functions) | ~$1-2 |
| S3 (3 buckets) | ~$1 |
| OpenSearch | ~$26 |
| RDS pgvector | ~$14 |
| **Total** | **~$46-51** |

Budget: $26,000 credits → **520+ months** runway.

```bash
python tests/estimate_costs.py   # detailed cost analysis
```

## Troubleshooting

### Pipeline Not Running
```bash
aws stepfunctions list-executions \
  --state-machine-arn arn:aws:states:us-east-1:${AWS_ACCOUNT_ID}:stateMachine:sedaily-mbti-transform-pipeline-dev \
  --max-results 5
```

### Lambda Errors
```bash
aws logs tail /aws/lambda/sedaily-mbti-chatbot-dev --follow
cd backend && ./deploy.sh   # redeploy
```

### Frontend Not Loading
```bash
cd frontend-next && npm run build
aws s3 sync out/ s3://sedaily-mbti-frontend-dev --delete
aws cloudfront create-invalidation --distribution-id E1QS7PY350VHF6 --paths "/*"
```

### OpenSearch / pgvector
```bash
./infrastructure/provision_opensearch.sh --status
./infrastructure/provision_pgvector.sh --status
```

## Test Suite

```bash
python tests/test_regression.py        # existing API regression
python tests/test_split_storage.py     # DynamoDB + S3 split
python tests/test_new_apis.py          # archive, podcast, recommend
python tests/test_full_integration.py  # end-to-end
python tests/test_performance.py       # latency benchmarks
python tests/run_demo_checks.py        # pre-demo verification
```

## Demo Preparation

```bash
python tests/demo_data_setup.py     # create demo user + data
python tests/run_demo_checks.py     # verify all systems
cat infrastructure/demo_checklist.md  # manual checklist
```
