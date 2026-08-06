# 2026-08-05 백엔드 v1/v2 폴더 통합 + 파이프라인 폐기 + SOLID 정리 8라운드

작성: 영광 + Claude Code
관련: 커밋 `153c18a`~`61bdbbe`(`service/backend/`), 브랜치 `refactor/backend-cleanup` → `main`(fast-forward)

## 배경

"더 개선할 부분은?"을 반복 요청받아 라운드를 새로 돌리는 방식으로 진행했다.
시작 시점엔 `service/backend/v2/`가 "차세대 재설계" 병렬 스택으로 따로 있었고,
핵심 파이프라인(Selector/Transform/개인화 쓰기)은 2026-08-04에 이미 폐기된
상태였다. 폴더 구분부터 정리하고 들어갔다.

## 1부 — v1/v2 폴더 통합

`153c18a`. v2/ 는 재작성이 아니라 이동 — 이미 프로덕션 검증된 코드를 v1 구조로
옮기기만 했다.

- 이동(`git mv`, import 경로 `v2.xxx` → `xxx`): 핸들러 10개(health, today_letters,
  subscribe, front_page, cms_posts_public, core1_collector, core25_editor_pick,
  core3_feed, core3_article, newsletter), `core25/`·`core3/`·`newsletter/` 패키지
  전체, 클라이언트 6개(pgvector_v2_client, embedding_v2_client, s3_article_v2_client,
  cloudwatch_metrics, daily_letters_ddb_client, cms_posts_ddb_client), 테스트 24개
- 삭제: `clients/transform_v2_service.py`(죽은 core2_transform 전용), v2/ 전용 문서
- `deploy.sh`/`deploy-v2.sh` 병합 — zip 하나, 스크립트 하나. Lambda 함수명은 그대로
  (`sedaily-mbti-v2-*-dev` 포함) 두고 소스 위치만 옮겼다
- 검증: 이동 모듈 26개 실제 import 성공, pytest 377 passed / 9 failed(사전부터
  있던 무관 실패) / 9 skipped / 4 xfailed. `mock.patch("v2.xxx...")` 문자열 리터럴
  24개·하드코딩 `v2/` 경로 2개는 `ast.parse`로 못 잡아서 실제 pytest 실행으로 재확인

## 2부 — "오늘의 한 통" 프로덕션 사고 발견 + 파이프라인 폐기

`a90412f`. 통합 직후 운영 상태를 점검하다가 발견.

### Before
`GET /api/v2/today-letters` → `{"letters": []}`, DynamoDB 0건.

### 원인
2026-08-04 pgvector RDS 삭제 때 **읽기**(`today_letters.py`)는 DynamoDB로
이관됐지만 **쓰기**(Editor Pick의 `insert_daily_letter`)는 여전히 죽은 RDS를
보고 있어 매일 조용히 실패 중이었다. 프론트의 lookback 로직이 예전 데이터로
가려서 화면상 정상처럼 보였을 뿐이었다. front-page API도 같은 원인으로 500.

### 결정
파이프라인을 고치지 않고 폐기. 콘텐츠는 관리자 대시보드 수동 업로드
(`cms_posts_public.py`, DynamoDB 기반, 정상 동작 중)로 대체한다 — 사용자 판단.

### After — 삭제
- 핸들러: `core1_collector`(수집 크론), `core25_editor_pick`(편지 생성 크론),
  `core3_feed`/`core3_article`(2026-05-13부터 항상 빈 응답만 내던 죽은 개인화 코드)
- 패키지 전체: `core25/`, `core3/`
- `clients/embedding_v2_client.py`, 파이프라인 전용 프로비저닝/백필 스크립트,
  `prompts/editor_letter{,_v3}/`, 대응 테스트 13개

### After — 축소(God Object 해소)
`clients/pgvector_v2_client.py`: 1986줄·34메서드 → front_page.py가 쓰는
2메서드(`get_front_page_articles`, `get_latest_front_page_date`)만 남기고
150줄로. front-page 자체는 여전히 500 에러 상태 — 복구 여부는 이번에 정하지
않았다.

### 부수 발견 — 버그 수정
`handlers/newsletter.py`의 `_load_today_letters()`가 죽은 pgvector를 1순위로
시도하다 매번 실패해 항상 로컬 미러/mock으로 폴백하고 있었다. 구독 웰컴 메일이
실제 오늘 편지 대신 가짜 데이터를 보내고 있었다는 뜻 — `daily_letters_ddb_client`
(today_letters.py와 동일 소스)로 1순위 교체.

## 3부 — SOLID/죽은 코드 정리 라운드 2~7

같은 흐름(Explore agent 조사 → grep 재검증 → 삭제/축소 → import 성공 확인 →
pytest)을 라운드마다 반복. 라운드별 커밋과 핵심만 압축.

| 라운드 | 커밋 | 핵심 |
|---|---|---|
| 2 | `891c255` | `dynamodb_client.py` 989→562줄(고아 메서드 12개), `s3_xml_client.py` 903→798줄, `chatbot_handler.py`(869줄)를 `chatbot_context_service`/`chatbot_prompt_service`/`chatbot_engine` 3개로 분리(순수 이동) |
| 3 | `a918e26` | `services/prompt_service.py` 전체 삭제, `pgvector_client.py`(v1) 445→209줄, `article_handler.py`의 도달 불가 `handle_article_by_slug` 삭제 |
| 4 | `adbc76d` | `repositories/base.py`+`log_repository.py`+`settings_repository.py` 3개 전체 삭제(~930줄, 배선된 적 없는 죽은 인프라), `archive_handler.py`의 매 삭제마다 Bedrock 임베딩만 태우고 아무것도 안 지우던 no-op 정리 블록 제거(비용 버그) |
| 5 | `c903412` | `personal_db_client.py` 도메인 메서드 전체(~57줄, PersonalRepository가 이미 primitive로 중복 구현 중이었음), `embedding_client.py` 배치 메서드들, 이걸로 5라운드째 나머지 후보는 이미 깨끗해서 diminishing returns 판단 |
| 6 | `0aff6b7` | `models/article.py`(371줄)·`models/ab_test.py`(171줄) 전체 삭제, `services/metrics_service.py`(309줄, "demo dashboard용") 전체 삭제, `core/revalidation.py`(287줄, 받을 곳 없는 라우트) 전체 삭제, 죽은 상수 9개 정리 |
| 7 | `3ef0d52` | `clients/cloudwatch_metrics.py` 전체 삭제, `clients/translate_client.py` 전체 삭제, `invalidate()` 계열 정리 |

### 자기 정정 (라운드 7)
라운드 5에서 CLAUDE.md에 `cloudwatch_metrics.py`를 "today_letters 관측용,
살아있음"이라고 적었는데, 라운드 7 재검증에서 틀린 걸로 확인했다 — emit 함수를
부르는 곳이 실제로 하나도 없었다. 문서를 정정했다.

### 의도적으로 안 지운 것
`common/errors.py`의 `BackendError` 하위 클래스 10개 중 7개가 프로덕션에서 한
번도 raise되지 않지만, `common/tests/test_errors.py`와
`tests/test_core_response_contract.py` 둘 다 10개 전부를 파라미터화된 테이블로
테스트하고 있어 유지했다. 같은 논리로 `clients/s3_article_client.py`의
`delete_body`도 유지(실 S3 통합 테스트가 지금도 통과 중). "호출자·테스트 둘 다
0"인 것만 지웠다.

### 검증 (라운드 공통)
매 라운드: 전체 `.py` 문법 체크, 수정 모듈 실제 import 성공, pytest 실행(9개
무관한 사전 실패 외 변화 없음 유지 확인). 라운드 7에서는 `tests/conftest.py`의
`_block_real_cloudwatch` autouse fixture(모든 테스트가 자동으로 이 모듈을
import)를 미리 못 찾았으면 `cloudwatch_metrics.py` 삭제 시 테스트 스위트
전체가 깨졌을 뻔했다 — 삭제 전에 발견해서 같이 제거.

## 4부 — 클린코드 원칙 리뷰

`61bdbbe`. 사용자 요청으로 Toss Frontend Fundamentals(가독성·예측가능성·
응집도·결합도) + SOLID/Clean Code 관점에서 지금까지 결과를 다시 훑어 4건 수정.

1. `chatbot_engine.py`: 동기·스트리밍 tool-use 루프가 각자 중복 구현하던 부분
   중 진짜 동일한 두 곳을 헬퍼로 추출(`_build_bedrock_request`,
   `_execute_tool_batch`). old-style 인라인 코드와 출력이 바이트 단위로
   동일한지 직접 비교 스크립트로 검증
2. `today_letters.py`: `_shape_letter_response` → `shape_letter_response`로
   승격 — `newsletter.py`가 밑줄 붙은 내부 함수를 다른 모듈에서 그대로 가져다
   쓰던 캡슐화 위반
3. `date_utils.py`: `get_kst_today()` 신설 — `article_handler.py`와
   `s3_articles_handler.py`에 토씨 하나 안 틀리고 중복돼 있던 함수 통합
4. `question_handler.py`: `boto3.dynamodb.conditions.Key`를 명시 import —
   이전엔 다른 코드가 먼저 `boto3.resource('dynamodb')`를 불러줘야만
   네임스페이스가 채워지는 호출 순서 의존이었다

## 5부 — Git 브랜치 규율 정리

"브랜치 팠나요?" 질문을 받고 확인해보니, 1부~4부(9개 커밋)가 전부 `main`에
직접 올라가 있었다. `refactor/backend-cleanup` 브랜치를 그 지점에서 새로 만들고
`main`을 `origin/main`으로 되돌린 뒤, "main에 올리세져" 지시로 fast-forward
머지했다.

## 결정

- 파이프라인은 고치지 않고 폐기, 관리자 수동 업로드로 대체(2부)
- `common/errors.py`의 테스트 커버된 미사용 클래스, `s3_article_client.py`의
  `delete_body`는 "미래 재사용 대비 프레임워크"로 판단해 유지(3부)
- front-page API 복구 여부는 이번엔 결정하지 않음 — 별도 트랙

## 다음

- front-page API(500 에러) 복구 여부 결정
- `docs/` 폴더 정리 요청이 있었으나 사용자가 "일단 놔두시고"로 취소 — 다시
  요청 전까지 손 안 댐
- `config/constants.py`의 나머지 죽은 상수 후보(~25개)는 파급이 얽혀있어 범위 밖으로 남김
