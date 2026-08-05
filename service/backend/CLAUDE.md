# service/backend/

CLAUDE.md 의 Backend Module Layers 섹션에서 분리됨 — service/backend/ 전체의 디렉토리 / 모듈 구조 reference. v1 (production) 과 v2 의 layout, 모듈별 책임, 주요 entry point 를 다룸.

본 파일은 service/backend/ 안에서 작업 시 자동 load. 본 repository 의 root CLAUDE.md 는 1줄 포인터로 본 파일 reference.

service/frontend/CLAUDE.md / admin/CLAUDE.md 패턴 일관.

---

### Backend Module Layers

```
handlers/           → Lambda entry points. Each handler does its own HTTP method + path
                     routing internally (not relying on API Gateway routing). Supports
                     both REST API v1 and HTTP API v2 event formats.
                     Deployed (18): article_collector, search, article, chatbot, engagement,
                     tts, time_machine, s3_articles, user, archive, podcast, recommendation,
                     post, question, briefing.
                     2026-07-30 폐기: engagement, tts, metrics, abtest, translation
                     (30일 실호출 0 + 프론트 미참조). `pipeline/` 디렉터리 전체도
                     함께 삭제 — v1 Step Functions 5단계는 v2 collector/selector 가
                     대체했다. 경위·복원:
                     infrastructure/decommission-2026-07-30/README.md
clients/            → Service clients: dynamodb, personal_db, podcast_db, s3_article, s3_xml,
                     opensearch, pgvector, embedding (Titan), translate (AWS Translate),
                     personalize (AWS Personalize for recommendations).
                     Bedrock Claude is wrapped by clients/mbti_transform_service.py (unusual
                     placement — it's a service file inside clients/). Polly has no client file;
                     podcast_handler calls boto3 polly directly (tts_handler 는 폐기).
                     OpenSearch and pgvector clients are lazy-imported (not in __init__.py)
                     to avoid pulling in opensearch-py/pg8000 at module load time.
                     ⚠️ opensearch_client.py 는 2026-08-04 기준 죽은 코드다 — 어떤 handler 도
                     import 하지 않고 tests/test_opensearch.py·test_full_integration.py 에서만
                     쓰였다. 백업 AWS 도메인(sedaily-mbti-search-dev)도 같은 날 삭제됐다.
                     search_handler.py/chatbot_handler.py 는 처음부터 DynamoDB GSI 쿼리로
                     검색·RAG-유사 기능을 구현했다 (루트 CLAUDE.md "Graceful Degradation" 참조).
repositories/       → Business-level data access on top of clients (Personal, Podcast, Settings, Log)
services/           → Business logic: article_filter, prompt_service, prompt_loader,
                     collaborative_filter, metrics, briefing_generator (used by
                     briefing_handler), stock_service (used by chatbot_handler for
                     inline stock/market-index lookups)
models/             → Dataclasses: Article, Podcast, UserProfile/ArchivedSentence/ReadingRecord
                     (in personal.py), ABTest
core/               → Framework: decorators.py (@lambda_handler, @require_params, etc.),
                     exceptions.py (thin re-export of common/errors.py's BackendError
                     hierarchy — see "common/" below), response.py (delegates to
                     common/http.py, injects CORS_HEADERS), revalidation.py
                     (CacheRevalidator — triggers frontend cache invalidation)
config/             → settings.py (env-var-driven @dataclass Settings, cached
                     via @lru_cache get_settings()) + constants.py (model IDs,
                     DynamoDB table names, S3_BODY_FIELDS, CORS_HEADERS,
                     category normalization + search aliases, MBTI_GROUP_INFO,
                     Polly podcast voice styles). Never call `os.getenv` in
                     handlers — go through `config.settings`.
prompts/            → AI prompt templates organized by purpose:
                     transform/ (nt/nf/st/sf.md — MBTI rewriting),
                     chatbot/ (nt/nf/st/sf.md — chatbot persona),
                     selection/ (article_scorer.md),
                     validation/ (validator.md),
                     podcast/ (podcast_script.md),
                     question/ (daily_question.md)
utils/              → Small helpers included in the Lambda zip: date_utils.py,
                     hash_utils.py. Not a layer in the architectural sense —
                     just shared utilities.
common/             → Cross-track shared utilities (v1 / v2 / admin all import from here).
                     - `feature_flag.py` — DDB-backed feature flags + numeric thresholds
                     (Admin-2a `0ee43df` + Admin-2d `e172175`). Fail-open / fail-safe,
                     own 5-min TTL cache.
                     - `secrets.py`      — SSM SecureString reader (Admin-2c, `61b7177`).
                     Fail-closed, own 5-min TTL cache.
                     - `http.py`         — CORS-neutral response builder (`success`/`error`/
                     `json_dumps`). No cache; doesn't import `config/` so CORS can't leak
                     in. `core/response.py` and `admin/shared/response.py` both delegate
                     to it (CORS injected by the caller, not this module).
                     - `errors.py`       — `BackendError` hierarchy + `EXCEPTION_STATUS_CODES`
                     + `get_status_code_for_exception()`; `core/exceptions.py` re-exports it.
                     Bundled into the v1 Lambda zip by `deploy.sh`, the v2 zip by
                     `v2/deploy-v2.sh`, and the admin zip by `admin/deploy-admin-api.sh`
                     (all three copy lists include `common`). Import path inside Lambda:
                     `from common.<module> import ...` (zip root, no `backend.` prefix).
```

A legacy `service/backend/MBTI_TRANSFORM_PROMPT.md` still sits at the backend root as the last-resort fallback for `clients/mbti_transform_service.py`. The canonical prompts live in `prompts/transform/` now — don't edit the root file.

