# service/backend/

service/backend/ 전체의 디렉토리 / 모듈 구조 reference. 본 파일은 service/backend/ 안에서
작업 시 자동 load.

service/frontend/CLAUDE.md / admin/frontend/CLAUDE.md 패턴 일관.

---

## 2026-08-06: pgvector 전면 제거 — v1·v2 RDS 둘 다 계정에 없음

"pgvector 어디 쓰냐"는 질문에서 시작. 확인해보니 `aws rds describe-db-instances`
결과 살아있는 postgres 인스턴스가 `ensedaily-db`(영문사이트, AI LENS와 무관)
하나뿐 — **v1(`sedaily-mbti-pgvector-dev`)도 v2(`sedaily-mbti-pgvector-v2-dev`,
2026-08-04 삭제는 이미 알고 있었음)도 계정에 없다.** v1은 대신 라이브 Lambda에
`PG_PASSWORD`가 아예 안 잡혀있어 조용히 비활성 상태였다(에러 없이
`vector_status='skipped'`). 두 기능 다 "복구 안 함, 필요해지면 재설계"로
결정하고 전면 삭제.

**삭제한 파일**: `clients/pgvector_client.py`(v1), `clients/pgvector_v2_client.py`(v2),
`clients/s3_article_v2_client.py`(front-page 전용, 다른 호출자 없음 확인),
`handlers/front_page.py`(지면 1면), `admin/backend/shared/pg_client.py`(2026-08-04
DynamoDB 이관 이후 importer 0명 — 이미 고아였음), 대응 테스트 4개
(`test_pgvector.py`, `test_pgvector_v2_client.py`, `test_front_page.py`,
`test_s3_article_v2_client.py`).

**정리한 코드**:
- `handlers/archive_handler.py`("내 서랍") — pgvector 유사문장 검색
  (`POST /api/archive/similar`, 30일 실호출 0건) 제거, 저장 경로는 DynamoDB만
  남기고 단순화. `/similar` 경로는 410로 명시 응답(저장 핸들러로 잘못 안 새게).
- `config/settings.py` — `pg_host`/`pg_port`/`pg_database`/`pg_user`/`pg_password`
  (v1 전용) 필드 제거.
- `tests/conftest.py` — v2 pgvector 세션 정리 fixture(`_cleanup_test_prefixes`)
  + `_TEST_PREFIXES` 제거. 참조하던 테스트 파일들(`test_core1_collector.py` 등)은
  이미 예전 라운드에서 다 삭제돼 있었다.
- `tests/test_cms_posts_public.py` — **부수 발견**: 이 테스트가 2026-08-04
  DynamoDB 이관 이전 버전을 기대하며 `PgVectorV2Client`를 monkeypatch하고
  있었다(실제로는 `posts_client` = `cms_posts_ddb_client`를 씀) — 9개 테스트가
  전부 `AttributeError`로 조용히 깨져 있었고, 지난 여러 라운드 커밋에서 "9개
  실패는 무관한 사전 존재 실패"로 계속 넘겨온 바로 그것이었다. `posts_client`를
  monkeypatch하도록 다시 써서 8/8 통과(연결-close 개념 자체가 없는 DynamoDB라
  관련 테스트 1개는 제거).
- `deploy.sh` — `API_V2_FUNCTIONS`에서 `sedaily-mbti-v2-front-page-dev` 제거.
- **AWS 리소스 실삭제 완료**(같은 날 후속 확인): API Gateway 라우트
  `GET /api/v2/front-page`(`chzwwtjtgk`) + 그 통합, Lambda 함수
  `sedaily-mbti-v2-front-page-dev` 전부 삭제. 라이브 확인 — 그 API 호출 시
  이제 500 대신 404.

**검증**: 전체 `.py` 문법 체크·import 통과, `pytest tests/ -m "not integration"`
106 passed(에러 6건은 전부 무관 — 폐기된 v1 Step Functions 파이프라인용
`test_pipeline.py`와 `news_id` CLI 픽스처를 기대하는 수동 스크립트
`test_regression.py`, pytest 컨벤션이 아닌 독립 실행 스크립트라 pgvector
제거와 무관).

**다음에 볼 것 (이번엔 안 건드림)**: `clients/embedding_client.py` — archive
유사문장 검색이 유일한 프로덕션 호출자였는데 그게 없어져서 지금 프로덕션
호출자가 0명이다. 다만 `test_performance.py`/`test_full_integration.py`가
더 넓은 통합 흐름 안에서 부르고 있어 그 테스트들 성격부터 확인 필요 — 이번
라운드 범위 밖으로 남김.

---

## 2026-08-06: 콜드스타트 정리 — VPC 낭비 제거 + 안 쓰는 의존성 제거

속도 감사 중 발견. 둘 다 코드 변경 없이 설정/빌드만 고침.

- **VPC 분리**: `sedaily-mbti-v2-today-letters-dev`, `sedaily-mbti-v2-posts-dev`,
  `sedaily-mbti-v2-front-page-dev` 3개가 `vpc-07a3a75110d6594aa`에 붙어있었다.
  grep으로 재확인한 결과 앞의 두 개는 코드에 `PG_V2_HOST`/`psycopg`/`pg8000`
  참조가 전혀 없다 — RDS를 아예 안 쓰면서 ENI 어태치 콜드스타트 비용만 지던
  순수 낭비였다. `front-page-dev`는 `pgvector_v2_client`를 실제로 쓰지만 그
  RDS 자체가 2026-08-04에 삭제돼 이미 500 에러 상태라 VPC가 있으나 없으나
  기능은 안 됨 — 셋 다 `update-function-configuration --vpc-config
  '{"SubnetIds":[],"SecurityGroupIds":[]}'`로 분리했다. `today-letters`/`posts`
  라이브 200 재확인 완료.
- **deploy.sh 의존성 트림**: `opensearch-py`, `requests-aws4auth`, `redis`
  전부 grep으로 실제 import 0건 확인(OpenSearch는 2026-08-05 도메인 자체가
  삭제됨). pip install 목록에서 제거 — 22개 함수 전부가 매 콜드스타트마다
  안 쓰는 패키지를 로드하고 있었다. `pg8000`은 `pgvector_client.py`/
  `pgvector_v2_client.py`/`admin/backend/shared/pg_client.py`가 실사용 중이라 유지.

### 후속 조치 (같은 날 마저 처리)
- **메모리 256→512MB**: `today-letters-dev`/`posts-dev`/`subscribe-dev` 3개
  전부 올림(`health-dev`는 원래 512였음). `deploy.sh`엔 여전히 메모리 설정
  로직이 없다 — 콘솔/CLI로 수동 조정한 값이라 다음에 함수를 새로 만들 때는
  똑같이 잊히기 쉬움, 언젠가 provision 스크립트에 흡수할 것.
- **`subscribe.py` 커넥션 재사용**: `_table()`이 매 요청마다 `import boto3` +
  `boto3.resource("dynamodb")`를 새로 만들던 것을 모듈 레벨 싱글턴으로 고침.
  이 배포에 맞춰 Handler 접두사도 같이 정리(위 🔴 항목 참조).
- `front_page.py`의 매 요청 클라이언트 생성 이슈는 파일 자체가 삭제되며 해소.
- API Gateway 캐싱은 여전히 미지원(HTTP API 타입 한계, 변경 안 함).

---

## 2026-08-05: v1/v2 폴더 구분 제거 + 자동생성 파이프라인 폐기

한때 `service/backend/v2/`가 "차세대 재설계" 병렬 스택으로 따로 존재했다. 핵심이던
Selector→Transform→개인화 파이프라인이 2026-08-04 비용 문제로 폐기되며 그 구분이
무의미해졌고, 남은 라이브 코드를 이 문서가 설명하는 v1 구조로 옮겨 폴더 구분을
완전히 없앴다. **이제 `v2/` 폴더는 존재하지 않는다 — 아래 레이어 설명이 곧 전체다.**

배포된 Lambda 함수 이름 중 일부는 여전히 `sedaily-mbti-v2-*-dev` 접두사를 쓴다(예:
`sedaily-mbti-v2-today-letters-dev`) — AWS에 이미 그 이름으로 배포돼 있어 바꾸지
않았을 뿐, 소스 위치나 아키텍처상의 의미는 없는 레거시 이름표다. `deploy.sh`
하나가 이 이름들과 원래 v1 이름 함수들을 전부 같은 zip으로 배포하는 게 **의도**다.

**🔴 Handler 접두사 함정 — v2 계열 원래 5개 중 1개만 남음.** 이 함수들의
`Handler` 설정이 원래 `v2.handlers.X.lambda_handler`(구 `v2/` 하위 폴더 구조
전제)였는데, 2026-08-05 폴더 통합 이후 `deploy.sh`가 만드는 zip은 평평한 구조
(`handlers/`가 루트)라 `v2/` 폴더가 없다 — Handler를 안 고치고 이 zip으로
재배포하면 "모듈을 못 찾음" 에러로 깨진다. 고칠 때 절차: (1) `aws lambda
get-function`으로 현재 코드 zip 백업, (2) `update-function-configuration
--handler`로 접두사 제거, (3) `update-function-code`, (4) 즉시 라이브 호출로
확인 — 실패하면 백업 zip으로 코드 복구 + Handler 원복.
- `sedaily-mbti-v2-posts-dev`: 2026-08-06 고침(cover_image_url 필드 추가 작업 중)
- `sedaily-mbti-v2-today-letters-dev`: 2026-08-06 고침(외부 콘텐츠 API 작업 중)
- `sedaily-mbti-v2-subscribe-dev`: 2026-08-06 고침(subscribe.py 커넥션 재사용
  수정 배포하면서 같이) — 메모리도 이참에 256→512MB
- `sedaily-mbti-v2-front-page-dev`: **함수 자체가 삭제됨**(pgvector RDS 제거
  라운드) — 더 이상 해당 없음
- `sedaily-mbti-v2-health-dev`: **아직 안 고침**, 남은 마지막 하나. 지금은
  이 zip으로 재배포된 적이 없어 멀쩡히 동작 중이지만, 다음에 `./deploy.sh`가
  이 함수 코드 업데이트에 실제로 성공하면 그 순간 깨진다.

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
                     ⚠️ archive.py 의 삭제 경로("내 서랍")가 예전엔 삭제할 때마다 Bedrock
                     임베딩 호출 + pgvector 유사도 검색을 해놓고 로그 한 줄만 남기고
                     실제로는 아무것도 안 지우는 순수 낭비 코드였다 — 2026-08-05 제거
                     (archive_vectors row는 여전히 정리 안 됨, row UUID를 저장 안 해서
                     특정이 안 됨 — 실제로 지우려면 스키마 변경 필요, 별도 작업).
newsletter/         → render.py/sender.py/subscribers.py — 뉴스레터 구독/발송.
                     handlers/subscribe.py가 사용. handlers/newsletter.py 자체의
                     배포된 Lambda는 2026-07-30 폐기됐지만(미결선·실호출 0),
                     패키지는 subscribe.py의 라이브 의존성이라 유지. `_load_today_letters()`는
                     `clients/daily_letters_ddb_client.py`(today_letters.py와 동일 소스)를
                     1순위로 쓰고, 실패 시 로컬 미러(`newsletter/local_letters.py`)→
                     하드코딩 mock 순으로 폴백한다. `handlers/today_letters.py`의
                     `shape_letter_response()`(row→API shape 변환)도 재사용하는데,
                     원래 밑줄 붙은 private 함수(`_shape_letter_response`)를 다른 모듈이
                     import해 쓰던 캡슐화 위반이었다 — 2026-08-05 public으로 승격.
clients/            → Service clients: dynamodb, personal_db, s3_article, s3_xml,
                     embedding (Titan).
                     daily_letters_ddb_client / cms_posts_ddb_client 는 옛 v2 소스
                     통합분 — today_letters·newsletter·cms_posts_public이 사용.
                     ⚠️ `translate_client.py`(AWS Translate 래퍼)는 2026-08-05 삭제됨 —
                     2026-07-30 폐기된 translation 핸들러의 유일한 클라이언트, 호출자·
                     테스트 둘 다 0 (`common/errors.py`의 `TranslationError`가 한 번도
                     raise 안 되는 것과 같은 얘기).
                     ⚠️ `cloudwatch_metrics.py`도 2026-08-05 삭제됨 — **이전 버전 이
                     문서가 "today_letters 관측용, 살아있음"이라고 잘못 적어놨었다,
                     재검증 결과 오류**. 실제로는 어떤 handler/service도 emit 함수를
                     호출하지 않는다 — 자체 docstring이 밝히는 유일한 호출자
                     `core1_collector.py`(Phase 4-A CollectorPaperPass)가 이미 삭제됨.
                     삭제 시 `tests/conftest.py`의 `_block_real_cloudwatch` autouse
                     fixture(모든 테스트마다 자동 실행되며 이 모듈을 import)도 같이
                     제거해야 전체 테스트 스위트가 안 깨진다 — 실제로 그렇게 했다.
                     ⚠️ `pgvector_v2_client.py` — 원래 1986줄·34메서드 God Object였다
                     (기사 수집, MBTI 버전, 유저 프로필/인터랙션, 자동생성 파이프라인
                     전체가 여기 있었음). 파이프라인 폐기로 대부분 삭제하고
                     `handlers/front_page.py`가 쓰는 2개 메서드(`get_front_page_articles`,
                     `get_latest_front_page_date`) + connection 스캐폴딩만 남겼다.
                     **다만 front-page도 같은 RDS에 의존해 지금 500 에러 상태다** —
                     이 클라이언트를 고친 게 아니라 죽은 메서드만 걷어낸 것. front-page
                     복구 여부는 별도 결정 사항.
                     s3_article_v2_client 도 front_page.py 가 사용 (S3 본문 조회) —
                     ⚠️ `put_article_file`/`delete_article_file`/`build_uri`(쓰기용,
                     Core 1 Collector·Core 2 Transform 전용이었음)는 둘 다 이미 삭제된
                     파이프라인이라 2026-08-05 삭제, `get_article_file`(front_page의
                     유일한 읽기 경로)만 남음.
                     ⚠️ `s3_article_client.py`(v1)의 `strip_body_fields`도 같은 날 삭제
                     (호출자·테스트 0). `delete_body`는 프로덕션 호출자가 없는데도
                     **의도적으로 유지** — `tests/test_split_storage.py::test_s3_client_direct`가
                     mock 없이 실 S3에 대고 put→get→delete까지 검증하는 진짜 통합 테스트로
                     계속 통과 중이라, 특정 폐기 기능에 묶인 게 아니라 아직 UI가 없는
                     범용 삭제 기능일 가능성 — `common/errors.py`의 미사용 예외 클래스와
                     같은 논리로 보존.
                     ⚠️ `clients/mbti_transform_service.py`(Bedrock Claude 래퍼, MBTI
                     4-페르소나 변환 전용)는 그 페르소나 파이프라인 자체가 폐지되며
                     삭제됐다(2026-08, `article_collector.py`도 더 이상 참조 안 함).
                     Polly has no client file; podcast_handler calls boto3 polly directly
                     (tts_handler 는 폐기).
                     ⚠️ opensearch_client.py 는 2026-08-05 삭제됐다 — 어떤 handler 도
                     import하지 않던 죽은 코드였다(원래 도메인 sedaily-mbti-search-dev도
                     2026-08-04 삭제). search_handler.py 는 처음부터 DynamoDB GSI 쿼리로
                     검색·RAG-유사 기능을 구현했다.
                     ⚠️ `dynamodb_client.py` — 989줄 중 12개 메서드(43%)가 완전 고아였다
                     (article versioning, failed-article DLQ, naver TV URL, slug 체크 등 —
                     전부 호출자 0). 2026-08-05 삭제, 이어서 `get_article_by_slug`도
                     삭제(유일한 호출자였던 `article_handler.py`의 도달 불가 slug 라우트도
                     같이 삭제) — 최종 509줄로 축소. `s3_xml_client.py`도 같은 날 죽은
                     메서드 2개(`get_today_articles`, `article_to_dict`) 삭제 — 이쪽은
                     대부분 살아있는 XML 파싱 파이프라인이라 SOLID 위반은 아니었음.
                     ⚠️ `pgvector_client.py`(v1 — `pgvector_v2_client.py`와는 완전히 다른
                     시스템, `PG_HOST`/db `ailens` vs `PG_V2_HOST`/db `ailens_v2`, 이름이
                     비슷해 혼동 주의) — 445줄 중 기사 벡터 검색 관련 6메서드+alias 3개가
                     호출자 0이었다(`init_tables`, `insert_article_vector`,
                     `delete_article_vectors`, `search_similar_articles`,
                     `delete_archive_vector`, `store_embedding`, `search_similar`,
                     `store_sentence_embedding`). `handlers/archive_handler.py`("내 서랍"
                     유사 문장 검색)가 쓰는 `insert_archive_vector`/`search_similar_sentences`
                     2개만 남기고 2026-08-05 축소, 209줄.
                     ⚠️ `personal_db_client.py` — "Domain methods" 섹션(`put_archived_sentence`,
                     `get_archived_sentences`, `delete_archived_sentence`,
                     `put_reading_record`, `get_reading_records`, `put_user_profile`,
                     `get_user_profile`, ~57줄)이 전부 고아였다 — `PersonalRepository`가
                     이 래퍼들을 호출하는 대신 `get_item`/`put_item`/`delete_item`/
                     `query_by_user`/`update_item` 5개 primitive를 직접 호출해 같은 로직을
                     중복 구현하고 있었음. 2026-08-05 삭제, 241줄로 축소.
                     `embedding_client.py`(v1 Titan) — `embed_text`/`_call_bedrock`만
                     살아있고(`handlers/archive_handler.py`가 사용), `embed_batch`/
                     `get_embedding`/`get_embeddings_batch`는 호출자 0이라 같은 날 삭제.
repositories/       → PersonalRepository만 남음(personal_db_client.py 기반, "내 서랍"·유저
                     프로필·독서기록에서 사용). ⚠️ base.py(BaseDynamoDBRepository) +
                     그걸 상속하던 log_repository.py/settings_repository.py(~930줄)는
                     2026-08-05 전체 삭제 — repositories/__init__.py가 PersonalRepository만
                     재export했고, 대응하는 log_handler.py/settings_handler.py 자체가
                     없어서 어디서도 인스턴스화된 적이 없었다(배선 안 된 죽은 인프라).
                     get_archived_sentence(personal_repository.py)도 같은 날 삭제 —
                     archive_handler.py는 이 대신 list_archived_sentences 스캔으로
                     조회해서 호출자가 없었다.
services/           → Business logic: article_filter, prompt_loader,
                     metrics, briefing_generator (used by briefing_handler).
                     ⚠️ `prompt_service.py`(`PromptService`, "번역 프롬프트 CRUD"용)는
                     2026-08-05 삭제됨 — 어디서도 import 안 됐고(사용처 0), 유일한 잠재
                     호출자였던 `translation` 핸들러가 2026-07-30에 이미 폐기됐다. 실제
                     관리자 프롬프트 관리는 완전히 다른 모듈(`admin/backend/routes/prompts.py`,
                     다른 DDB 스키마)이 담당 — 이 서술은 낡은 정보였다.
                     stock_service (used by services/chatbot_engine.py for inline stock lookups).
                     2026-08-05: `handlers/chatbot_handler.py`(869줄, SOLID 위반 확인)를
                     3개로 분리 — `chatbot_context_service.py`(DynamoDB/S3 raw boto3 조회:
                     briefing, 최근기사, 연관기사 검색), `chatbot_prompt_service.py`(시스템
                     프롬프트·tool 정의 조립), `chatbot_engine.py`(Bedrock 호출, tool-use
                     루프, 스트리밍 — `handlers/websocket/message.py`가 여기서
                     `generate_chat_response_stream`을 직접 import해 쓴다). `chatbot_handler.py`는
                     이제 HTTP 라우팅/검증/응답 조립만 담당. 동기(`generate_chat_response`)와
                     스트리밍(`generate_chat_response_stream`)이 각자 중복 구현하던 tool-use
                     루프 중 진짜 동일했던 부분(Bedrock 요청 body 조립, tool_use 블록 실행+결과
                     조립)은 `_build_bedrock_request`/`_execute_tool_batch` 공유 헬퍼로 추출
                     (2026-08-05 후속, 순수 추출·응답 내용 변경 없음 — 직접 만든 요청/실행 output을
                     old-style 인라인 코드와 비교해 바이트 단위로 검증). 스트리밍 특유의 증분
                     yield 흐름은 성격이 달라 그대로 둠.
                     2026-08-24: `handlers/post_handler.py`(396줄, CORS 빌더+DynamoDB 직접
                     접근+비즈니스 로직이 한 파일에 섞여있던 것 — 코드 리팩토링 감사 Track B)를
                     같은 handler=라우팅/service=로직 패턴으로 분리 — `community_post_service.py`
                     (DynamoDB 접근·투표/댓글 카운터 갱신·응답 shaping 전부)로 뺐다.
                     `post_handler.py`는 96줄로 축소, HTTP 메서드/경로 판별과 인증만 담당.
                     검증: OPTIONS/warmup/잘못된 JSON 경로 스모크 테스트로 DynamoDB 없이도
                     확인 가능한 부분 재확인 + 전체 테스트 스위트 104 passed(기존 무관 에러
                     6건 동일) — 실제 DynamoDB 쓰기 경로(생성/투표/댓글)는 이 프로젝트에
                     해당 핸들러 전용 테스트가 원래 없어서 별도 검증 없이 순수 이동만 확인.
                     2026-08-24 후속: `handlers/s3_articles_handler.py`(378줄)도 같은 패턴으로
                     `s3_articles_service.py`(S3 XML 조회·키워드 매칭·응답 shaping)로 분리 —
                     이 파일은 원래도 async 함수로 로직이 어느 정도 분리돼 있었어서(handler=
                     라우팅은 이미 지켜지고 있었음) 파일만 나눴다. 99줄로 축소. 검증: OPTIONS·
                     keywords 누락 400 스모크 테스트(둘 다 AWS 호출 없음) + 전체 스위트 재확인.
                     2026-08-24 후속2: `handlers/cms_posts_public.py`(363줄, 채널별 응답
                     shaping 함수 6개가 핸들러 파일에 다 있던 것)를 `cms_posts_shaping.py`
                     (shape_letter/shape_paper/shape_webtoon/shape_video/shape_lens/
                     shape_home_player_item + SHAPERS dict)로 분리. 이 파일은 core.response/
                     core.decorators를 이미 쓰고 있어(CORS 중복 문제 없음) 순수 구조 분리만.
                     91줄로 축소. 검증: 전용 테스트 tests/test_cms_posts_public.py 8/8
                     통과(letters/paper 채널 shaping, slug 조회, CORS, 404, cache-control
                     헤더까지 커버) + 전체 스위트 재확인.
                     2026-08-24 후속3: `handlers/user_handler.py`(356줄, 프로필 생성/조회·읽기
                     기록·통계·뱃지 계산이 전부 핸들러 파일에 있던 것)를 `user_service.py`
                     (get_or_create_user/record_article_read/get_reading_history/
                     get_user_stats/_calculate_streak/_check_and_award_badges +
                     success_response/error_response)로 분리. 356→117줄. 부수 정리: 원본에
                     대입만 되고 이후 안 쓰이던 `query_params` 죽은 코드 1줄 제거(동작 영향
                     없음). 검증: OPTIONS·인증 없는 요청 401 스모크 테스트(둘 다 AWS 호출
                     없음, 상태코드·바디 모양 리팩토링 전후 동일 확인) + 전체 스위트 재확인
                     (104 passed, 기존 무관 에러 6건 동일).
                     2026-08-24 후속4: `handlers/search_handler.py`(345줄, GSI 쿼리·
                     카테고리 별칭 확장·중복제거·페이지네이션·warm-container 인메모리
                     캐시가 전부 핸들러 파일에 있던 것)를 `search_service.py`
                     (search_dynamodb_optimized/query_by_category_and_date/get_cached/
                     set_cached/SearchResponse)로 분리. 345→77줄. `query_by_category_and_date`의
                     `LastEvaluatedKey` 루프는 항목 10에서 이미 "다른 파일들과 달리
                     error-partial-results 의미가 달라 공용 헬퍼로 안 옮긴다"고 결정된
                     대로 그대로 유지(순수 파일 이동만). 검증: 잘못된 JSON body → 500
                     SEARCH_ERROR 스모크 테스트(AWS 호출 없음, 상태코드·에러코드 리팩토링
                     전후 동일 확인) + 전체 스위트 재확인(104 passed, 기존 무관 에러 6건 동일).
                     ⚠️ `metrics_service.py`(`MetricsService`, "demo dashboard용" — 자체 docstring)는
                     2026-08-05 삭제됨 — 2026-07-30 폐기된 `metrics` 핸들러의 백엔드 로직,
                     사용처 0 (수동 perf 스크립트 한 곳뿐이었음).
                     `article_filter_service.py`의 `get_filter_service()` 싱글턴도 같은 날
                     삭제(호출자 0) — 당시엔 "`article_collector.py`가 getter 없이 직접
                     인스턴스화한다"고 판단해 본체(`FilterResult`, `ArticleFilterService`)는
                     남겨뒀는데, 2026-08-08 재확인 결과 `article_collector.py`가 필터링
                     자체를 호출하지 않아 본체도 호출자 0이었다 — 파일 전체 삭제.
                     ⚠️ `prompt_loader.py`의 `load_prompt_by_path`/`invalidate`도 호출자 0이라
                     2026-08-05 삭제 — 살아있는 `load_prompt`/`load_transform_prompt`/
                     `load_chatbot_prompt`는 그대로.
models/             → `personal.py`(ArchivedSentence/ReadingRecord/UserProfile)만 남음.
                     ⚠️ `article.py`(371줄: Article/ArticleVersion/CollectionLog/ContentBlock 등)
                     와 `ab_test.py`(171줄)는 2026-08-05 전체 삭제 — 둘 다 import하는 곳이
                     `models/__init__.py`의 재export 말고는 전혀 없었다. `article.py`의
                     `ContentBlock`/`RelatedNews`/`PushInfo`/`PaperInfo`는 이름이 같아 헷갈리기
                     쉬운데 `clients/s3_xml_client.py`가 독자적으로 갖고 있는 동명 클래스가
                     실제로 쓰이는 것 — 이 파일 것들은 처음부터 무관한 그림자였다.
                     `UserProfile.to_api()`(14줄)도 같은 날 삭제 — `user_handler.py`가 이 대신
                     동일 로직을 인라인 재구현해서 씀.
core/               → Framework: decorators.py (@lambda_handler, @require_params, etc.),
                     exceptions.py (thin re-export of common/errors.py's BackendError
                     hierarchy — see "common/" below), response.py (delegates to
                     common/http.py, injects CORS_HEADERS).
                     ⚠️ revalidation.py(`CacheRevalidator`, 287줄)는 2026-08-05 삭제됨 —
                     자체 docstring이 "admin_handler.py·cms_update_handler.py에서 추출"이라고
                     밝히는데 둘 다 현재 트리에 없고, 프론트에 `/api/revalidate` 라우트
                     자체가 없어 이 모듈이 호출해도 받을 곳이 없었다. 테스트 커버리지도 0 —
                     `common/errors.py`의 미사용 예외 클래스들(아래)과 달리 "의도적으로
                     갖춰둔 범용 프레임워크"가 아니라 순수 죽은 통합 코드였음.
                     `config/settings.py`의 `frontend_url`/`revalidate_secret` 필드도
                     같이 삭제(이 모듈 전용이었음).
                     ⚠️ `common/errors.py`의 `BackendError` 하위 10개 클래스 중 7개
                     (`NotFoundError`, `RepositoryError`, `TranslationError`,
                     `ExternalServiceError`, `AuthorizationError`, `RateLimitError`,
                     `ConfigurationError`)는 프로덕션 코드에서 한 번도 raise되지 않지만
                     **의도적으로 유지한다** — `common/tests/test_errors.py`와
                     `tests/test_core_response_contract.py` 둘 다 10개 전부를 파라미터화된
                     테이블로 명시적으로 테스트하고 있어, "미래에 어떤 handler든 재사용할 수
                     있도록 갖춰둔 범용 에러 계층"으로 판단 — 이번 세션에서 지운 다른
                     것들(테스트도 참조도 0인 진짜 고아)과는 다른 카테고리.
config/             → settings.py (env-var-driven @dataclass Settings, cached
                     via @lru_cache get_settings()) + constants.py (model IDs,
                     DynamoDB table names, S3_BODY_FIELDS, CORS_HEADERS,
                     category normalization + search aliases,
                     Polly podcast voice styles). Never call `os.getenv` in
                     handlers — go through `config.settings`.
                     ⚠️ `MBTI_GROUP_INFO`는 MBTI 페르소나 폐지와 함께 삭제됐다.
                     ⚠️ `constants.py`에 사용처 0인 상수가 25~30개 정도 더 있다(대부분
                     `OPENSEARCH_INDEX_DEFAULT`/`BEDROCK_MODEL_ID_NOVA_PRO`/`NOVA_LITE`류,
                     `PODCAST_VOICE_STYLES`류, `SLUG_*`류 — settings.py를 거치거나 수동
                     통합 스크립트가 참조해서 파급이 얽혀있음) — 2026-08-05엔 완전히
                     고립된 것만 정리(`FRONTEND_URL_DEFAULT`, `HTTP_TIMEOUT_SHORT`,
                     `NAVER_TV_DEFAULT_URL`/`_URL_DEFAULT`, `BEDROCK_MODEL_ID_NOVA`,
                     `ITEM_TYPE_COLLECTION_LOG`/`ARTICLE_VERSION`,
                     `SETTINGS_KEY_TRANSLATION_PROMPT`/`VIDEO_SCHEDULES`/`PROMPT_HISTORY`).
                     나머지는 다음에 개별적으로 볼 것.
prompts/            → AI prompt templates organized by purpose:
                     chatbot/ (default.md — MBTI 그룹별 nt/nf/st/sf.md는 페르소나 폐지로
                     삭제, `chatbot_prompt_service.py`가 `load_chatbot_prompt('default')`
                     하나만 부름), selection/ (article_scorer.md),
                     validation/ (validator.md), podcast/ (podcast_script.md),
                     question/ (daily_question.md).
                     transform/ (nt/nf/st/sf.md — MBTI 4-페르소나 리라이팅 프롬프트)와
                     editor_letter/ + editor_letter_v3/ 는 2026-08-05 core25와 함께 삭제
utils/              → Small helpers included in the Lambda zip: date_utils.py
                     (`get_kst_today()` — 2026-08-05 추가, `article_handler.py`/
                     `s3_articles_handler.py`에 토씨 하나까지 같게 중복돼 있던
                     `_get_kst_today()`를 여기로 통합), hash_utils.py. Not a layer
                     in the architectural sense — just shared utilities.
common/             → Cross-track shared utilities (모든 handler + admin이 import).
                     - `feature_flag.py` — DDB-backed feature flags + numeric thresholds.
                     Fail-open / fail-safe, own 5-min TTL cache.
                     - `secrets.py`      — SSM SecureString reader. Fail-closed, own
                     5-min TTL cache.
                     ⚠️ `feature_flag.py`/`secrets.py`의 `invalidate()`(캐시 무효화용
                     escape hatch)는 둘 다 2026-08-05 삭제 — 호출자·테스트 0. TTL
                     캐시라 자연 만료되고, 강제 무효화를 실제로 쓰는 곳이 없었다.
                     - `http.py`         — CORS-neutral response builder (`success`/`error`/
                     `json_dumps`). No cache; doesn't import `config/` so CORS can't leak
                     in. `core/response.py` and `admin/backend/shared/response.py` both delegate
                     to it (CORS injected by the caller, not this module).
                     - `errors.py`       — `BackendError` hierarchy + `EXCEPTION_STATUS_CODES`
                     + `get_status_code_for_exception()`; `core/exceptions.py` re-exports it.
                     Bundled into the Lambda zip by `deploy.sh` and the admin zip by
                     `admin/backend/deploy-admin-api.sh`. Import path inside Lambda:
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

⚠️ `service/backend/MBTI_TRANSFORM_PROMPT.md`(옛 last-resort fallback for
`clients/mbti_transform_service.py`)는 그 서비스 파일과 함께 삭제됐다 — 더 이상 없다.

