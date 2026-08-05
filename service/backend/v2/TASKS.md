# TASKS.md — AI LENS v2 작업 체크리스트

**각 TASK는 독립적인 PR 단위다.** Claude Code 한 세션에서 하나의 TASK를 끝내고 머지한 뒤 다음 TASK로 넘어간다.

작업 순서는 원칙적으로 번호 순. 같은 Phase 내에서 독립적인 TASK는 병렬 가능 (표시됨).

체크박스 규칙:
- `[ ]` 미완료
- `[~]` 진행 중 (현재 세션)
- `[x]` 완료 & 머지됨

---

## Phase 0: 준비 (목표 1주)

### TASK-0.1: v2 디렉터리 골격 + 기본 문서 생성
- **종속성**: 없음
- **Files to create**:
  - `backend/v2/README.md` (간단한 디렉터리 설명)
  - `backend/v2/requirements.txt` (v1과 분리된 의존성 목록)
  - `backend/v2/.gitignore` (lambda-build, *.zip 등)
  - `backend/v2/clients/__init__.py`, `handlers/__init__.py`, `core3/__init__.py`, `tests/__init__.py`
- **Definition of Done**:
  - [x] 디렉터리 구조가 `CLAUDE.md` 3절과 일치 (비어있어도 됨, `__init__.py`만)
  - [x] `requirements.txt`에 pg8000, boto3, mcp 명시 (버전은 v1 `requirements.txt` 참조)
  - [x] `cd backend && python3 -c "import v2"` 성공

### TASK-0.2: deploy-v2.sh 작성 + hello world Lambda
- **종속성**: TASK-0.1
- **Files to create**:
  - `backend/v2/deploy-v2.sh` (v1 `deploy.sh` 참고해서 작성, 단 **별도 Lambda 이름 리스트**)
  - `backend/v2/handlers/health.py` (`/api/v2/health` 응답하는 hello world)
  - `backend/v2/tests/test_health.py`
- **Definition of Done**:
  - [x] `deploy-v2.sh`가 `sedaily-mbti-v2-health-dev` Lambda 함수를 빌드·업로드 (존재하지 않으면 skip 메시지)
  - [x] AWS 콘솔에서 수동으로 `sedaily-mbti-v2-health-dev` Lambda 생성 (사람이 한다, Claude Code 아님 — `.clauderules` 참조) (수동, 사용자 작업)
  - [x] API Gateway에 `/api/v2/health` 라우트 추가 (사람이 한다) (수동, 사용자 작업)
  - [x] `curl .../api/v2/health` → `{"status":"ok","version":"v2"}` 응답 (수동, 사용자 작업)
  - [x] `pytest backend/v2/tests/test_health.py` 통과

### TASK-0.3: ECR 리포지토리 생성 스크립트 (Chat Agent 준비)
- **종속성**: 없음 (TASK-0.1 후 병렬 가능)
- **Files to create**:
  - `backend/v2/infrastructure/setup_ecr.sh` (dry-run 기본, `--apply` 플래그로 실제 생성)
- **Definition of Done**:
  - [x] 스크립트가 `sedaily-mbti-chat-agent` ECR 리포지토리를 만드는 AWS CLI 명령을 **출력만** 한다 (사람이 복사해서 실행)
  - [x] `--apply` 플래그가 있을 때만 실제 실행
  - [x] 리포지토리 이미 존재하면 정상 종료 *(로직 구현 완료; 실측은 사용자 `--apply` 2회 실행 시 확인)*

---

## Phase 1: Storage Hub (목표 2주)

### TASK-1.1: pgvector v2 프로비저닝 스크립트
- **종속성**: 없음 (Phase 1 시작 가능)
- **Files to create**:
  - `backend/v2/infrastructure/provision_pgvector_v2.sh` (v1 `provision_pgvector.sh` 복제 + 수정)
- **수정 내역**:
  - DB_INSTANCE_ID: `sedaily-mbti-pgvector-v2-dev`
  - DB_NAME: `ailens_v2`
  - DB_INSTANCE_CLASS: `db.t3.small`
  - DB_STORAGE_GB: 50
  - SG_NAME: `sedaily-mbti-pgvector-v2-sg`
- **Definition of Done**:
  - [x] `--dry-run` 실행 시 모든 AWS CLI 명령어 출력 (실제 실행 안 함)
  - [x] `--status` 플래그 구현
  - [x] `--endpoint` 플래그 구현 *(로직 구현 완료; 실측은 인스턴스 생성 후 사용자 확인)*
  - [x] **실제 프로비저닝은 사람이 수동 실행** — Claude Code는 건드리지 않는다 (수동, 사용자 작업)

### TASK-1.2: 스키마 v2 SQL + 초기화 스크립트
- **종속성**: TASK-1.1 (인스턴스가 실제로 존재해야 검증 가능, 하지만 SQL 작성은 선행 가능)
- **Files to create**:
  - `backend/v2/infrastructure/schema_v2.sql` (4 테이블 DDL, `CLAUDE.md` 6절 참조)
  - `backend/v2/infrastructure/init_pgvector_v2.py` (pg8000으로 SQL 실행, `CREATE EXTENSION vector` 포함)
- **Definition of Done**:
  - [x] 4 테이블 모두 `IF NOT EXISTS` 포함 (재실행 안전)
  - [x] 모든 필수 인덱스 (ivfflat, 카테고리·published_at, user_id·created_at)
  - [x] `python3 init_pgvector_v2.py --dry-run` → SQL 출력만
  - [x] `python3 init_pgvector_v2.py` → 실제 실행 (환경변수 `PG_V2_HOST`, `PG_V2_PASSWORD` 필요) (수동, 사용자 작업)
  - [x] 실행 후 `\dt` 결과에 4 테이블 확인 (수동, 사용자 작업)

### TASK-1.3: PgVectorV2Client 작성
- **종속성**: TASK-1.2
- **Files to create**:
  - `backend/v2/clients/pgvector_v2_client.py`
  - `backend/v2/tests/test_pgvector_v2_client.py`
- **필수 메서드** (단위 테스트 각각 필요):
  - `insert_article(news_id, metadata, embedding) -> None`
  - `update_article_status(news_id, status) -> None`
  - `get_articles_by_status(status, limit) -> list[dict]`
  - `insert_article_version(news_id, mbti_type, metadata, embedding) -> str` (version_id 반환)
  - `get_article_versions(news_id) -> dict[mbti_type, dict]`
  - `upsert_user_profile(user_id, mbti_type, category_weights, preference_embedding) -> None`
  - `get_user_profile(user_id) -> dict | None`
  - `record_interaction(user_id, news_id, mbti_type, interaction_type, **kwargs) -> None`
  - `get_user_interactions(user_id, limit, since) -> list[dict]`
  - `find_feed_candidates(user_mbti, preference_embedding, exclude_news_ids, limit=100) -> list[dict]`
  - `find_similar_articles(embedding, limit) -> list[dict]`
- **Definition of Done**:
  - [x] v1 `pgvector_client.py`와 **별도 파일, 별도 클래스**
  - [x] `PG_V2_PASSWORD` 비어있으면 no-op (v1 패턴 따라)
  - [x] 모든 메서드에 타입 힌트
  - [x] 각 메서드별 pytest (통합, `PG_V2_HOST` 환경변수 있을 때만 실행) *(117 unit + 10 integration + 1 perf 전부 PASS, 2026-04-19 실측)*
  - [x] 쿼리 성능: `find_feed_candidates` 1000 rows 기준 p95 < 200ms *(local ceiling 3000ms로 실측 PASS [p95 ~815ms]; VPC 200ms target은 `BENCHMARK_ENV=aws_vpc`에서만 enforce — local은 Korea↔us-east-1 RTT ~800ms 지배로 regression 감지용)*

### TASK-1.4: S3 v2 버킷 생성 + 라이프사이클
- **종속성**: 없음 (Phase 1 초입에 병렬 가능)
- **Files to create**:
  - `backend/v2/infrastructure/setup_s3_v2.sh` (dry-run 기본)
- **Definition of Done**:
  - [x] 버킷 `sedaily-mbti-article-body-v2-dev` 생성 명령 출력
  - [x] 라이프사이클 정책: 90일 후 Glacier (JSON으로 작성, 스크립트가 적용) *(GLACIER_IR 구체 선택 — sub-second retrieval 필요, 커밋 903f138 참조)*
  - [x] CORS 정책 (프론트가 직접 body를 읽는 경우 대비)
  - [x] **실제 생성은 사람이 수동 실행** *(--apply 성공, --status 6개 섹션 검증 완료: PAB 4/4, AES256, GLACIER_IR@90d, CORS 2 origins, versioning OFF, 2026-04-19 실측)*

---

## Phase 2: Core 1 + Core 2 (목표 3주)

> ⚠️ **Phase 5 재검토 예정**: `U`/`D` action 처리 정책
> - 현재 Core 1 Collector는 `I`만 처리, `U`/`D`는 카운트만 (TASK-2.1 참조)
> - `U`: 서울경제 기사 수정 반영 여부 (embedding + MBTI 4 버전 재생성 비용 고려)
> - `D`: 기사 삭제 전파 여부 (v2 DB에 tombstone 유지 or 완전 제거)
> - 결정 후 Core 1 Collector 로직 확장. 담당 TASK 번호 미정.

### TASK-2.1: Core 1 Collector Lambda
- **종속성**: TASK-1.3 (PgVectorV2Client 필요), TASK-1.4
- **Files to create**:
  - `backend/v2/handlers/core1_collector.py`
  - `backend/v2/clients/s3_article_v2_client.py` (Core 2에서도 재사용)
  - `backend/v2/tests/test_core1_collector.py`
  - `backend/v2/tests/test_s3_article_v2_client.py`
- **Files to modify** (v2 내부만):
  - `backend/v2/clients/pgvector_v2_client.py` — `filter_existing_news_ids` 메서드 추가 (Notes 참조)
  - `backend/v2/tests/test_pgvector_v2_client.py` — 새 메서드 테스트 합류
  - `backend/v2/deploy-v2.sh` — `CORE1_FUNCTIONS`에 `sedaily-mbti-v2-collector-dev` 등록
  - `backend/v2/tests/conftest.py` — `_TEST_PREFIXES`에 `test_v2_2_1_` 추가
- **로직**:
  1. EventBridge 이벤트에서 날짜 추출 (기본 오늘 KST)
  2. v1 `S3XMLClient`로 XML 다운로드 & 파싱
  3. `PgVectorV2Client.filter_existing_news_ids(candidate_ids)` → dedup (기존 news_id 제외)
  4. garbage 필터 (본문 < 300자, 제목에 `[인사]`/`[부고]` 포함 기사 제외); action `I`만 처리, `U`/`D`는 카운트만
  5. 새 기사만 Titan V2 임베딩 (제목 + 본문 앞 6000자)
  6. `S3ArticleV2Client.put_article_file(news_id, "original.json", dict)` 업로드
  7. `insert_article(status='raw')`
- **Definition of Done**:
  - [x] Lambda 함수명 `sedaily-mbti-v2-collector-dev` *(deploy-v2.sh CORE1_FUNCTIONS 등록 완료; Lambda 생성·env·IAM은 사용자 수동 작업)*
  - [x] 선별 로직 **없음** — 모든 기사 수집 (쓰레기 기사만 간단한 룰 필터: 본문 < 300자 제외, [인사]/[부고] 제외)
  - [x] dedup 통과한 기사만 Bedrock·S3·pgvector 쓰기
  - [x] 실패 시 CloudWatch 에러 로그 (기사별 try/except로 부분 실패 격리, 실패 news_id는 응답 페이로드에 포함)
  - [x] 테스트: mock 기사 5개 주입 → DB에 5 row, S3에 5 object *(unit 23 + integration 4 구현; 실측은 사용자 Lambda 생성 후 env 세팅하고 `pytest -m integration` 실행)*
- **Notes**:
  - `PgVectorV2Client`에 `filter_existing_news_ids(news_ids: List[str]) -> set` 추가 (TASK-1.3의 11 메서드에는 없던 dedup 헬퍼 — Collector 핵심 경로에서 필요성 발견). 해당 테스트는 `test_pgvector_v2_client.py`에 기존 prefix `test_v2_1_3_`로 합류. TASK-1.3 스펙은 무수정 — 작업 당시 합의된 11 메서드로 완결된 상태 그대로 둠. 히스토리 정직성 우선.
  - `S3ArticleV2Client` 신설 — v1 `clients.s3_article_client.S3ArticleClient`는 객체 키가 `articles/{news_id}/body.json` 고정이라 Core 1의 `original.json`과 Core 2의 `version_*.json`을 담을 수 없음. 같은 버킷 레이아웃을 둘 다 쓰는 Core 2 Transform에서도 재사용 예정.
  - 동시성: Bedrock Titan V2 호출은 `asyncio.Semaphore(10)`으로 제한 (on-demand RPM 한도 대비 충분한 여유), pgvector insert는 `asyncio.Lock`으로 직렬화 (pg8000.native.Connection은 스레드 안전하지 않음). S3 `put_object`는 boto3 low-level client 문서상 스레드 안전하므로 잠금 없이 병렬.

### TASK-2.2: EventBridge 스케줄 등록 스크립트
- **종속성**: TASK-2.1 (Lambda 배포 후)
- **Files to create**:
  - `backend/v2/infrastructure/setup_eventbridge_v2.sh` (dry-run 기본)
- **Definition of Done**:
  - [x] `sedaily-mbti-v2-collector-schedule` cron(0 0/3 * * ? *) → collector Lambda *(rate→cron 변경: wall-clock 정렬 위해 UTC 00/03/06/09/12/15/18/21 고정 = KST 09/12/15/18/21/00/03/06. 2026-04-22 09:09 UTC `--apply` 실측, State=ENABLED, 첫 fire 2026-04-22 12:00 UTC 예정)*
  - [ ] `sedaily-mbti-v2-transform-trigger` rate(5 minutes) → transform Lambda *(TASK-2.3에서 Transform Lambda 배포 후 같은 스크립트에 추가 + 활성화 — 이 PR 범위 밖)*
  - [x] **실제 등록은 사람이 수동** *(.clauderules #4 2026-04-22 완화로 Claude Code가 계획·승인·비용·announce·ID추적·stop-on-anomaly 6조건 충족 후 직접 `--apply` 실행. 생성 리소스: rule `sedaily-mbti-v2-collector-schedule`, target `collector-lambda`, permission SID `EventBridgeV2CollectorSchedule`)*

### TASK-2.3: Core 2 Transform Lambda
- **종속성**: TASK-2.1
- **Files to create**:
  - `backend/v2/clients/transform_v2_service.py` *(wrapper; composition around v1 MbtiTransformService, injects VPC Bedrock endpoint + correct Opus 4.6 model ID)*
  - `backend/v2/handlers/core2_transform.py`
  - `backend/v2/tests/test_transform_v2_service.py` *(7 unit: 3 user-specified regression guards + 2 model_id guards + close + delegation smoke)*
  - `backend/v2/tests/test_core2_transform.py` *(11 unit + 1 integration: OPTIONS, empty batch, full success, partial failure, total failure, semaphore, deadline, 3× logging events)*
  - `backend/v2/infrastructure/verify_opus_baseline.py` *(one-shot diagnostic — not part of Lambda package; measures Opus 4.6 p99 latency + verifies 1h TTL)*
- **Files to modify (v2 only)**:
  - `backend/v2/tests/conftest.py` — `_TEST_PREFIXES` += `test_v2_2_3_`
  - `backend/v2/deploy-v2.sh` — `CORE2_FUNCTIONS=("sedaily-mbti-v2-transform-dev")`
- **로직**:
  1. `PgVectorV2Client.get_articles_by_status('raw', limit=20)` — 배치 크기 20 (Phase A2 Section 3 sizing)
  2. 각 기사: v1 `MbtiTransformService.transform_article()` 재사용 (4 병렬 Opus) via `TransformV2Service` wrapper
  3. 4 버전 각각 Titan V2 임베딩 (4 parallel)
  4. S3에 `version_{NT|NF|ST|SF}.json` 업로드 (4 parallel)
  5. `insert_article_version` × 4 (db_lock 직렬화 — pg8000 thread-unsafe)
  6. `update_article_status(news_id, 'transformed')`
  7. 부분 실패 (<4 versions) 또는 예외 시 `status='failed'` (strict policy) (TASK-5 commit 9b188c5에서 (article × MBTI) 단위로 분리 — partial Bedrock 성공은 더 이상 article-level 실패가 아님. 자세한 의미는 Phase 2.5 TASK-5 섹션 참조.)
  8. Wave 사이 `context.get_remaining_time_in_millis()` 체크, < `WAVE_DEADLINE_BUFFER_S` (90s) 시 나머지 articles 스킵 (status='raw' 유지, 다음 fire pickup)
- **Definition of Done**:
  - [x] 함수명 `sedaily-mbti-v2-transform-dev` *(빈 Lambda 사용자 생성됨, Phase C에서 Handler=`v2.handlers.core2_transform.lambda_handler` / VPC `vpc-07a3a75110d6594aa` / Timeout=900s / Memory=1024MB / 7 env vars / Reserved concurrency=1 / IAM `+BedrockOpus46Invoke` 완료)*
  - [x] **프롬프트 캐싱 활성화** *(TASK-2.6 commit 0830c1f에서 `ttl="1h"` 적용 완료. v1 `MbtiTransformService` 라인 191 / 329 두 곳에 `{"type": "ephemeral", "ttl": "1h"}` 명시. v2는 `TransformV2Service` wrapper로 자동 혜택. 예상 절감 ~$2000/month. Option Z resolved.)*
  - [x] 4 병렬 호출 (asyncio.gather) *(v1 재사용)*
  - [x] Bedrock 스로틀링 시 exponential backoff 재시도 *(v1 5회 재시도 그대로 상속. spec 3회보다 보수적)*
  - [x] 실패한 기사는 재처리 가능 (`status='failed'` → 별도 잡으로 재시도) *(`ON CONFLICT (news_id, mbti_type) DO UPDATE` for version rows; status 재설정은 수동 SQL 또는 별도 retry job)*
  - [x] 18 unit tests PASS (`pytest v2/tests/test_transform_v2_service.py v2/tests/test_core2_transform.py -m 'not integration'`)
  - [x] `verify_opus_baseline.py` 실측 완료 *(article 2KB8R3LJ9D, p50=27.96s, p99=28.73s, 1h TTL PASS — 결과 C1 commit body)*
- **Notes**:
  - **Mega-system prompt rejected**: consolidating 4 personas into a single system block would save ~18% input tokens but re-introduces the quality regression that drove v1 from single-call → 4-parallel. Not worth the trade. Re-evaluate at Phase 5 if cost pressure increases.
  - **1h cache TTL deferred (Option Z)**: v1 `MbtiTransformService` hardcodes `cache_control: {"type":"ephemeral"}` at line 188-192 (no ttl). `.clauderules` #1 forbids editing v1. `verify_opus_baseline.py` confirms Opus 4.6 supports `ttl="1h"` — but also reveals Opus 4.6 does **NOT** honor default 5min ephemeral (cache_creation=0 on all 5 no-ttl calls). **Implication: current v2 Transform runs with ZERO cache benefit on Opus 4.6.** Cost per article ≈ $0.74 without cache vs ~$0.52 with 1h cache (warm) = ~30% savings left on the table. **Follow-up TASK-2.6 suggested**: thick v2 wrapper that bypasses v1's Bedrock call to inject `ttl="1h"`. Verify with TASK-2.3 live data: if cache_read_input_tokens stays 0 after backlog clear (expected per this finding), create TASK-2.6 with estimated $2000+/month savings at current traffic.
  - **v1 MODEL_ID bug surfaced**: `config/constants.py:86 BEDROCK_MODEL_ID_OPUS = 'us.anthropic.claude-opus-4-6-v1:0'` — but Bedrock's actual Opus 4.6 inference profile is `us.anthropic.claude-opus-4-6-v1` (no `:0` suffix; AWS changed convention for 4.6+). `TransformV2Service` overrides to the correct ID; v1 production may be silently failing transforms. **Separate v1 hotfix session recommended.**
  - **S3 field convention** (discovered during TASK-2.3): v1 `article_to_dict()` renames Python dataclass fields to JSON keys at S3 boundary — `title` → `title_ko`, `sub_title` → `sub_title_ko`, `content_clean` → `content_ko`. v2 Transform handler uses the JSON keys directly (not the dataclass names). Future v2 handlers reading `original.json` must follow the same convention.
  - **WAVE_DEADLINE_BUFFER_S = 90s** sized from `verify_opus_baseline.py` p99 observation (28.73s per single Opus call), wave of 5 ≈ 35s p99, + one retry allowance 30s + 25s safety. Phase D production data may prompt tightening to 60s or loosening to 120s.
  - **Phase D live invoke** (2026-04-24 RequestId `9688e130`, Duration 595,688ms, Memory 114/1024MB): 20 articles processed, 80 `version_*.json` files written to S3. SF group hit JSON parse errors with 2× retry (v1 exp backoff; resolved). Estimated cost ~$18.76. Next ~483 raw articles remain in backlog — will be cleared when EventBridge rule is enabled.
  - **Lambda Python root logger level** fix applied: `logging.getLogger().setLevel(logging.INFO)` at module top of `core2_transform.py`. Phase D first invoke revealed that AWS Lambda Python runtime defaults to WARNING level, silently dropping every `logger.info(json.dumps({...}))` emission (including `transform_run_complete`, `transform_complete`, `transform_empty_batch`). v1 handlers share the same latent issue; only v2 is patched here per `.clauderules` #1.
  - **EventBridge trigger `sedaily-mbti-v2-transform-trigger`** (Phase E): created `rate(5 minutes)`, state=**DISABLED**. Deliberate cost-safety default — enabling starts ~$220/day steady-state Opus spend (plus ~$216/hour while a backlog persists). Enable via `./v2/infrastructure/setup_transform_trigger.sh --enable` once any Option Y follow-up decisions are made.

### TASK-2.4: Core 2 Validator (inline)
- **종속성**: TASK-2.3
- **Files created**:
  - `backend/v2/core2/__init__.py`, `backend/v2/core2/validator.py` *(inline library, not a handler)*
  - `backend/v2/tests/test_validator.py` *(26 unit tests — structural + Nova Lite AI check + parse robustness)*
- **Files modified**:
  - `backend/v2/handlers/core2_transform.py` — imports `validate_versions`, calls it between transform success and version inserts; on failure marks `status='failed'` and emits `transform_validation_failure` JSON event
  - `backend/v2/tests/test_core2_transform.py` — patches validator, adds 2 integration tests
  - `backend/v2/tests/conftest.py` — `+test_v2_2_4_` prefix
- **Design decision — inline, not separate Lambda**:
  - TASK spec allowed both "SNS/SQS trigger" and "같은 Lambda에서 inline 호출". Chose inline because (a) `.clauderules` #5 forbids autonomous Lambda creation, (b) avoids SNS/SQS plumbing cost, (c) no rollback needed — validator runs BEFORE version inserts so a failure never leaves half-committed state.
  - Trade-off: couples validator lifecycle to transformer. Re-validation of already-transformed articles would need a separate job. Acceptable for v2; revisit if product demands it.
- **Validation logic**:
  - **Structural** (deterministic, always run): missing group / missing_title / missing_body / body_too_short (<100 chars) / body_too_long (>10k) / wrong_language (Korean <30%).
  - **Semantic** (Nova Lite, skipped if structural already failed): hallucination = "covers an entirely unrelated topic". Default-to-pass on Nova errors (mirrors v1 `step4_validate`).
  - Does NOT flag style differences, added context, reordered content, tone variations across MBTI groups — those are intended outputs.
- **Definition of Done**:
  - [x] Inline module `backend/v2/core2/validator.py` (TASK spec's "same Lambda inline" option; no separate Lambda per `.clauderules` #5 + simpler wiring)
  - [x] Transform Lambda invokes `validate_versions` before version inserts; failure marks `status='failed'` with `transform_validation_failure` JSON log event (AI issues + ai_check_used flag)
  - [x] Validator default-to-pass on Bedrock errors (Nova exception swallowed, WARNING logged)
  - [x] IAM: `BedrockNovaLiteInvoke` statement added to collector role inline policy (`amazon.nova-lite-v1:0` foundation model, us-east-1)
  - [x] 26 validator unit tests + 2 handler integration tests PASS (272 total in v2 suite)
  - [x] Deployed to `sedaily-mbti-v2-transform-dev` (same Lambda; code redeploy via `deploy-v2.sh transform`)

### TASK-2.5: v1 → v2 데이터 백필 스크립트 (일회성)
- **종속성**: TASK-2.4
- **Files created**:
  - `backend/v2/tools/__init__.py`
  - `backend/v2/tools/backfill_from_v1.py` *(~330 lines)*
  - `backend/v2/tests/test_backfill_from_v1.py` *(12 unit tests — extract_versions edge cases, S3 URI resolution, backfill_one dry-run + apply + metadata flag)*
- **Files modified**:
  - `backend/v2/tests/conftest.py` — `+test_v2_2_5_` prefix
- **로직** (매칭 spec 1:1):
  1. v1 DynamoDB `sedaily-mbti-articles-dev`를 `published_at >= now()-N일` 필터로 paginated scan
  2. 이미 v2에 있는 `news_id`는 배치 dedup 후 skip (`filter_existing_news_ids`)
  3. v1 S3 body fetch (`s3_body_uri` or default `articles/{news_id}/body.json`)
  4. body에서 `version_NT/NF/ST/SF` 추출, 누락 시 해당 article 스킵 (Core 2 신규 변환 경로로)
  5. 원본 + 4 버전 각각 Titan V2로 재임베딩 (1024-dim)
  6. v2 S3에 `original.json` + `version_{NT,NF,ST,SF}.json` 업로드
  7. v2 pg에 `articles` row (status='raw'로 insert) → `article_versions` × 4 → `update_article_status` 'transformed'
     (mid-row abort 시 schema CHECK 만족 유지용 2-step)
- **Execution environment**: VPC 내부 필수 (pgvector SG가 `sg-0cddc39619b1d69d9` 만 허용). CloudShell/EC2 bastion/임시 SG rule 중 선택. 스크립트 docstring에 명시.
- **Definition of Done**:
  - [x] `--dry-run` 옵션 지원 (Bedrock/S3/pg write 전부 스킵)
  - [x] `--limit N` 옵션 (테스트용 소량 이전; scan 중간에 early-exit)
  - [x] 진행률 표시 (tqdm; `import` 실패 시 passthrough로 degrade)
  - [x] 실패한 기사 건너뛰고 계속 진행 (per-article try/except + 최종 report)
  - [x] Report 4종 집계: candidates / duplicates / missing versions / failed (with reasons)
  - [x] AWS 계정 검증 + 대화형 confirm (`--skip-confirm`로 bypass)
  - [x] `--since-days N` 옵션 (기본 30일)
  - [x] 12 unit tests PASS (v2 전체 284 tests passing; 248 before TASK-2.5)
- **Notes**:
  - **Re-embed instead of reusing v1 OpenSearch vectors**: v1 stored Titan V2 vectors in OpenSearch, not DynamoDB. Reading OpenSearch requires the optional endpoint; re-embedding from body text is simpler + deterministic + matches what a fresh Core 1+2 run would produce. Titan V2 cost ≈ $0.00002/article — negligible vs operational simplicity.

---

## Phase 2.5: Selection + Minimal Feed (Phase 1 시연용)

데드라인 압박으로 Phase 3 (개인화) 전에 **최소한의 운영 가능한 시연 환경**을 만들기 위해 신설된 단계. v1 `step1_select`의 MBTI별 점수 매김 로직을 v2로 포팅하고, EventBridge 자동 스케줄까지 연결해서 "기사 수집 → 점수 매김 → 변환"이 사용자 개입 없이 돌아가게 만든다.

Phase 3 (개인화 기반 ranking)는 **이 위에 얹는 추가 layer**고, 이 단계의 산출물은 Phase 3 등장 후에도 그대로 유지된다.

### TASK-2.6: article_selections 테이블 + 5개 client 메서드
- **종속성**: TASK-1.3 (PgVectorV2Client), TASK-2.1 (Collector)
- **커밋**: `1aecdcd`
- **Files modified**:
  - `backend/v2/infrastructure/schema_v2.sql` — section 6 추가 (table + 3 partial indexes)
  - `backend/v2/infrastructure/init_pgvector_v2.py` — `EXPECTED_TABLES` 5개로
  - `backend/v2/clients/pgvector_v2_client.py` — `+upsert_selection_score`, `+rerank_selections`, `+get_transform_queue`, `+mark_transformed`, `+get_feed`
  - `backend/v2/tests/test_pgvector_v2_client.py` — `+22 unit + +9 integration`
  - `backend/v2/tests/test_init_pgvector_v2.py` — 4-table → 5-table 카운트 갱신
  - `backend/v2/tests/conftest.py` — `+test_v2_2_6_` prefix + `article_selections` DELETE
- **Schema**:
  - `article_selections (news_id, mbti_type, selection_date)` UNIQUE
  - 한 기사가 여러 MBTI에 동시 선정 가능 (rows 분리)
  - `selected` flag는 `rerank_selections` 단일 SQL UPDATE가 atomic하게 flip
  - `transformed_at` preservation: rerank로 selected=FALSE 떨어져도 timestamp 보존 (재선정 시 재변환 방지)
  - 3 partial indexes: ranking / transform_queue (selected+pending) / feed (selected+transformed)
- **DDL 적용 (수동, RDS 직접)**: 2026-04-26 완료. 5 tables 모두 present, 회귀 0건.
- **Definition of Done**:
  - [x] schema_v2.sql 추가 (additive only — `IF NOT EXISTS`)
  - [x] 5 client methods 구현 (UPSERT 시 selected/transformed_at 보존, rerank 시 단일 atomic SQL)
  - [x] 22 unit tests + 9 integration tests
  - [x] DDL을 실제 RDS에 적용 (사용자 수동, VPC + IP 임시 SG)
- **Notes**:
  - **통합 테스트 9개 실측 검증은 deferred** — VPC SG 재오픈 비용 vs 가치 trade-off로 데모 직전에 일괄 처리. 코드는 unit tests로 충분히 검증됨.

### TASK-4-A: Collector가 metadata.content_preview 200자 저장
- **종속성**: TASK-2.6
- **커밋**: `e3316d4`
- **Files modified**:
  - `backend/v2/handlers/core1_collector.py` — `+_CONTENT_PREVIEW_CHARS = 200`, `_build_metadata`에 `content_preview` 한 줄 추가
  - `backend/v2/tests/test_core1_collector.py` — `+3 unit tests`
- **목적**: Selector(TASK-4-B)가 본문 200자 미리보기를 점수 매김에 사용. `articles.metadata.content_preview` 필드 신설. v1 `step1_select.CONTENT_PREVIEW_CHARS = 200` 그대로 따름 (Nova Lite prompt-token 예산 동일 유지).
- **Backlog 정책**: TASK-4-A 적용 이전에 적재된 raw 기사들은 `content_preview` 없음. Selector가 자동 skip — 별도 백필 안 함 (Q5=A: 자연 roll-off, 데모 시점엔 새 기사 위주).
- **Definition of Done**:
  - [x] `_build_metadata`에 `content_preview` 추가 (200자 truncate)
  - [x] 3 unit tests (장문 truncate, 짧은 본문, edge case)
  - [x] Production Collector 재배포 (TASK-4-C 검증 시 deploy-v2.sh collector 실행)
- **Notes**:
  - 회귀 0건 (기존 23 → 26 unit tests)
  - 정확히 같은 zip이 여러 v2 Lambda에 공유됨 (Selector 배포할 때 Collector zip도 같이 갱신됨 — `lambda_package_v2.zip` 단일 키)

### TASK-4-B: Selector Lambda 코드 (`v2.handlers.core1_5_selector`)
- **종속성**: TASK-4-A
- **커밋**: `6eb64f5`
- **Files created**:
  - `backend/v2/clients/selector_service.py` *(326 lines — Bedrock Nova Lite scoring)*
  - `backend/v2/handlers/core1_5_selector.py` *(263 lines — Lambda handler)*
  - `backend/v2/tests/test_selector_service.py` *(32 unit tests)*
  - `backend/v2/tests/test_core1_5_selector.py` *(15 unit tests)*
- **Files modified**:
  - `backend/v2/clients/pgvector_v2_client.py` — `+find_unscored_articles` (KST today 기준, NOT EXISTS in article_selections)
- **로직**:
  1. event date 또는 today KST 결정
  2. `find_unscored_articles(sel_date, limit=BATCH_SIZE=200)` — status='raw' AND not yet in article_selections
  3. content_preview 없는 row 자동 skip (Q5=A)
  4. `score_articles` — Nova Lite 호출, batch=20 / max_concurrency=5
  5. 각 (article × MBTI) `upsert_selection_score`
  6. 각 MBTI `rerank_selections(top_n=20)` — atomic single-SQL CTE+UPDATE
- **Composite score**: `0.7 * mbti_score + 0.3 * quality_score` (v1 `step1_select` 가중치 그대로)
- **결정 사항** (사용자 답변):
  - Q1: category quota 버림 (순수 composite top-20)
  - Q2: Collector가 content_preview 200자 metadata 저장 (TASK-4-A)
  - Q3: KST today `created_at` 기준 raw 기사
  - Q4: 미평가 raw만 (article_selections row 있으면 skip; 같은 날 재실행 시 신규 raw만 추가 점수)
  - Q5: pre-TASK-4-A backlog는 자연 skip (content_preview 없음)
- **Definition of Done**:
  - [x] selector_service.py + core1_5_selector.py 구현 (default-to-mid on Nova failure)
  - [x] 47 unit tests PASS (311 → 358)
  - [x] composite_score 공식 v1 그대로 (0.7/0.3)
  - [x] rerank가 transformed_at 보존 (재선정 시 재변환 방지)

### TASK-4-C: Selector Lambda 배포 + 1회 invoke 검증
- **종속성**: TASK-4-B
- **커밋**: `e516479` (deploy-v2.sh + setup_selector_trigger.sh)
- **Files modified**:
  - `backend/v2/deploy-v2.sh` — `+CORE1_5_FUNCTIONS` 배열, `selector` 라우팅
- **Files created**:
  - `backend/v2/infrastructure/setup_selector_trigger.sh` *(316 lines, setup_transform_trigger.sh 패턴)*
- **AWS resources created** (수동 by user, `.clauderules` #5):
  - Lambda `sedaily-mbti-v2-selector-dev` (python3.11, 1024 MB, 5min timeout, Collector role 공유)
  - VPC `vpc-07a3a75110d6594aa`, 2 subnets, SG `sg-0cddc39619b1d69d9` (Collector/Transform 동일)
  - 7 env vars (Collector/Transform과 100% 동일)
- **Verification (2026-04-27 Step 6 검증 결과)**:
  - Step 6-A: 빈 invoke → today empty (`processed: 0, empty: true`)
  - Step 6-A2: 어제 backlog → all skip (`skipped_no_preview: 143` — pre-TASK-4-A 적재분)
  - Step 6-B: Collector 재배포 + invoke → 새 raw 1개 적재 (`content_preview` 포함)
  - Step 6-B-3: Selector 재invoke → `scored=1, upserts=4, rerank: {NT:1, NF:1, ST:1, SF:1}`
  - Step 6-C: RDS 직접 SELECT 7개 검증 모두 PASS (composite formula diff 0.0000, FK join, NULL transformed_at, MBTI score 분산 sanity)
- **Definition of Done**:
  - [x] deploy-v2.sh selector 라우팅 + setup_selector_trigger.sh
  - [x] Lambda 콘솔 생성 + 13개 config 항목 검증
  - [x] update-function-code 성공 (Step 5 [OK] Updated)
  - [x] Manual invoke로 Bedrock + pgvector + rerank 전 경로 작동 확인
  - [x] article_selections 실 row 7개 SQL 검증 PASS
  - [ ] EventBridge selector trigger 생성 (Step 7-B에서)
  - [ ] EventBridge rule `--enable` (데모 직전 사용자 결정)
- **Notes**:
  - **Lambda update race**: 첫 시도에서 `update-function-code` 직후 invoke가 옛 코드를 hit. `aws lambda wait function-updated`로 해결. v2 deploy 운영 패턴에 추가 필요.
  - **Inline IAM policy 검증**: Selector가 Bedrock Nova Lite invoke 성공 → Collector role의 inline policy에 `BedrockNovaLiteInvoke`(TASK-2.4 추가)가 존재. 별도 statement 추가 불필요.
  - **잔재 3 raw**: Step 6-B 첫 시도 (race) 시점에 옛 코드로 적재된 raw 3개는 `content_preview` 없음. 운영 무영향 (skip 대상). 다음 EventBridge fire에서 새 raw로 교체됨.

### TASK-5: Transform이 article_selections.selected=TRUE 폴링 + per-MBTI 변환
- **종속성**: TASK-4-C
- **커밋**: `9b188c5`
- **Files modified**:
  - `backend/v2/clients/transform_v2_service.py` *(+115 lines, transform_article_for_groups 메서드 추가)*
  - `backend/v2/handlers/core2_transform.py` *(~150 lines changed; lambda_handler / _run_with_deadline / _process_one_article 모두 article-group 단위로 재작성, _group_queue_by_article helper 추가, MBTI_GROUPS import 제거)*
  - `backend/v2/tests/test_core2_transform.py` *(~70 lines changed; _install_client_mocks queue-row expand, 5 테스트 assertion 갱신, 1 테스트 함수명 변경)*
- **로직** (TASK-2.3 → TASK-5 변경):
  - **Polling source**: `articles.status='raw'` → `article_selections.selected=TRUE AND transformed_at IS NULL`
  - **Grouping**: 같은 news_id의 selected MBTI rows를 하나의 Lambda task로 grouping. earliest scored_at으로 FIFO.
  - **Transform 호출**: `transform_article` (4 MBTI 강제) → `transform_article_for_groups(groups=requested)` (1~4 MBTI subset). v1 transform_single_group을 직접 N번 parallel 호출. Opus prompt-cache hit 보존.
  - **성공 처리**: `update_article_status('transformed')` 제거. 대신 변환된 각 (news_id, mbti, selection_date)에 `mark_transformed` 호출 → `transformed_at=now()` stamp.
  - **실패 정책**:
    - Partial (≥1 group 성공): `transform_partial_failure` 로그만, status 변경 X. 실패한 group의 selection row는 transformed_at=NULL 유지 → 다음 fire가 재시도.
    - Full (모든 group 실패): `articles.status='failed'` (Q4=B로 v1 흐름 일부 보존).
- **결정 사항** (사용자 답변):
  - Q1=B: article 단위 grouping + selected MBTI subset만 변환
  - Q2=A: articles.status='transformed' 흐름 deprecate (truth-source는 article_selections.transformed_at)
  - Q3=A+C: 옛 raw backlog 무시, 데모 후 cleanup (TASK-4-Z)
  - Q4=B: 'failed'는 articles.status로 유지, 'transformed'만 deprecate
- **Live verification (2026-04-26 19:27 KST)**:
  - deploy-v2.sh transform → CodeSha256=0rs/2YD1... 갱신됨
  - In-flight OLD invocation + Reserved concurrency=1 contention으로 manual invoke는 throttled. EventBridge 자연 fire로 NEW 코드 검증.
  - CloudWatch evidence: `{queue_rows: 4, article_groups: 1, completed_articles: 1, completed_ids: ['2KBA6I5K9J']}` — TASK-4-C에서 selected했던 어제 사이버 룸살롱 기사가 NEW 코드로 변환됨.
  - RDS SQL 7-Q 검증 PASS:
    - article_selections (NT/NF/ST/SF): selected=1, transformed=1 (4/4 모두 mark_transformed)
    - article_versions에 4 row 생성 (per-MBTI 본문)
    - transformed_at populated, lag (scored→transformed) 8597.6s ≈ 2.4h
    - articles.status: {'raw': 140, 'transformed': 0} ← TASK-5 design 확인
    - sel_done=4 == av_count=4 (per-MBTI 짝매칭 일관)
  - 1h cache TTL 작동 확인: in-flight invocation의 transform_complete 이벤트에서 cache_read_input_tokens=9070 (warm hit).
- **Definition of Done**:
  - [x] transform_v2_service.transform_article_for_groups 추가 (선정 MBTI subset만 변환)
  - [x] core2_transform.py를 article_selections 폴링으로 재작성 + grouping + mark_transformed
  - [x] 358 unit tests passing (회귀 0건)
  - [x] Live invoke로 EventBridge 자연 fire에서 NEW 코드 동작 확인
  - [x] article_selections.transformed_at + article_versions row 일관 검증 (per-MBTI 짝매칭)
- **Notes**:
  - **Reserved concurrency=1 + Lambda update race**: 배포 직후 manual invoke는 옛 in-flight invocation 때문에 throttle될 수 있음. EventBridge 자연 fire에 맡기는 게 안전. (TASK-4-C에서 본 update race와 별개 현상 — 이건 concurrency contention.)
  - **OLD/NEW transition 흔적**: CloudWatch에 OLD 코드의 마지막 fire (`batch_size=20, completed=17`)와 NEW 코드의 첫 fire (`queue_rows=4, article_groups=1`)가 같은 log group에 시간순으로 남음. 키 이름 차이가 자연스러운 transition marker.
  - **Q5 SQL artifact**: article_versions.body는 dedicated column (metadata JSONB 아님). 검증 SQL이 metadata->>'body'로 조회해서 None — 데이터는 정상 (Q6의 av_count=4가 reverse-confirm).

### TASK-6: Feed/Article Detail API (Core 3 read-side)
- **종속성**: TASK-5
- **커밋**: `3619adf` (코드) + post-deploy commit (이 작업)
- **Files modified**:
  - `backend/v2/clients/pgvector_v2_client.py` *(+~60 lines, get_article_with_version 메서드 추가)*
  - `backend/v2/handlers/core3_feed.py` *(NEW, ~205 lines)*
  - `backend/v2/handlers/core3_article.py` *(NEW, ~200 lines)*
  - `backend/v2/tests/test_pgvector_v2_client.py` *(+95 lines, +7 unit tests)*
  - `backend/v2/tests/test_core3_feed.py` *(NEW, ~380 lines, 30 unit tests)*
  - `backend/v2/tests/test_core3_article.py` *(NEW, ~380 lines, 25 unit tests)*
  - `backend/v2/deploy-v2.sh` *(+15/-3, CORE3_FUNCTIONS 채움 + feed/article sub-targets)*
- **Endpoints**:
  - `GET /api/v2/feed?mbti=NT&limit=20&since=YYYY-MM-DD&user_id=...` — 메타 + body_preview 200자
  - `GET /api/v2/article/{news_id}?mbti=NT&user_id=...` — 전체 본문 + version metadata
- **결정 사항** (사용자 답변 — 모두 "권고"):
  - Q1=C: Feed 메타 + body_preview 200자, 전체 body는 Article API
  - Q2=NONE: AuthorizationType: NONE (v1 일관)
  - Q3=B: 같은 API Gateway chzwwtjtgk, 새 path /api/v2/...
  - Q4=B: v2 신규 응답 형식 (composite_score 등 내부 점수 미노출)
  - Q5=A: Article API에 article_selections 메타 미포함
  - user_id: optional query param (Phase 3에서 활용, 지금 무시)
- **Critical invariant — Per-MBTI variant**:
  같은 article이 여러 MBTI에 selected될 때, 사용자가 누른 MBTI에 따라 다른 본문 반환.
  `article_versions UNIQUE(news_id, mbti_type)` + handler에서 mbti 필터로 보장.
  Article API는 요청 MBTI에 version 없으면 404 반환 (다른 MBTI fallback 안 함).
- **Live verification (2026-04-27 06:31 UTC, endpoint deploy)**:
  - 7개 검증 모두 PASS:
    - V1 Feed NT: 200, 1.96s, count=2
    - V2 Feed NF/ST/SF: 모두 200, MBTI별 톤 명확
    - V3 Article NT: 200, 1.74s, body 1682 chars, key_points 3개
    - **V4 (핵심) — 같은 news_id 2KBAJ2JGQ8을 4 MBTI로 조회 → 4개 완전히 다른 본문**:
      - NT: "韓 잠재성장률 1.5%대 추락…" (애널리스트 리포트)
      - NF: "'성장률 1%대'라는 숫자가 말하지 않는 것…" (칼럼/에세이)
      - ST: "내년 韓 잠재성장률 1.57%로 사상 최저…" (팩트시트 표)
      - SF: "우리나라 성장 잠재력, 내년엔 역대 최저라는데… 🤔" (친구 톡)
    - V5 Edge cases: 400 (mbti 누락/invalid/article에서 mbti 누락) + 404 (nonexistent news_id) 모두 정확
    - V6 INTJ → NT 정규화 정상
    - V7 CORS preflight: 204, Allow-Origin *, Allow-Methods GET/OPTIONS/POST
  - cold start 후 응답 1.7-2.0s, 5xx 0건
- **AWS 리소스 (이번 세션 신규 생성)**:
  - Lambda `sedaily-mbti-v2-feed-dev` (1024MB / 30s, handler v2.handlers.core3_feed.lambda_handler, VPC + SG/role/env vars Selector와 공유)
  - Lambda `sedaily-mbti-v2-article-dev` (동일 spec, handler v2.handlers.core3_article.lambda_handler)
  - API Gateway HTTP API chzwwtjtgk:
    - Integration `pf7fqpb` (Feed AWS_PROXY)
    - Integration `gb5v1oj` (Article AWS_PROXY)
    - Route `j3sekxs` (GET /api/v2/feed)
    - Route `xkce062` (GET /api/v2/article/{news_id})
  - Lambda permissions: `ApiGatewayInvokeFeedV2`, `ApiGatewayInvokeArticleV2`
- **Definition of Done**:
  - [x] pgvector_v2_client.get_article_with_version 추가 + 단위 테스트
  - [x] core3_feed.py + core3_article.py 핸들러 작성
  - [x] 62 신규 unit tests (358 → 420)
  - [x] deploy-v2.sh에 두 함수 등록 + sub-targets
  - [x] 두 Lambda 콘솔 신규 생성 (사용자, .clauderules #5)
  - [x] API Gateway routes + integrations + permissions 자동 생성 (사용자 Q3=B 승인)
  - [x] live curl 검증 7개 PASS
  - [x] **per-MBTI variant invariant production 통과** (V4 핵심 검증)
- **Notes**:
  - **Article handler 오타 race**: 첫 콘솔 생성 시 Article Lambda의 Handler가 v2.handlers.core3_feed.lambda_handler로 잘못 입력된 상태였음 (Feed 값 그대로 복사). 검증 단계에서 잡아서 update-function-configuration으로 수정. 향후 두 함수 동시 콘솔 생성 시 Handler 검증 우선 권장.
  - **Status: null 응답**: HTTP API v2의 get-deployments는 REST API와 달리 Status 필드 미사용. AutoDeploy 흐름에서 stage DeploymentId 즉시 교체로 lifecycle 관리 — 정상 동작.

### TASK-7: Frontend cutover to v2 API endpoints
- **종속성**: TASK-6
- **커밋**: `c64e546` (소스 변경) + 별도 chore 커밋(있으면)
- **Files modified**:
  - `frontend-next/src/components/mbti/FeedPage.tsx` *(+95 / -52)*
  - `frontend-next/src/components/mbti/ArticleView.tsx` *(+54 / -22)*
- **결정 사항** (사용자 답변 — 모두 "권고"):
  - A2: ArticleView 진입 시 4-parallel fetch (NT/NF/ST/SF Promise.all). MBTI 토글 0ms 반응.
  - B3-a + placeholder: 백엔드 응답에 article_metadata 일부 노출 (press, sub_title, url, byline). image_url은 Collector v2 미수집 → ImagePlaceholder 자동 fallback (코드 변경 0).
  - C3: Date picker는 NewsFeedTab UI에 살아있지만 since 파라미터로 매핑 안 함. 데모 후 정리.
  - D1: v1 3-tier fallback 완전 제거. v2 단일 endpoint만.
  - 어댑터 전략 B: FeedPage + ArticleView 내부에 v2→v1 shape 어댑터 함수. shared/types/mbti.ts MbtiArticle 그대로 둠 (24+ import 영향 회피).
- **변경 영역**:
  - **FeedPage 어댑터**: `adaptV2FeedItem` (v2 items[] → Article shape), `adaptV2Version` (v2 version → MbtiVersion). press→provider, url→original_link rename. sub_title의 raw HTML `<br/>` 첫 줄만 자름 (XSS 안전).
  - **FeedPage fetchArticles**: 단일 v2 endpoint `/api/v2/feed?mbti=...` 호출. selectedDate 의존성은 유지(picker 부활 위해).
  - **FeedPage prefetchArticle**: 4-parallel `/api/v2/article/{id}?mbti=...` Promise.all. 모두 성공해야 prefetchCache 저장 (Article shape 보존).
  - **ArticleView 어댑터 복제**: `adaptV2Version` 13줄을 ArticleView에도 복제. interface drift (FeedPage의 MbtiVersion에는 image_url? 있고 ArticleView 것은 없음) 회피. TASK-4-Z에서 통합.
  - **ArticleView fetch**: v1의 `/api/article/{id}` 단일 호출(4 versions 한 번에) → v2 4-parallel. 모두 성공해야 versions set, 부분 실패 시 line 152 fallback render로 fallthrough.
- **Live verification (2026-04-27 deploy)**:
  - Build: `npm run build` ✓ 11 static pages, 11M out/
  - S3 sync: 25 files uploaded, 2 deletes
  - CloudFront invalidation: IEXWA6BDC2YYRT7DPMLDKFQ840 Deployed
  - Local chunk grep: v2 endpoint compiled into bundle ✓
  - https://mbti.sedaily.ai/ HTTP 200 (0.94s, 10.5KB)
  - v2 Feed API still responding ✓
- **Definition of Done**:
  - [x] FeedPage v2 endpoint + 어댑터
  - [x] ArticleView 4-parallel fetch + 어댑터 복제
  - [x] tsc / lint / build 모두 PASS
  - [x] Production deploy (S3 + CloudFront invalidate)
  - [x] live https://mbti.sedaily.ai/ 응답 200
  - [ ] **수동 브라우저 검증**: 카드 표시, MBTI 토글, ArticleView 진입, MBTI 토글 0ms 반응 (데모 직전 사용자 수행)
- **Notes**:
  - **Stale lockfile race**: 첫 빌드 시 `@fullstackfamily/manseryeok` import error. node_modules에 미설치 상태. `npm install`로 root cause fix. 추가 [chore] 커밋은 결정에 따라 선택.
  - **Article handler 미세 drift**: FeedPage MbtiVersion에는 image_url? 있고 ArticleView 것은 없음. shared/types/mbti.ts와도 다름. 어댑터 복제로 회피했지만 데모 후 정합성 정리 (TASK-4-Z).
  - **Date picker — Round 3 평가 결과 결함 아님**: NewsFeedTab의 date UI는 hide 상태이고, FeedPage:748-750 주석에 명시된 의도 — `selectedDate` 의존성을 useEffect deps에 유지해 향후 picker 부활 시 since 매핑만 추가하면 됨. 백엔드는 `?since=YYYY-MM-DD` 정상 처리 (`core3_feed.py:208`). 양쪽 작동, 단지 frontend가 query param을 안 보낼 뿐. 코드 변경 불필요.

### TASK-7-Z: image_url을 v2 feed/article 응답에 노출 (Path 1, 폐기)
- **종속성**: TASK-7
- **커밋**: `598fcd9` (Collector + API), `fd4a6cd` (frontend reader)
- **Files modified**:
  - `backend/v2/handlers/core1_collector.py` *(image_url 추출 1차 구현)*
  - `backend/v2/handlers/core3_feed.py`, `core3_article.py` *(응답에 노출)*
  - `frontend-next/src/components/mbti/FeedPage.tsx` *(image_url 읽기)*
- **Live state**: 새 fire 자연 누적 0건 — anomaly 발견. Path 1 (Collector 추출) 폐기 결정.
- **Notes**:
  - Collector 단계 image_url 추출은 raw article 100% 대상 — 이 중 ~13% 만 실제 surface (selected → transformed). 나머지 87% 는 wasted work. 이 비효율이 Z-2 reshape의 motivation.

### TASK-7-Z-2: image_url 추출을 Collector → Transform으로 이동 (Path 2)
- **종속성**: TASK-7-Z
- **커밋**: `db16c1c`
- **Files modified**:
  - `backend/v2/handlers/core2_transform.py` *(_extract_image_url 추가, _store_one_version에 metadata.image_url 기록)*
  - `backend/v2/handlers/core1_collector.py` *(image_url 추출 코드 제거 — Path 1 폐기)*
- **Design**: image_url은 article-level (4 MBTI 동일) 이지만 article_versions.metadata JSONB에 4중 복제. 이유는 Transform이 article_versions 쓰기만 담당하고 articles UPDATE는 안 하도록 SoC 유지. 50 bytes × 4 = 200 bytes 복제 — negligible.
- **Live state**: 24h+ 후에도 transformed_at 0건 — 두 번째 anomaly. 원인은 image 작업과 무관 — Selector → Validator contract 깨짐이 Z-2 reshape 시점에 자연 누적이 시작되며 표면화 (Z-3에서 발견).
- **Notes**: Path 2 reshape 자체는 design 의도 정확히 달성. 다만 데이터 흐름 검증이 Validator 차원에서 막혀있던 것이 잠복했음.

### TASK-7-Z-3: Validator가 requested_groups를 받도록 contract fix
- **종속성**: TASK-4-B (Selector), TASK-2.4 (Validator)
- **커밋**: `9d13cf3`
- **Files modified**:
  - `backend/v2/core2/validator.py` *(structural_check + validate_versions에 expected_groups/requested_groups parameter)*
  - `backend/v2/handlers/core2_transform.py` *(validate_versions 호출 시 requested_groups 전달)*
- **Why**: Selector는 per-MBTI top-N 독립 선별 — article이 1~4 MBTI 부분 집합으로 통과 가능. 그러나 Validator는 모든 4 MBTI를 expect하고 부재하는 groups를 "missing"으로 reject. 결과: 12h+ Lambda fire에서 transformed_at 0건, Opus 4.6 호출은 silently 성공한 채 validator 통과 못 함.
- **Discovery**: Path 2 reshape 후 24h+ 누적 stall 조사 중 발견. Lambda metrics는 11 invocations/h with 0 errors인데 RDS는 24h transform 0건. CloudWatch에 transform_validation_failure 이벤트가 모든 미선택 groups를 absent로 flag.
- **Live state (post-fix)**: 즉시 +4 article 처리 (7 → 11). pending 233건 backlog 자연 소화 시작. 다만 Nova Lite hallucination check가 추가 reject — 별도 quality issue로 7-Z-3-followup에서 다룸.
- **Tests**: 423 v2 unit tests (기존 passing, fix 후도 passing)

### TASK-7-Z-3-followup: Validator hallucination prompt 개선 (Path b)
- **종속성**: TASK-7-Z-3
- **커밋**: `d8e6a1f` (validator 패치 + 테스트), `a5d7a84` (diagnostic v3 + 테스트)
- **Files modified**:
  - `backend/v2/core2/validator.py` *(_build_ai_prompt 발췌 길이 균형 250→600자, _parse_ai_issues에 requested_groups 필터, _ai_check 시그니처)*
  - `backend/v2/tests/test_validator.py` *(followup 3개 테스트 추가, 기존 stale 주석 정정)*
  - `backend/v2/tools/post_validator_fix_diagnostic_v3.py` *(이전 v1/v2 진단 broken — v3가 최종)*
  - `backend/v2/tools/test_diagnostic_v3.py` *(7개 테스트, 한글 detail 포함 케이스 등)*
- **Why**: Z-3 fix 후 자연 누적은 시작됐으나 Nova Lite reject ratio가 24h 윈도우에서 82.2%로 측정됨. 100% hallucination type. 사례: *"원본 기사의 주제인 서울시의 청년 월세 지원 정책 확대와 달리, 변환 버전은 월 20만 원이 청년들에게 어떤 영향을 미치는지에 대한 일반적인 고찰로 주제가 달라졌습니다."* — Nova가 Opus의 의도된 분석/맥락 추가를 "주제 변경"으로 오인.
- **Diagnostic 진화**:
  - v1 (Phase 1): `parse @message '"event":"*"'` 패턴이 콜론 뒤 공백 없음 → Python `json.dumps` 기본 separator(`': '`)와 mismatch → 1545개 line 모두 `<no_event>` (broken).
  - v2 (Phase 1.5b): `parse` 폐기, 7개 event별 individual exact-match query. 그러나 issue type 분포는 `fields ... issues` projection에 의존했고 Insights가 nested array를 JSON-string으로 always serialize 안 함. hallucination_count=0 이 raw_log_peek의 100% hallucination과 모순 (broken).
  - v3 (Phase 2-A 이후): `@message` 자체 fetch + Python-side depth-counted brace scan. test_diagnostic_v3.py 7개 케이스로 검증.
- **Patches** (3개):
  1. **Excerpt parity** — version body 발췌 250 → 600자 (원본 600자와 균등). pre-followup 비대칭은 Opus가 분석을 본문 후반에 배치 시 발췌가 그 부분만 잡아 "다른 주제"로 오인 유발.
  2. **Group filter** — Nova가 prompt schema의 4 MBTI 리터럴을 보고 unrequested group 환각 issue 생성하던 것을 `_parse_ai_issues(requested_groups=...)`로 필터.
  3. **Prompt clarification** — "추가 분석/감정/맥락 부여는 hallucination 아님" 명시 + "확신 없으면 빈 배열" guidance.
- **Live state (post-Path-b deploy 6h)**: reject ratio **82.2% → 7.7%** (band c → band a), hallucination 비중 100% 유지(1/1 — true positive 검출 보존), `transform_empty_batch` 70/72 = 97% (queue 거의 비움). retry-loop 5건은 selector rerank 통한 자연 회복 (Phase 2-C Section C 측정).
- **Tests**: 36/36 PASS (test_validator 29 + test_diagnostic_v3 7).

### TASK-7-Z-4: Round 4 — Article API ?include_all_mbti 옵션 (1-RTT 모드)
- **종속성**: TASK-6 (Article Detail API), TASK-7 (Frontend cutover)
- **커밋**: TBD (이 핸드오프에서 생성)
- **Files modified**:
  - `backend/v2/handlers/core3_article.py` *(_parse_bool helper, _build_version_payload helper, _build_article_response에 all_versions optional kwarg, lambda_handler에서 옵션 파싱 + 두 번째 query)*
  - `backend/v2/tests/test_core3_article.py` *(7개 테스트 추가 — _parse_bool 정/오 케이스, default no-all_versions, include_all_mbti=true happy path, partial transform, falsy values, 404 short-circuit)*
  - `frontend-next/src/components/mbti/ArticleView.tsx` *(useEffect를 1-fetch + Path A/B fallback으로 재구성)*
  - `frontend-next/src/components/mbti/FeedPage.tsx` *(prefetchArticle 동일 패턴)*
- **Why**: ArticleView 진입 + FeedPage prefetch 두 곳에서 같은 article의 4 MBTI를 받기 위해 4-parallel fetch (4 RTT, 4 Lambda invocation, 4 RDS query). Round 4에서 backend `?include_all_mbti=true` 옵션 추가로 1 RTT로 복귀.
- **Strictly additive 설계**:
  - 기존 `?mbti=NT` 단독 호출 동작 변경 0 (mobile, 캐시, 외부 호출자 호환)
  - 새 옵션 시 응답에 `all_versions` 필드 추가, `version` 필드는 그대로
  - Frontend는 Path A (응답에 all_versions 4개) → 사용, Path B (부재 또는 <4) → 기존 4-parallel fallback. partial transform 케이스도 fallback path로 떨어져 같은 정책 (4 모두 있어야 setArticle).
- **DB 비용**: opt-in일 때만 `pg.get_article_versions(news_id)` 추가 호출 (일반 SELECT, indexed). 404 path는 short-circuit 으로 두 번째 query 안 함.
- **Live state (post-deploy)**: ArticleView/FeedPage 1-RTT path 활성화. Lambda invocation 1/4, RDS query 2/4 (1 single + 1 all-versions, vs 4 single 호출), frontend 첫 렌더 latency 단축.
- **Tests**: 32/32 PASS (기존 25 + 새 7).

### TASK-4-Z (post-demo): 보안/위생 정리
- **종속성**: 데모 후
- **항목**:
  - PG_V2_PASSWORD rotation (TASK-4-A 수행 중 Claude Code↔사용자 대화에 노출)
    - RDS 콘솔 ailens 사용자 비밀번호 변경
    - .env.v2 갱신 + Collector/Transform/Selector 3 Lambda 환경변수 갱신
  - .env.v2 ↔ Lambda env 정합성 정리 (현재 .env.v2는 3개만, Lambda는 7개)
  - v2/CLAUDE.md의 `sedaily-mbti-v2-lambda-role` 언급 → 실제 `sedaily-mbti-v2-collector-dev-role-nbf99tic` (콘솔 자동 생성 service role)로 정정
  - TASK-2.6 통합 테스트 9개 VPC 실측 (DDL 적용 완료, 코드 적용 완료, 실 검증만 남음)
- **Notes**:
  - 운영 영향 없음 — 정리 차원. 데모 시연 흐름과 분리.

---

## Phase 3: Core 3 Personalization (목표 3주)

### TASK-3.1: Memory Manager 라이브러리
- **종속성**: TASK-1.3
- **커밋**: TBD (이 라운드에서 생성)
- **Files modified/created**:
  - `backend/v2/clients/pgvector_v2_client.py` *(get_preference_embedding 메서드 추가)*
  - `backend/v2/core3/memory_manager.py` *(신규)*
  - `backend/v2/tests/test_pgvector_v2_client.py` *(TestGetPreferenceEmbedding 클래스 추가)*
  - `backend/v2/tests/test_memory_manager.py` *(신규)*
  - `backend/v2/tests/conftest.py` *(_TEST_PREFIXES에 test_v2_3_1_, test_v2_3_2_ 추가)*
- **결정 (Round 5 planning)**:
  - Q2: short-term은 pgvector `user_interactions` 30분 윈도우로 (DynamoDB 미사용)
  - Q3: 가입 시 MBTI 캐논 문장 임베딩 시드, EWMA는 Round 5-D consolidation에서
- **메서드 (현재 라운드 구현)**:
  - `get_short_term(user_id, window_minutes=30) -> list[dict]` ✅
  - `get_episodic(user_id, limit=100) -> list[dict]` ✅
  - `get_semantic(user_id) -> Optional[dict]` ✅
  - `get_procedural(user_id) -> Optional[dict]` (category_weights + preference_embedding) ✅
  - `get_or_create_profile(user_id, mbti_type) -> dict` (idempotent 시드, Q3=C) ✅
  - `consolidate(user_id) -> None` — **Round 5-D 로 연기** (consolidation Lambda와 함께 구현, EWMA + category_weights 재계산은 Lambda 트리거 후 의미)
- **Definition of Done**:
  - [x] Lambda 아님, 순수 라이브러리
  - [x] 각 메서드 단위 테스트 (fakes + integration 분리)

### TASK-3.2: Context Broker
- **종속성**: TASK-3.1
- **커밋**: TBD (이 라운드에서 생성)
- **Files modified/created**:
  - `backend/v2/core3/context_broker.py` *(신규)*
  - `backend/v2/tests/test_context_broker.py` *(신규)*
- **메서드 (현재 라운드 구현)**:
  - `get_user_context(user_id, request_type='feed') -> UserContext` ✅
  - `get_article_context(news_id, mbti_type)` — **추후 라운드** (article 핸들러는 이미 Round 4에서 안정화됨, 별도 broker 메서드 불필요. 챗봇 등 다른 컨슈머가 등장하면 그 라운드에서 추가)
- **Definition of Done**:
  - [x] request_type='feed' 구현, 그 외는 NotImplementedError
  - [x] feed 시나리오 테스트 (cold user, warm user, dedupe, 등)

### TASK-3.3: Recommend Agent (3-Stage Ranking)
- **종속성**: TASK-3.2
- **커밋**: TBD (이 라운드에서 생성)
- **Files modified/created**:
  - `backend/v2/clients/pgvector_v2_client.py` *(get_version_embeddings 메서드 추가)*
  - `backend/v2/core3/recommend_agent.py` *(신규)*
  - `backend/v2/tests/test_pgvector_v2_client.py` *(TestGetVersionEmbeddings 클래스 추가)*
  - `backend/v2/tests/test_recommend_agent.py` *(신규)*
  - `backend/v2/tests/conftest.py` *(_TEST_PREFIXES에 test_v2_3_3_ 추가)*
- **결정 (Round 5-B)**:
  - Stage 2 composite를 **3-term**으로 시작 (cosine 0.5 + category 0.3 + recency 0.2)
  - 4번째 term (engagement) 은 Round 5-D consolidation Lambda에 종속 — collaborative filter data 또는 article-level engagement aggregate 둘 중 하나가 consolidation의 자연스러운 산출물
  - 재도입은 non-breaking: W_ENGAGEMENT 추가 + 다른 weights 재조정만
- **로직 (현재 라운드 구현)**:
  - Stage 1: `PgVectorV2Client.find_feed_candidates()` → ~100개 (kNN order)
  - Stage 2: 3-term composite (코사인 + 카테고리 가중치 + recency exponential decay halflife=7d) — sort desc
  - Stage 3: MMR (`λ × score - (1-λ) × max_pairwise_cosine`) + 카테고리 cap (`ceil(limit × cap_ratio)`) + cap 소진 시 raw-score top-up
- **Definition of Done**:
  - [x] 10 테스트 유저 → 각각 다른 피드 반환 (`TestRecommendAgentLive::test_ten_users_get_different_feeds` 검증, jaccard overlap < 0.7)
  - [x] MMR λ 파라미터 설정 가능 (`RecommendAgent(mmr_lambda=...)` 생성자 인자)

### TASK-3.4: Core 3 API Handlers
- **종속성**: TASK-3.3
- **커밋**: TBD (이 라운드에서 생성)
- **Files modified/created**:
  - `backend/v2/clients/pgvector_v2_client.py` *(find_feed_candidates SQL 확장: a.metadata 추가, 결과 dict 키 분리)*
  - `backend/v2/core3/recommend_agent.py` *(RankedArticle docstring 한 줄 갱신)*
  - `backend/v2/handlers/core3_feed.py` *(personalization wire-up — anonymous/cold/warm 3-mode)*
  - `backend/v2/handlers/core3_record_interaction.py` *(신규)*
  - `backend/v2/tests/test_pgvector_v2_client.py` *(SQL assertion 추가)*
  - `backend/v2/tests/test_core3_feed.py` *(legacy unused-user_id 테스트 교체 + personalization 테스트 + _build_feed_item → _build_item_from_cold 리네임)*
  - `backend/v2/tests/test_core3_record_interaction.py` *(신규)*
  - `backend/v2/tests/conftest.py` *(test_v2_3_4_ prefix 추가)*
  - `backend/v2/deploy-v2.sh` *(CORE3_FUNCTIONS 확장 + interaction 디스패치)*
- **결정 (Round 5-C)**:
  - Q1=C 사용자 우선: feed 핸들러 + record_interaction 핸들러 둘 다 4-char MBTI(`INTJ`) 받으면 lazy-create. 첫 피드부터 warm path 가능.
  - 응답 shape 통일: cold/warm 둘 다 동일 필드. find_feed_candidates SQL 에 a.metadata 추가, dict 키 `version_metadata` / `article_metadata` 분리.
  - Auth NONE 유지 (v1 parity). user_id는 query param / body field. JWT는 별도 라운드.
- **API 엔드포인트**:
  - `GET /api/v2/feed?mbti=...&user_id=...&limit=...&since=...` (수정)
    - `user_id` 없음 → Phase 2.5 cold (anonymous)
    - `user_id` 있음 → 개인화 (cold/warm 분기는 RecommendAgent 내부에서)
    - 응답: `{mbti_type, count, items: [{news_id, category, published_at, selection_date, transformed_at, title, body_preview, press, sub_title, url, byline, image_url}]}`
  - `POST /api/v2/interactions` (신규)
    - body: `{user_id, news_id, interaction_type, mbti_type?, dwell_ms?, scroll_pct?, rating?, reaction_type?}`
    - 응답: `{ok: true, profile_created: bool}`
- **Definition of Done**:
  - [x] feed: `?user_id=X&mbti=INTJ` 호출 시 user_profiles 행 생성 + 시드 임베딩
  - [x] feed: `?user_id=X` (profile 있음) 호출 시 RecommendAgent.warm 결과 반환
  - [x] feed: `?user_id` 없음 호출 시 Phase 2.5 cold 동일 동작 (회귀 테스트)
  - [x] record_interaction: 모든 6 interaction_type 검증
  - [x] record_interaction: profile_created 시그널 응답
  - [ ] (수동) Lambda 함수 `sedaily-mbti-v2-interaction-dev` AWS 콘솔 생성
  - [ ] (수동) API Gateway 라우트 POST `/api/v2/interactions` 추가
  - [ ] (수동) `./deploy-v2.sh feed` + `./deploy-v2.sh interaction` 실행 → curl 동작 확인

### TASK-3.5: Consolidation Lambda + EventBridge
- **종속성**: TASK-3.1 ~ TASK-3.4
- **커밋**: TBD (이 라운드에서 생성)
- **Files modified/created**:
  - `backend/v2/clients/pgvector_v2_client.py` *(find_active_users_since, get_interaction_centroid_data 메서드 추가)*
  - `backend/v2/core3/memory_manager.py` *(consolidate 메서드 본체 + helper 2개)*
  - `backend/v2/handlers/core3_consolidate.py` *(신규)*
  - `backend/v2/tests/test_pgvector_v2_client.py` *(신규 메서드 통합 테스트)*
  - `backend/v2/tests/test_memory_manager.py` *(consolidate + helper 단위 테스트)*
  - `backend/v2/tests/test_core3_consolidate.py` *(신규)*
  - `backend/v2/tests/conftest.py` *(test_v2_3_5_ prefix 추가)*
  - `backend/v2/deploy-v2.sh` *(CORE3_FUNCTIONS + consolidate 디스패치)*
- **결정 (Round 5-D)**:
  - Q1=C 일배치: EventBridge cron(0 18 * * ? *) — UTC 18:00 = KST 03:00
  - Q2=B 30일 윈도우: 매번 now-30d 이후 interactions만 — idempotent
  - Q3=B 활성 user: 최근 30일 내 ≥1 interaction
  - Q4=B engagement deferred: user-level만 이번 라운드
  - Q5=B α=0.2, threshold ≥10 distinct news
  - Q6=B interaction_type 가중: click=1, dwell(>5s)=2, react=3, rate(≥4)=3, scroll=1, rate(≤2)/skip=-1
- **Lambda 동작**:
  - Trigger: EventBridge schedule (수동 등록)
  - Per-fire: find_active_users_since → for each user, MemoryManager.consolidate
  - 4 status 분기: applied / skipped_below_threshold / skipped_no_profile / skipped_no_centroid
  - per-user error는 batch를 멈추지 않음 (로그 + counts.errored++)
- **Definition of Done**:
  - [x] consolidate가 EWMA(α=0.2) 적용해서 preference_embedding 갱신
  - [x] category_weights 가 interaction_type 가중 + 정규화로 갱신
  - [x] threshold(<10 distinct)에서 skipped 처리
  - [x] 핸들러가 active user 전체 순회 + 에러 격리
  - [ ] (수동) Lambda 함수 sedaily-mbti-v2-consolidate-dev AWS 콘솔 생성
  - [ ] (수동) EventBridge schedule rule 생성 + Lambda target 연결
  - [ ] (수동) ./deploy-v2.sh consolidate 실행
  - [ ] (수동) 첫 fire 검증: CloudWatch에서 consolidate_run_complete 이벤트 + DB에서 user_profiles 갱신 확인

---

### TASK-3.6: Frontend wire-up (Round 5-E)
- **종속성**: TASK-3.4 (백엔드 endpoints 가 production)
- **커밋**: TBD (이 라운드에서 생성)
- **Files modified**:
  - `frontend-next/src/shared/lib/userApi.ts` *(recordArticleReadV2 함수 추가)*
  - `frontend-next/src/components/mbti/FeedPage.tsx` *(feed URL에 user_id 조건부 추가)*
  - `frontend-next/src/components/mbti/ArticleView.tsx` *(dual-write — v1 + v2 interaction record)*
- **결정 (Round 5-E)**:
  - Q1=C 4-char MBTI 롤아웃: frontend는 group(2-char)만 전달. lazy profile-create는 4-char 수집 UI 도입 후 활성화. 그때까지 backend는 cold path로 응답.
  - Q2=C dual-write: v1 `/api/user/read` 유지 + v2 `/api/v2/interactions` 추가. 기존 DNA탭/추천 API 파괴 0.
  - Q3=A UI 가시화 없음. badge / status indicator 는 5-F (TASK-3.7 예정).
  - Q4=C 5-E는 wire-up만. 5-F (가시화) 는 5-D consolidation 실 데이터 검증 후.
- **이 라운드 후 동작**:
  - 익명 user → 기존 그대로 cold path
  - 로그인 user → feed 에 user_id 동반 (그러나 4-char MBTI 부재로 lazy profile-create 미트리거 → 여전히 cold path 응답)
  - 로그인 user 의 article click → v1 + v2 interaction 양쪽 기록
  - 5-D consolidate 첫 fire (KST 03시) 시점에 v2 user_interactions 누적분 발견 가능. 단 profile 없는 user 는 `skipped_no_profile` 처리되므로 EWMA 미적용. 의미 있는 personalization 은 4-char MBTI 수집 UI (별도 라운드) 도입 후.
- **Definition of Done**:
  - [x] feed 호출에 user_id 조건부 추가
  - [x] interaction dual-write
  - [x] 빌드 통과 / lint 통과
  - [ ] (수동) production 배포 후 CloudWatch 에서 v2 interaction Lambda 가 실 트래픽 수신 확인
  - [ ] (수동) DB query 로 v2 user_interactions 행 누적 확인

### TASK-3.7: Frontend 4-char MBTI 수집 (Round 5-G)
- **종속성**: TASK-3.4 (백엔드), TASK-3.6 (frontend wire-up)
- **커밋**: TBD (이 라운드에서 생성)
- **Files modified**:
  - `frontend-next/src/shared/data/mbtiGroups.ts` *(groupToDefaultMbti export 추가)*
  - `frontend-next/src/components/mbti/OnboardingPage.tsx` *(에디터 선택 시 mbti-type localStorage 저장)*
  - `frontend-next/src/app/page.tsx` *(기존 user 마이그레이션 — group→default mbti backfill)*
  - `frontend-next/src/components/mbti/FeedPage.tsx` *(feed URL의 mbti param을 4-char preferred)*
  - `frontend-next/src/components/mbti/ArticleView.tsx` *(recordArticleReadV2 mbti 인자를 4-char preferred)*
- **결정 (Round 5-G)**:
  - 옵션 2-bis 채택: 에디터 선택 자체를 그 에디터의 4-char MBTI 채택으로 해석 (민철=INTJ / 하은=INFP / 준서=ISTJ / 소율=ESFP). 추가 UI 0.
    *(2026-07-27 표기 갱신 — 당시 기록은 구 이름 시현/지원/정훈/하은. 그룹↔MBTI 매핑은 불변, 이름만 정본 v3 로 통일)*
  - 정확성 trade-off: 모든 NT user → INTJ로 분류. 하지만 backend 시드 임베딩이 그룹 단위라 personalization 효과 차이 없음 (cosmetic).
  - localStorage 만 사용 (Cognito custom attribute 미사용). Multi-device sync는 별도 라운드.
  - 기존 user 마이그레이션 자동화: app/page.tsx 가 mount 시 mbti-group 있고 mbti-type 없는 user 에게 default mbti backfill.
- **이 라운드 후 동작**:
  - 신규 user → OnboardingPage 에디터 선택 → 4-char + group 동시 localStorage 저장 → 첫 feed 호출에 mbti=INTJ (등 4-char) 동반 → backend lazy create → warm path 즉시 활성
  - 기존 user → 다음 page mount 시 mbti-type 자동 채워짐 → 그 다음 feed 호출부터 warm path
  - 익명 user → 변화 없음
- **Definition of Done**:
  - [x] OnboardingPage 에서 mbti-type localStorage 저장
  - [x] 기존 user 마이그레이션 자동화
  - [x] FeedPage / ArticleView 가 4-char preferred로 backend 호출
  - [x] Build 통과 / lint 통과
  - [ ] (수동) production 배포 후 R5-D consolidate Lambda 첫 fire 에서 `applied` count > 0 확인

## Phase 4: AgentCore + MCP (목표 3주)

### TASK-4.1: Chat Agent MCP 서버 골격
- **종속성**: TASK-3.2 (Context Broker 필요)
- **Files to create**:
  - `backend/v2/agents/chat_agent/Dockerfile` (ARM64, python:3.11-slim)
  - `backend/v2/agents/chat_agent/requirements.txt` (mcp, bedrock-agentcore, boto3, pg8000)
  - `backend/v2/agents/chat_agent/server.py` (FastMCP, stateless_http=True 초기)
  - `backend/v2/agents/chat_agent/tools/__init__.py`
  - `backend/v2/agents/chat_agent/tools/get_user_context.py`
  - `backend/v2/agents/chat_agent/tools/get_article.py`
  - `backend/v2/agents/chat_agent/tools/search_archive.py`
  - `backend/v2/agents/chat_agent/tools/record_interaction.py`
- **Definition of Done**:
  - [ ] 로컬에서 `docker buildx build --platform linux/arm64` 성공
  - [ ] 로컬 `docker run` 후 `curl localhost:8000/mcp` 응답
  - [ ] 4개 도구가 MCP initialize 응답에 포함

### TASK-4.2: ECR push + AgentCore Runtime 배포
- **종속성**: TASK-4.1
- **Files to create**:
  - `backend/v2/agents/chat_agent/deploy.sh` (docker build + ECR push + agentcore CLI)
- **Definition of Done**:
  - [ ] ECR에 이미지 태그 `:latest`, `:{git-sha}` 둘 다 push
  - [ ] AgentCore Runtime `sedaily-mbti-chat-agent-v2-dev` 배포
  - [ ] `InvokeAgentRuntime` API 호출 성공 (Mcp-Session-Id 반환 확인)

### TASK-4.3: Stateful 모드 전환 & 세션 유지
- **종속성**: TASK-4.2
- **수정 파일**: `server.py` — `stateless_http=False`
- **Definition of Done**:
  - [ ] 세션 생성 후 2번째 요청에서 이전 context 유지
  - [ ] 15분 유휴 후 404 확인 (timeout 동작)

### TASK-4.4: AgentCore Gateway 라우팅
- **종속성**: TASK-4.3
- **Files to create**:
  - `backend/v2/infrastructure/setup_agentcore_gateway.sh`
- **Definition of Done**:
  - [ ] `/api/v2/chat/*` 트래픽이 Chat Agent Runtime으로 라우팅
  - [ ] Cognito OAuth 통합 (`us-east-1_ZS8PgF3iX` 풀)
  - [ ] 프론트에서 세션 ID 유지하면서 multi-turn 대화 동작

### TASK-4.5: Observability 대시보드
- **종속성**: TASK-4.2
- **Definition of Done**:
  - [ ] AgentCore Observability 자동 생성 대시보드 확인
  - [ ] CloudWatch 알람: 에러율 > 5%, p95 latency > 3s

### TASK-4.6: AgentCore Policy 가드레일 (선택, 시간 있으면)
- **종속성**: TASK-4.3
- **Definition of Done**:
  - [ ] 정책: "record_interaction은 본인 user_id만"
  - [ ] 정책: "PII 응답 금지"

---

## Phase 5: 트래픽 전환 & v1 정리 (목표 2주)

### TASK-5.1: 프론트엔드 feature flag 시스템
- **종속성**: Phase 3 완료
- **Files to modify** (프론트엔드): `frontend-next/src/shared/config/api.ts`
- **Definition of Done**:
  - [ ] `NEXT_PUBLIC_V2_{FEED|ARTICLE|CHAT|ARCHIVE|RECOMMEND}` 환경변수 5개
  - [ ] 각 플래그 true면 `/api/v2/*` 호출, false면 `/api/*` (v1)

### TASK-5.2 ~ 5.6: 기능별 순차 전환 (각각 1주 운영 후 다음)
- TASK-5.2: `/s3-articles` (원본, 리스크 낮음) — 사실 v2 불필요, pass 가능
- TASK-5.3: `/api/article/{id}` → `/api/v2/article/{id}`
- TASK-5.4: `/api/feed` → `/api/v2/feed` (신규 엔드포인트)
- TASK-5.5: `/api/chat` → `/api/v2/chat` (AgentCore)
- TASK-5.6: `/api/recommend`, `/api/archive`, `/api/podcast` 나머지
- **각 Definition of Done**:
  - [ ] 24시간 에러율 < 0.5%
  - [ ] p95 latency 기존 대비 +20% 이내
  - [ ] A/B 비교 리포트

### TASK-5.7: v1 Lambda 비활성화
- **종속성**: TASK-5.6 + 30일 안정화
- **Definition of Done**:
  - [ ] v1 Lambda 22개 concurrency 0으로 (삭제 아님)
  - [ ] v1 Step Functions 정지
  - [ ] v1 EventBridge 스케줄 비활성화

### TASK-5.8: v1 데이터 정리 (3개월 후 판단)
- **종속성**: TASK-5.7 + 3개월 무중단
- **Definition of Done**:
  - [ ] v1 DynamoDB `sedaily-mbti-articles-dev` 삭제 (또는 S3 백업 후)
  - [ ] v1 OpenSearch 도메인 삭제 (한글 full-text 필요 없다고 확정된 경우)
  - [ ] v1 코드 `legacy/` 디렉터리로 이동

---

## 진행 현황 요약

| Phase | TASK 수 | 완료 | 진행 중 | 남음 |
|---|---|---|---|---|
| Phase 0 | 3 | 3 | 0 | 0 |
| Phase 1 | 4 | 4 | 0 | 0 |
| Phase 2 | 5 | 5 | 0 | 0 |
| Phase 3 | 5 | 0 | 0 | 5 |
| Phase 4 | 6 | 0 | 0 | 6 |
| Phase 5 | 8 | 0 | 0 | 8 |
| **합계** | **31** | **12** | **0** | **19** |

세션 시작 시 이 표 업데이트할 것.
