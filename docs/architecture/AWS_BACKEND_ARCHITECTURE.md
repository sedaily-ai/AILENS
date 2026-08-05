# AI LENS — AWS Backend Architecture

> **Status**: v1 production snapshot. As of 2026-04-15. v2 namespace (sedaily-mbti-v2-*-dev), RDS pgvector, S3 article-body-v2 등은 미반영. v1 infra 의 정확한 스냅샷으로 가치 있음. v2 동작은 [backend/CLAUDE.md](../backend/CLAUDE.md) 또는 [v2-phase-history.md](v2-phase-history.md) 참조.

Exact snapshot of production infrastructure as of 2026-04-15.
All values verified against live AWS resources and codebase.

**AWS Account**: `887078546492`
**Production URL**: https://mbti.sedaily.ai
**API Endpoint**: https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev

---

## 1. High-Level Architecture

```
                                  ┌──────────────────────────────┐
                                  │     CloudFront (E1QS7PY350VHF6)     │
                                  │     mbti.sedaily.ai                  │
                                  └──────────────┬───────────────┘
                                                 │
                              ┌──────────────────┼──────────────────┐
                              │                  │                  │
                     ┌────────▼────────┐  ┌──────▼──────┐  ┌───────▼──────┐
                     │   S3 Frontend   │  │ API Gateway  │  │   Cognito    │
                     │  (Static HTML)  │  │  (HTTP API)  │  │ (User Auth)  │
                     └─────────────────┘  └──────┬──────┘  └──────────────┘
                                                 │
                          ┌──────────────────────┼──────────────────────┐
                          │                      │                      │
                 ┌────────▼────────┐   ┌─────────▼────────┐   ┌────────▼────────┐
                 │  17 API Lambdas │   │  EventBridge Rule │   │   Step Functions │
                 │  (HTTP handlers)│   │  rate(3 hours)    │──▶│   (Pipeline)     │
                 └────────┬────────┘   └──────────────────┘   └────────┬────────┘
                          │                                            │
         ┌────────────────┼────────────────┐              ┌────────────┼────────┐
         │                │                │              │            │        │
    ┌────▼────┐   ┌───────▼──────┐  ┌──────▼──────┐  ┌───▼───┐  ┌────▼───┐  ┌─▼──────┐
    │DynamoDB │   │ S3 (Bodies)  │  │  Bedrock    │  │Step 1 │  │Step 3  │  │Superv. │
    │(4 tables)│  │ (Articles)   │  │(AI Models)  │  │(Nova) │  │(Opus)  │  │(Store) │
    └─────────┘   └──────────────┘  └─────────────┘  └───────┘  └────────┘  └────────┘
         │                                                                       │
    ┌────▼──────────────────────────────────────────────────────────────┐        │
    │            Optional: OpenSearch (RAG) + pgvector (similarity)     │◀───────┘
    └──────────────────────────────────────────────────────────────────┘
```

---

## 2. Region Layout

| Region | Services |
|--------|----------|
| **us-east-1** | Lambda (22), API Gateway, DynamoDB (4 tables), Step Functions, EventBridge, Cognito, Bedrock, Polly, OpenSearch, RDS (pgvector), S3 (`article-body`, `audio`, `lambda-packages`) |
| **ap-northeast-2** | S3 (`news-xml-storage`, `frontend-dev`), CloudFront |

---

## 3. API Gateway

| Property | Value |
|----------|-------|
| Name | `sedaily-mbti-api-dev` |
| ID | `chzwwtjtgk` |
| Protocol | HTTP API (v2) |
| Endpoint | `https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com` |
| Stage | `dev` |
| CORS Origins | `*` |
| CORS Methods | `GET, POST, OPTIONS` |
| CORS Headers | `content-type, authorization` |

### Routes (62 total, verified from AWS)

**Article & Content**
| Route | Lambda | Purpose |
|-------|--------|---------|
| `GET /s3-articles` | sedaily-mbti-s3-articles-dev | List articles from S3 XML (pre-transform) |
| `GET /s3-article/{article_id}` | sedaily-mbti-s3-articles-dev | Article detail from S3 XML |
| `GET /api/articles` | sedaily-mbti-article-dev | List transformed articles |
| `GET /api/article/{article_id}` | sedaily-mbti-article-dev | Article detail with MBTI versions |
| `POST /api/search` | sedaily-mbti-search-dev | Full-text + filter search |
| `GET /time-machine` | sedaily-mbti-time-machine-dev | Historical date news |

**User & Auth**
| Route | Lambda | Purpose |
|-------|--------|---------|
| `POST /api/user/profile` | sedaily-mbti-user-dev | Create/get user profile |
| `PUT /api/user/mbti` | sedaily-mbti-user-dev | Update MBTI group |
| `POST /api/user/read` | sedaily-mbti-user-dev | Record article read |
| `GET /api/user/history` | sedaily-mbti-user-dev | Reading history |
| `GET /api/user/stats` | sedaily-mbti-user-dev | User stats |

**AI Features**
| Route | Lambda | Purpose |
|-------|--------|---------|
| `POST /api/chat` | sedaily-mbti-chatbot-dev | MBTI chatbot (RAG + Claude Haiku) |
| `POST /api/tts` | sedaily-mbti-tts-dev | Text-to-speech (Polly) |
| `GET /api/questions` | sedaily-mbti-question-dev | Daily MBTI questions |
| `POST /api/questions` | sedaily-mbti-question-dev | Save question answer |
| `POST /saju` | (saju handler) | Fortune/horoscope |

**Engagement**
| Route | Lambda | Purpose |
|-------|--------|---------|
| `GET /api/engagement/{articleId}` | sedaily-mbti-engagement-dev | Get reactions/ratings/comments |
| `POST /api/engagement/{articleId}/reaction` | sedaily-mbti-engagement-dev | Toggle reaction |
| `POST /api/engagement/{articleId}/rating` | sedaily-mbti-engagement-dev | Submit rating (1-5) |
| `GET /api/engagement/{articleId}/comments` | sedaily-mbti-engagement-dev | List comments |
| `POST /api/engagement/{articleId}/comments` | sedaily-mbti-engagement-dev | Add comment |
| `POST /api/engagement/{articleId}/comments/like` | sedaily-mbti-engagement-dev | Like comment |

**Community**
| Route | Lambda | Purpose |
|-------|--------|---------|
| `POST /api/posts` | sedaily-mbti-post-dev | Create post |
| `GET /api/posts` | sedaily-mbti-post-dev | List posts |
| `GET /api/posts/{post_id}` | sedaily-mbti-post-dev | Get post |
| `DELETE /api/posts/{post_id}` | sedaily-mbti-post-dev | Delete post |

**Archive**
| Route | Lambda | Purpose |
|-------|--------|---------|
| `POST /api/archive` | sedaily-mbti-archive-dev | Save sentence |
| `GET /api/archive` | sedaily-mbti-archive-dev | List saved sentences |
| `DELETE /api/archive/{archive_id}` | sedaily-mbti-archive-dev | Delete sentence |
| `POST /api/archive/similar` | sedaily-mbti-archive-dev | Find similar (pgvector) |

**Podcast**
| Route | Lambda | Purpose |
|-------|--------|---------|
| `POST /api/podcast/generate` | sedaily-mbti-podcast-dev | Generate podcast |
| `GET /api/podcast/{podcast_id}` | sedaily-mbti-podcast-dev | Get podcast + presigned URL |
| `GET /api/podcast/list` | sedaily-mbti-podcast-dev | List by date |
| `GET /api/podcast/article/{article_id}` | sedaily-mbti-podcast-dev | Podcasts for article |

**Recommendation**
| Route | Lambda | Purpose |
|-------|--------|---------|
| `GET /api/recommend` | sedaily-mbti-recommend-dev | Personalized recommendations |
| `GET /api/recommend/analysis` | sedaily-mbti-recommend-dev | News DNA radar analysis |

**Translation**
| Route | Lambda | Purpose |
|-------|--------|---------|
| `GET /api/article/{news_id}/en` | sedaily-mbti-translation-dev | English translation |

**A/B Testing & Metrics**
| Route | Lambda | Purpose |
|-------|--------|---------|
| `ANY /api/ab-test/{proxy+}` | sedaily-mbti-abtest-dev | A/B test CRUD |
| `ANY /api/metrics/{proxy+}` | sedaily-mbti-metrics-dev | Dashboard/pipeline/cost metrics |

---

## 4. Lambda Functions (23 live)

Verified via `aws lambda list-functions`. All Python 3.11.

### API Functions (17 deployed via deploy.sh)

| Function Name | Handler | Memory | Timeout | Purpose |
|---------------|---------|--------|---------|---------|
| sedaily-mbti-article-collector-dev | handlers.article_collector.lambda_handler | 1024 MB | 900s | On-demand article collection |
| sedaily-mbti-search-dev | handlers.search_handler.lambda_handler | 1024 MB | 30s | Full-text search |
| sedaily-mbti-article-dev | handlers.article_handler.lambda_handler | 1024 MB | 120s | Article CRUD + MBTI versions |
| sedaily-mbti-chatbot-dev | handlers.chatbot_handler.lambda_handler | 1024 MB | 60s | MBTI chatbot (RAG) |
| sedaily-mbti-s3-articles-dev | handlers.s3_articles_handler.lambda_handler | 1024 MB | 30s | Raw S3 XML articles |
| sedaily-mbti-engagement-dev | handlers.engagement_handler.lambda_handler | 512 MB | 30s | Reactions/ratings/comments |
| sedaily-mbti-tts-dev | handlers.tts_handler.lambda_handler | 512 MB | 30s | Text-to-speech (Polly) |
| sedaily-mbti-time-machine-dev | handlers.time_machine_handler.lambda_handler | 512 MB | 30s | Historical date news |
| sedaily-mbti-user-dev | handlers.user_handler.lambda_handler | 256 MB | 30s | User profiles & history |
| sedaily-mbti-archive-dev | handlers.archive_handler.lambda_handler | 512 MB | 300s | Sentence archiving + similarity |
| sedaily-mbti-podcast-dev | handlers.podcast_handler.lambda_handler | 512 MB | 300s | Podcast generation (Haiku + Polly) |
| sedaily-mbti-recommend-dev | handlers.recommendation_handler.lambda_handler | 512 MB | 300s | Personalized recommendations |
| sedaily-mbti-post-dev | handlers.post_handler.lambda_handler | 256 MB | 30s | Community posts |
| sedaily-mbti-question-dev | handlers.question_handler.lambda_handler | 256 MB | 60s | Daily MBTI questions |
| sedaily-mbti-metrics-dev | handlers.metrics_handler.lambda_handler | 512 MB | 300s | Operational metrics |
| sedaily-mbti-abtest-dev | handlers.ab_test_handler.lambda_handler | 512 MB | 300s | A/B testing |
| sedaily-mbti-translation-dev | handlers.translation_handler.lambda_handler | 512 MB | 300s | Korean→English translation |

### Pipeline Functions (5 deployed via deploy.sh)

| Function Name | Handler | Memory | Timeout | Purpose |
|---------------|---------|--------|---------|---------|
| sedaily-mbti-pipeline-step1-dev | handlers.pipeline.step1_select.lambda_handler | 512 MB | 300s | Article selection + Nova scoring |
| sedaily-mbti-pipeline-step2-dev | handlers.pipeline.step2_classify.lambda_handler | 256 MB | 300s | MBTI classification |
| sedaily-mbti-pipeline-step3-dev | handlers.pipeline.step3_transform.lambda_handler | 1024 MB | 300s | MBTI rewriting (Opus 4.6) |
| sedaily-mbti-pipeline-step4-dev | handlers.pipeline.step4_validate.lambda_handler | 256 MB | 300s | Validation (Nova) |
| sedaily-mbti-pipeline-supervisor-dev | handlers.pipeline.supervisor.lambda_handler | 1024 MB | 300s | Storage + vector indexing |

### Additional (1 not in deploy.sh)

| Function Name | Handler | Memory | Timeout | Purpose |
|---------------|---------|--------|---------|---------|
| sedaily-mbti-briefing-dev | handlers.briefing_handler.lambda_handler | 512 MB | 300s | Briefing (not in deploy.sh) |

### Deployment

```
deploy.sh → pip install (7 deps for Linux) → zip (clients/, handlers/, config/, core/,
            models/, repositories/, services/, utils/, prompts/) → S3 upload →
            update 22 Lambda functions via update-function-code
```

Lambda package bucket: `sedaily-mbti-lambda-packages-dev` (us-east-1)

---

## 5. Step Functions Pipeline

| Property | Value |
|----------|-------|
| Name | `sedaily-mbti-transform-pipeline-dev` |
| ARN | `arn:aws:states:us-east-1:887078546492:stateMachine:sedaily-mbti-transform-pipeline-dev` |
| Type | STANDARD |
| Status | ACTIVE |
| Role | `sedaily-mbti-stepfunctions-role` |
| Overall Timeout | 3600s (1 hour) |

### Pipeline Flow

```
Step1_Select (600s)
  → CheckStep1HasArticles (Choice)
    → [selected > 0] → Step2_Classify (300s)
      → ProcessArticlesMap (MaxConcurrency=3)
          per article:
            TransformOne (600s) → ValidateOne (300s) → StoreOne (300s)
            on failure → ItemFailed (Pass, non-blocking)
    → [selected = 0] → NoArticles (Pass, exit)
  on Step1/Step2 failure → PipelineFailure (Supervisor, 60s)
```

### State Details

| State | Type | Lambda | Timeout | Retry |
|-------|------|--------|---------|-------|
| Step1_Select | Task | pipeline-step1-dev | 600s | 2 attempts, 10s interval, 2x backoff |
| CheckStep1HasArticles | Choice | — | — | Checks `$.body.metrics.selected > 0` |
| NoArticles | Pass | — | — | Returns empty result, ends |
| Step2_Classify | Task | pipeline-step2-dev | 300s | 2 attempts, 10s interval, 2x backoff |
| ProcessArticlesMap | Map | — | — | MaxConcurrency=3, iterates `$.body.classified_articles` |
| TransformOne | Task | pipeline-step3-dev | 600s | 2 attempts, 15s interval, 2x backoff |
| ValidateOne | Task | pipeline-step4-dev | 300s | 2 attempts, 10s interval, 2x backoff |
| StoreOne | Task | pipeline-supervisor-dev | 300s | 2 attempts, 10s interval, 2x backoff |
| ItemFailed | Pass | — | — | Returns `{stored_count: 0, reason: "iteration_failed"}` |
| PipelineFailure | Task | pipeline-supervisor-dev | 60s | No retry |

### Data Flow Between Steps

```
Step 1 output:
  - selected_articles_s3_uri: S3 path to full article JSON
  - selected_article_ids: [news_id, ...]
  - type_assignments: {NT: [...], NF: [...], ST: [...], SF: [...]}

Step 2 output:
  - classified_articles: [{news_id, title, category, target_groups, ...}]

Step 3 output (per article):
  - versions: {NT: {title, subtitle, body, key_points, closing_line}, NF: {...}, ...}
  - transform_usage: {input_tokens, output_tokens}

Step 4 output:
  - validated_articles: [{...article, validation: {status, issues}}]

Supervisor output:
  - metrics: {stored_count, store_failed_count} (projected via OutputPath)
```

---

## 6. EventBridge Schedule

| Property | Value |
|----------|-------|
| Rule Name | `sedaily-mbti-pipeline-schedule-dev` |
| Expression | `rate(3 hours)` — 8 runs/day |
| State | ENABLED |
| Target | Step Functions `sedaily-mbti-transform-pipeline-dev` |
| Target Role | `sedaily-mbti-eventbridge-role` |
| Input | `{"source": "schedule"}` |

Step 1 deduplicates against already-processed articles from earlier runs via the `__type_assignments__{date}` DynamoDB item. If fewer than 5 new candidates remain, the pipeline exits early.

---

## 7. DynamoDB Tables (4)

All in **us-east-1**, PAY_PER_REQUEST billing.

### sedaily-mbti-articles-dev

| Property | Value |
|----------|-------|
| PK | `news_id` (String) |
| SK | — (no sort key) |
| GSI 1 | `category-published_at-index` (PK: `category`, SK: `published_at`) |
| GSI 2 | `item_type-published_at-index` (PK: `item_type`, SK: `published_at`) |

**Item types stored:**
- Articles: metadata + `s3_body_uri` pointer to S3 body
- Type assignments: `news_id = __type_assignments__{YYYYMMDD}` — per-date MBTI selections
- Settings: `news_id = settings_config` — legacy admin config
- Collection logs: `news_id = collection_log_{date}` — pipeline run logs

**Split storage**: DynamoDB holds metadata (title, category, dates, images, `s3_body_uri`). S3 holds body content (`content_ko`, `content_raw`, `content_blocks`, `version_NT/NF/ST/SF`).

### sedaily-mbti-personal-dev

| Property | Value |
|----------|-------|
| PK | `user_id` (String) |
| SK | `sk` (String) |
| GSI | — (none) |

**SK patterns:**
- `PROFILE` — user profile (name, email, mbti_group, badges)
- `ARCHIVE#{article_id}#{timestamp}` — saved sentences
- `READING#{article_id}` — reading records
- `AB_ASSIGN#{experiment_id}` — A/B test group assignment
- `AB_EVENT#{experiment_id}#{timestamp}` — A/B test events
- `ANSWER#{YYYYMMDD}#{question_id}` — daily question answers
- `DATE#{YYYYMMDD}` — cached daily questions

### sedaily-mbti-engagement-dev

| Property | Value |
|----------|-------|
| PK | `pk` (String) |
| SK | `sk` (String) |
| GSI | — (none) |

**PK/SK patterns:**
- `ARTICLE#{id}` / `REACTIONS` — reaction counts
- `ARTICLE#{id}` / `RATING_STATS` — rating aggregate
- `ARTICLE#{id}` / `COMMENT#{timestamp}#{comment_id}` — comments
- `ARTICLE#{id}` / `USER_REACTION#{user_id}#{type}` — user reaction tracking
- `ARTICLE#{id}` / `USER_RATING#{user_id}` — user rating tracking
- `COMMUNITY_POSTS` / `{date}#{post_id}` — community posts
- `POST#{post_id}` / `COMMENT#{timestamp}` — post comments

### sedaily-mbti-podcast-dev

| Property | Value |
|----------|-------|
| PK | `podcast_id` (String) |
| SK | — (no sort key) |
| GSI | `date-index` (PK: `created_date`, SK: `podcast_id`) |

---

## 8. S3 Buckets (MBTI-specific)

| Bucket | Region | Purpose | Key Pattern |
|--------|--------|---------|-------------|
| `sedaily-mbti-article-body-dev` | us-east-1 | Article body JSON (split storage) | `articles/{news_id}/body.json` |
| `sedaily-mbti-audio-dev` | us-east-1 | Polly TTS audio files | `{podcast_id}.mp3` |
| `sedaily-mbti-lambda-packages-dev` | us-east-1 | Lambda deployment zip | `lambda_package.zip` |
| `sedaily-mbti-frontend-dev` | ap-northeast-2 | Frontend static files (Next.js export) | `/*` |
| `sedaily-news-xml-storage` | ap-northeast-2 | Source XML from 서울경제 (read-only) | `daily-xml/{YYYYMMDD}/news.xml` |

**Pipeline temp storage**: `sedaily-mbti-article-body-dev` also stores pipeline temp data at `pipeline-temp/{YYYYMMDD}/selected_articles.json`.

---

## 9. AI Models (Bedrock, us-east-1)

| Model | ID | Use | Pricing (per 1M tokens) |
|-------|----|-----|-------------------------|
| Claude Opus 4.6 | `us.anthropic.claude-opus-4-6-v1:0` | MBTI rewriting — 4 parallel calls per article (Step 3) | input $15 / output $75 |
| Claude Haiku 3.5 | `us.anthropic.claude-3-5-haiku-20241022-v1:0` | Chatbot RAG, podcast scripts, daily questions | input $0.25 / output $1.25 |
| Nova Lite | `amazon.nova-lite-v1:0` | Article scoring (Step 1), classification (Step 2), validation (Step 4), supervisor review | input $0.06 / output $0.24 |
| Titan Embeddings V2 | `amazon.titan-embed-text-v2:0` | 1024-dim vectors for OpenSearch and pgvector | input $0.02 / 1K tokens |

**Prompt caching**: `cache_control: {"type": "ephemeral"}` is set on system prompts in Step 3 (transform) and chatbot — the same system prompt is reused across articles/conversations.

---

## 10. Cognito

| Property | Value |
|----------|-------|
| User Pool Name | `sedaily-mbti-users` |
| User Pool ID | `us-east-1_ZS8PgF3iX` |
| Domain | `sedaily-mbti` |
| Region | us-east-1 |

---

## 11. CloudFront

| Property | Value |
|----------|-------|
| Distribution ID | `E1QS7PY350VHF6` |
| Domain | `mbti.sedaily.ai` |
| CloudFront Domain | `d1c80m8tuxbtcl.cloudfront.net` |
| Origin | `sedaily-mbti-frontend-dev.s3.us-east-1.amazonaws.com` |
| Status | Deployed |

---

## 12. Optional Services

These are enabled only when environment variables are configured. Failures are non-blocking.

### OpenSearch (RAG search)

| Property | Value |
|----------|-------|
| Domain | `sedaily-mbti-search-dev` |
| Index | `sedaily-articles` |
| Env var | `OPENSEARCH_ENDPOINT` (empty = disabled) |
| Instance | t3.small (~$26/month) |
| Vectors | 1024-dim (Titan V2) |
| Search mode | Hybrid — BM25 (0.3 weight) + kNN (0.7 weight) |

**Fallback**: When disabled, chatbot and search use DynamoDB GSI `category-published_at-index`.

### pgvector (similarity search)

| Property | Value |
|----------|-------|
| RDS Instance | `sedaily-mbti-pgvector-dev` |
| Engine | PostgreSQL + pgvector extension |
| Instance | db.t3.micro (~$14/month) |
| Database | `ailens` |
| User | `ailens` |
| Env var | `PG_PASSWORD` (empty = disabled) |
| Driver | pg8000 (pure Python, Lambda-friendly) |
| Tables | `articles_vectors`, `archive_vectors` |

### Amazon Personalize

| Property | Value |
|----------|-------|
| Env var | `PERSONALIZE_CAMPAIGN_ARN` (empty = disabled) |
| Purpose | Recommendation engine |
| Fallback | MBTI collaborative filtering + category matching |

---

## 13. IAM Roles

| Role | Used By |
|------|---------|
| `sedaily-mbti-stepfunctions-role` | Step Functions state machine |
| `sedaily-mbti-eventbridge-role` | EventBridge rule → Step Functions target |
| (Lambda execution roles) | Each Lambda function (implicit) |

---

## 14. Environment Variables (39 total)

All Lambda functions share the same deployment package. Environment-specific config via Lambda env vars:

**Required:**
| Variable | Default | Purpose |
|----------|---------|---------|
| `AWS_REGION` | `us-east-1` | Primary region |
| `DYNAMODB_TABLE_ARTICLES` | `sedaily-mbti-articles-dev` | Articles table |
| `DYNAMODB_TABLE_PERSONAL` | `sedaily-mbti-personal-dev` | User data table |
| `DYNAMODB_TABLE_PODCAST` | `sedaily-mbti-podcast-dev` | Podcast table |
| `S3_ARTICLE_BODY_BUCKET` | `sedaily-mbti-article-body-dev` | Article body storage |
| `S3_AUDIO_BUCKET` | `sedaily-mbti-audio-dev` | Audio storage |
| `CLAUDE_MODEL_ID` | `us.anthropic.claude-opus-4-6-v1:0` | Transform model |
| `NOVA_MODEL_ID` | `amazon.nova-lite-v1:0` | Scoring/validation model |
| `FRONTEND_URL` | `https://mbti.sedaily.com` | For cache revalidation |

**Optional (enable extra features):**
| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENSEARCH_ENDPOINT` | `''` | OpenSearch domain URL (empty = disabled) |
| `PG_HOST` | `''` | pgvector RDS host (empty = disabled) |
| `PG_PASSWORD` | `''` | pgvector password |
| `PERSONALIZE_CAMPAIGN_ARN` | `''` | Personalize campaign |
| `REVALIDATE_SECRET` | `None` | Frontend cache invalidation secret |
| `BIGKINDS_API_KEY` | `''` | BigKinds news API |
| `ANTHROPIC_API_KEY` | `''` | Direct Anthropic API (legacy) |

---

## 15. Cost Structure (estimated monthly)

| Service | Estimated Cost | Notes |
|---------|---------------|-------|
| Lambda | ~$5-15 | 22 functions, pay-per-invocation |
| DynamoDB | ~$5-10 | 4 tables, on-demand billing |
| S3 | ~$2-5 | Article bodies + audio + frontend |
| Bedrock (Opus) | ~$50-200 | 8 runs/day × ~30 articles × 4 calls |
| Bedrock (Haiku) | ~$5-15 | Chatbot + podcast + questions |
| Bedrock (Nova) | ~$2-5 | Pipeline scoring/validation |
| Bedrock (Titan) | ~$1-3 | Embedding generation |
| API Gateway | ~$1-5 | HTTP API, pay-per-request |
| CloudFront | ~$1-5 | Static site delivery |
| Cognito | Free tier | < 50K MAU |
| OpenSearch | ~$26 | t3.small (optional) |
| RDS pgvector | ~$14 | db.t3.micro (optional) |
| Step Functions | ~$1-5 | Standard, ~240 executions/month |
| EventBridge | ~$0 | Free tier |
| **Total** | **~$115-310** | Depends on article volume and chat usage |
