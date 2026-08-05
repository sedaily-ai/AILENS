# service/backend/

service/backend/ 전체의 디렉토리 / 모듈 구조 reference. 본 파일은 service/backend/ 안에서
작업 시 자동 load.

service/frontend/CLAUDE.md / admin/CLAUDE.md 패턴 일관.

---

## 2026-08-05: v1/v2 폴더 구분 제거 + 자동생성 파이프라인 폐기

한때 `service/backend/v2/`가 "차세대 재설계" 병렬 스택으로 따로 존재했다. 핵심이던
Selector→Transform→개인화 파이프라인이 2026-08-04 비용 문제로 폐기되며 그 구분이
무의미해졌고, 남은 라이브 코드를 이 문서가 설명하는 v1 구조로 옮겨 폴더 구분을
완전히 없앴다. **이제 `v2/` 폴더는 존재하지 않는다 — 아래 레이어 설명이 곧 전체다.**

배포된 Lambda 함수 이름 중 일부는 여전히 `sedaily-mbti-v2-*-dev` 접두사를 쓴다(예:
`sedaily-mbti-v2-today-letters-dev`) — AWS에 이미 그 이름으로 배포돼 있어 바꾸지
않았을 뿐, 소스 위치나 아키텍처상의 의미는 없는 레거시 이름표다. `deploy.sh`
하나가 이 이름들과 원래 v1 이름 함수들을 전부 같은 zip으로 배포한다 (`./deploy.sh api` | `all`).

**같은 날, 자동 수집→AI 생성 파이프라인 자체를 폐기했다.** 폴더 통합 직후 운영
상태를 점검하다가 "오늘의 한 통"이 실제로 비어있는 걸 발견했다 — 2026-08-04
pgvector RDS 삭제로 **읽기**는 DynamoDB로 이관됐지만 **쓰기**(Editor Pick의
`insert_daily_letter`)는 여전히 죽은 RDS를 보고 있어 매일 조용히 실패 중이었다
(front-page API도 같은 이유로 500 에러). 고치는 대신 폐기 결정 — 콘텐츠는 이제
관리자 대시보드에서 직접 업로드하는 구조(`handlers/cms_posts_public.py`, DynamoDB
기반, 정상 동작)로 간다. `core1_collector.py`, `core25_editor_pick.py`, `core25/`,
`core3_feed.py`, `core3_article.py`, `core3/` 전부 소스에서 삭제했다.
`clients/pgvector_v2_client.py`(원래 1986줄, 34메서드 God Object)는 front-page가
아직 쓰는 2개 메서드만 남기고 축소했다 — front-page 자체는 여전히 500 에러 상태로,
복구할지 같이 폐기할지는 별도 결정 대기 중이다. AWS 쪽 Lambda 함수/EventBridge
스케줄은 소스만 지웠을 뿐 아직 남아있을 수 있다 — 실제 삭제는 수동.

---

### Backend Module Layers

```
handlers/           → Lambda entry points. Each handler does its own HTTP method + path
                     routing internally (not relying on API Gateway routing).
                     읽기/쓰기 API: article_collector, search, article, chatbot,
                     time_machine, s3_articles, user, archive, post, question, briefing,
                     health, today_letters, subscribe, front_page(⚠️ 500 에러 상태,
                     아래 clients/ 참조), cms_posts_public, newsletter.
                     2026-07-30 폐기: engagement, tts, metrics, abtest, translation
                     (30일 실호출 0 + 프론트 미참조). `pipeline/` 디렉터리 전체도
                     함께 삭제. 2026-08-04 폐기: core2_transform, core1_5_selector,
                     core3_consolidate, core3_record_interaction (RDS·해당 Lambda 자체가
                     삭제됨). 2026-08-05 폐기: core1_collector(수집 크론),
                     core25_editor_pick(편지 생성 크론), core3_feed/core3_article
                     (개인화 피드·기사 — 2026-05-13부터 항상 빈 응답만 내던 죽은 코드)
                     — 자동생성 파이프라인 자체를 관리자 수동 업로드로 대체하기로
                     결정. 경위·복원: infrastructure/decommission-2026-07-30/README.md
newsletter/         → render.py/sender.py/subscribers.py — 뉴스레터 구독/발송.
                     handlers/subscribe.py가 사용. handlers/newsletter.py 자체의
                     배포된 Lambda는 2026-07-30 폐기됐지만(미결선·실호출 0),
                     패키지는 subscribe.py의 라이브 의존성이라 유지. `_load_today_letters()`는
                     `clients/daily_letters_ddb_client.py`(today_letters.py와 동일 소스)를
                     1순위로 쓰고, 실패 시 로컬 미러(`newsletter/local_letters.py`)→
                     하드코딩 mock 순으로 폴백한다.
clients/            → Service clients: dynamodb, personal_db, s3_article, s3_xml,
                     embedding (Titan), translate (AWS Translate).
                     daily_letters_ddb_client / cms_posts_ddb_client 는 옛 v2 소스
                     통합분 — today_letters·newsletter·cms_posts_public이 사용.
                     ⚠️ `pgvector_v2_client.py` — 원래 1986줄·34메서드 God Object였다
                     (기사 수집, MBTI 버전, 유저 프로필/인터랙션, 자동생성 파이프라인
                     전체가 여기 있었음). 파이프라인 폐기로 대부분 삭제하고
                     `handlers/front_page.py`가 쓰는 2개 메서드(`get_front_page_articles`,
                     `get_latest_front_page_date`) + connection 스캐폴딩만 남겼다.
                     **다만 front-page도 같은 RDS에 의존해 지금 500 에러 상태다** —
                     이 클라이언트를 고친 게 아니라 죽은 메서드만 걷어낸 것. front-page
                     복구 여부는 별도 결정 사항.
                     s3_article_v2_client 도 front_page.py 가 사용 (S3 본문 조회).
                     Bedrock Claude is wrapped by clients/mbti_transform_service.py (unusual
                     placement — it's a service file inside clients/). Polly has no client file;
                     podcast_handler calls boto3 polly directly (tts_handler 는 폐기).
                     ⚠️ opensearch_client.py 는 2026-08-05 삭제됐다 — 어떤 handler 도
                     import하지 않던 죽은 코드였다(원래 도메인 sedaily-mbti-search-dev도
                     2026-08-04 삭제). search_handler.py/chatbot_handler.py 는 처음부터
                     DynamoDB GSI 쿼리로 검색·RAG-유사 기능을 구현했다.
repositories/       → Business-level data access on top of clients (Personal, Settings, Log)
services/           → Business logic: article_filter, prompt_service, prompt_loader,
                     metrics, briefing_generator (used by briefing_handler),
                     stock_service (used by chatbot_handler for inline stock lookups)
models/             → Dataclasses: Article, UserProfile/ArchivedSentence/ReadingRecord
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
                     transform/ (nt/nf/st/sf.md), chatbot/ (nt/nf/st/sf.md),
                     selection/ (article_scorer.md), validation/ (validator.md),
                     podcast/ (podcast_script.md), question/ (daily_question.md).
                     editor_letter/ + editor_letter_v3/ 는 2026-08-05 core25와 함께 삭제
utils/              → Small helpers included in the Lambda zip: date_utils.py,
                     hash_utils.py. Not a layer in the architectural sense —
                     just shared utilities.
common/             → Cross-track shared utilities (모든 handler + admin이 import).
                     - `feature_flag.py` — DDB-backed feature flags + numeric thresholds.
                     Fail-open / fail-safe, own 5-min TTL cache.
                     - `secrets.py`      — SSM SecureString reader. Fail-closed, own
                     5-min TTL cache.
                     - `http.py`         — CORS-neutral response builder (`success`/`error`/
                     `json_dumps`). No cache; doesn't import `config/` so CORS can't leak
                     in. `core/response.py` and `admin/shared/response.py` both delegate
                     to it (CORS injected by the caller, not this module).
                     - `errors.py`       — `BackendError` hierarchy + `EXCEPTION_STATUS_CODES`
                     + `get_status_code_for_exception()`; `core/exceptions.py` re-exports it.
                     Bundled into the Lambda zip by `deploy.sh` and the admin zip by
                     `admin/deploy-admin-api.sh`. Import path inside Lambda:
                     `from common.<module> import ...` (zip root, no `backend.` prefix).
infrastructure/     → 프로비저닝 스크립트 + 문서. cost_monitoring.sh, provision.sh,
                     provision_pgvector.sh(v1), provision_opensearch.sh, setup_ecr.sh
                     (Chat Agent용, 별도 미래 기능), setup_s3_v2.sh(front_page가 쓰는
                     s3_article_v2_client 버킷 — front-page 폐기 전까진 유지).
                     decommission-2026-07-30/ 는 v1 Step Functions 파이프라인 폐기 기록.
                     2026-08-05: pgvector 스키마·자동생성 파이프라인 전용 프로비저닝
                     스크립트(schema_v2.sql, init_pgvector_v2.py, provision_pgvector_v2.sh,
                     verify_opus_baseline.py, setup_selector_trigger.sh,
                     setup_transform_trigger.sh, setup_eventbridge_v2.sh) 삭제 — 필요하면
                     git 히스토리에서 복원 가능.
observability/      → CloudWatch 대시보드 정의 (Bedrock 토큰·비용 proxy)
```

`scripts/`와 `tools/`는 2026-08-05 파이프라인 폐기와 함께 내용이 전부 사라져(스키마
적용 스크립트, 로컬 editor-pick 테스트, v1→pgvector 백필 도구 모두 그 파이프라인
전용이었음) 디렉터리 자체를 지웠다.

A legacy `service/backend/MBTI_TRANSFORM_PROMPT.md` still sits at the backend root as the last-resort fallback for `clients/mbti_transform_service.py`. The canonical prompts live in `prompts/transform/` now — don't edit the root file.

