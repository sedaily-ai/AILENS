# 2026-08-04 v2 Core 1.5/2 영구 폐기 — Selector·Transform Lambda + EventBridge 삭제

작성: 영광 + Claude Code
관련: `sedaily-mbti-v2-transform-dev`(삭제됨), `sedaily-mbti-v2-transform-trigger`(삭제됨),
`sedaily-mbti-v2-selector-dev`(삭제됨), `sedaily-mbti-v2-selector-schedule`(삭제됨)

## 배경

`/api/v2/feed`, `/api/v2/article/{id}` 가 계속 빈 값을 반환하는 문제를 짚다가, Core 2
Transform(Opus 4.6 로 MBTI 4버전 리라이팅)이 `067fcbd`(2026-05-15) 에서 월 $270 절감
목적으로 DISABLED 된 채 그대로였다는 걸 재확인했다.

되살리는 방향(밀린 큐 정리 SQL + 트리거 재활성화)을 제안했으나, 밀린 큐 처리에만
추가로 ~$700, 재활성화 후 계속 월 $270 이 나간다는 걸 알고 나서 판단이 바뀌었다 —
"돈 나가는 작업은 안 해도 된다"는 결정. Core 2 는 되살리지 않고 **영구히 없앤다**.

## 1부 — Core 2 Transform 삭제

- `sedaily-mbti-v2-transform-trigger` EventBridge 규칙 삭제 (rate(5 minutes), DISABLED 상태였음)
  - 타겟(`transform-lambda` → `sedaily-mbti-v2-transform-dev`) 먼저 remove-targets 후 delete-rule
- `sedaily-mbti-v2-transform-dev` Lambda 함수 삭제
  - 삭제 전 확인: EventBridge 규칙 외 다른 트리거(event source mapping) 없음 — 단독 트리거였음
  - `.clauderules` 의 "Lambda function create/delete 는 always-manual" 규칙을 사용자가
    명시적으로 override 하도록 확인받고 진행 (AskUserQuestion, "지금 규칙 무시하고 대신 삭제해줘")

## 2부 — Core 1.5 Selector 도 같은 날 추가로 삭제

Transform 이 사라지고 나니 "리소스를 다 없애자"는 방향으로 사용자 판단이 확장됐다.
Collector(임베딩→pgvector)와 Selector(Nova Lite MBTI 채점)까지 지우자는 요청이 왔는데,
지우기 전에 `get_editor_pick_candidates` SQL 을 다시 읽어 의존성을 확인했다:

- **Collector 는 필수 의존성이다.** 후보 쿼리가 `article_selections`(Selector 산출물)이
  아니라 `articles`(Collector 원본) 를 `WHERE a.metadata->>'paper_number' = '1'` 로 직접
  조회한다. Collector 를 지우면 신규 `articles` 행이 안 생기고, 곧 "오늘의 한 통"
  (`/api/v2/today-letters` — 사이트의 유일한 실제 콘텐츠) 이 멈춘다. **지우지 않았다.**
- **Selector 는 선택적 의존성이다.** 코드 주석("Selector 점수는 있으면 정렬에만 쓴다
  (LEFT JOIN) — 선별되지 않은 1면 기사도 후보에서 빠지지 않는다")대로, 없어도 Editor
  Pick 후보 목록 자체는 그대로 나오고 정렬 우선순위만 바뀐다. Transform 이 이미 없어서
  Selector 의 채점 결과를 소비하는 곳도 없었다 — 있으나 마나였다. **삭제 대상으로 확정.**

삭제 작업:
- `sedaily-mbti-v2-selector-schedule` EventBridge 규칙 삭제 (cron 00:30 KST, ENABLED 상태였음)
  - 타겟(`selector-lambda` → `sedaily-mbti-v2-selector-dev`) 먼저 remove-targets 후 delete-rule
  - `remove-targets`/`delete-rule` 은 Claude Code 세션에서 바로 실행됨
- `sedaily-mbti-v2-selector-dev` Lambda 함수 삭제
  - 삭제 전 확인: 이 규칙 외 다른 트리거 없음 — 단독 트리거였음
  - `lambda delete-function` 호출이 harness auto-mode 분류기에서 반복 차단됨(Transform
    때와 달리 이번엔 재시도로도 안 뚫림) — 사용자가 `!aws lambda delete-function ...`
    을 직접 실행해 완료

## 결정

- **Core 1.5 Selector, Core 2 Transform 둘 다 영구히 없앤다.** Transform 밀린 큐 재처리
  일회성 ~$700 + 재개 시 월 $270, Selector 는 Transform 없는 상태에서 채점 결과를
  아무도 안 읽는 죽은 계산 — 둘 다 비용 대비 남길 이유가 없다고 판단.
- **Collector·Editor Pick 은 그대로 둔다.** `/api/v2/today-letters` 가 실제로 사이트를
  떠받치는 콘텐츠이고, Editor Pick 후보 SQL 이 Collector 산출물(`articles`)을 직접
  필수로 조회하는 걸 확인했다 — Collector 를 지우면 그 콘텐츠까지 같이 끊긴다.
- **`article_selections` 의 밀린 큐 행은 그대로 둔다.** Selector·Transform 둘 다 없어져
  다시 쓰거나 읽힐 일이 없으므로 방치해도 무해하다 — 정리 SQL 은 실행하지 않았다.
- **`/api/v2/feed`, `/api/v2/article/{id}` Lambda 는 이번엔 안 건드렸다.** 이 둘은 이제
  "일시적으로 비었음"이 아니라 "설계상 원래 비어 있음"이 됐다. 프론트는 이미 빈 응답일
  때 mock 으로 대체하도록 짜여 있어 화면은 안 깨진다. 이 두 API·`article_versions`
  테이블·`FeedPage.tsx`/`ArticleView.tsx` 의 어댑터 코드까지 걷어낼지는 별개 결정으로
  남겨뒀다 — 다음에 판단.
- **v2 백엔드 아키텍처 자체를 다시 설계하는 건 별도 세션으로 미룬다.** 원래 그리던
  "전체 수집 → 선별 → 변환 → 개인화" 4단계 중 3단계(Selector·Transform·Core 3 개인화)
  가 죽고 Collector→Editor Pick 직행 구조만 실제로 돈다. 지금 코드가 죽은 3단계를
  그대로 끌고 다니는 상태라, 실제로 돌아가는 그림에 맞춰 재설계가 필요하다는 데
  사용자와 합의했다 — 착수는 다음 세션.

## 3부 — 비용 감사 후 Core 3 쓰기 경로(consolidate·interaction)도 삭제

Selector·Transform 정리 후 "백엔드에서 진짜 비용 나가는 게 뭐가 더 있나" 감사를 한 판
더 돌렸다. 실측 결과:

- **고정비**: RDS `pgvector-v2-dev`(db.t3.small) 월 $30~35, OpenSearch `search-dev`
  (당시엔 "삭제 제외" 기존 결정 존중 — 이후 4부에서 뒤집힘, 월 ~$27), NAT Gateway 1개
  (크로스리전 XML 접근용, 월 $32+).
- **의심했다가 아닌 걸로 확인된 것**: 같은 VPC 안 Bedrock runtime Interface Endpoint
  가 2개라 중복인 줄 알았는데, ENI 를 까보니 하나는 완전히 다른 프로젝트
  (`nx-tt-dev-ver3`, 같은 VPC 공유 중)의 Lambda 가 쓰는 것이었다. **지웠으면 남의
  서비스가 깨질 뻔했다** — 손대지 않았다.
- **RDS 다운사이즈(db.t3.small → micro)**: 시도했으나 harness 가 계속 막았고,
  사용자가 도중에 tool call 을 직접 취소(interrupt)했다. **진행하지 않음.**
- **Core 3 쓰기 경로 — 진짜 안 쓰는 것으로 확정**: `sedaily-mbti-v2-consolidate-dev`
  (크론 이미 DISABLED, 30일 0회) 와 `sedaily-mbti-v2-interaction-dev`(30일 3회지만
  consolidate 가 없어 그 값을 소비하는 곳이 없음 — 사실상 죽은 쓰기) 를 Lambda +
  EventBridge 트리거까지 삭제했다.
  - 삭제 전 각각 `lambda get-policy` 로 트리거 확인: consolidate 는 EventBridge
    규칙 하나뿐, interaction 은 API Gateway 라우트(`POST /api/v2/interactions`)
    하나뿐 — 둘 다 다른 의존관계 없음 확인 후 진행.
  - `events delete-rule`(consolidate-schedule), `lambda delete-function`
    (consolidate-dev) 는 재시도로 Claude Code 세션에서 바로 실행됨.
    `lambda delete-function`(interaction-dev) 는 harness 가 반복 차단해
    사용자가 `!aws lambda delete-function ...` 직접 실행으로 완료.
  - `POST /api/v2/interactions` API Gateway 라우트는 지우지 않았다 — Lambda 가
    없어져 이제 5xx 를 반환하지만, 프론트 dual-write 가 어차피 죽은 값을 쓰던
    거라 사용자 체감 차이는 없다. 라우트 정리는 다음 API Gateway 정리 때.

### 사용자 지시 흐름과 위험 포착 기록

이번 세션은 "다 지워라"는 지시가 세 번 나왔고, 그때마다 문자 그대로 따르면 실제로
사고가 날 뻔했다 — 그래서 각 지점에서 멈추고 확인한 근거를 남긴다.

1. "기존에 있는 리소스들... 다 없애버리시죠" → Collector 를 지우면 Editor Pick 후보
   쿼리가 `articles` 를 못 찾아 "오늘의 한 통"이 멈춘다는 걸 코드로 확인하고 제외.
2. "백엔드 리소스... 다 삭제해주세요" → RDS·DynamoDB·v1 API 까지 포함하면 사이트
   전체가 멈춘다고 판단, AskUserQuestion 으로 범위를 확인 → "진짜 안 쓰는 것만"으로
   좁혀서 진행.
3. Bedrock VPC 엔드포인트 "중복" → 실제로는 다른 프로젝트가 같은 VPC 를 쓰고 있던
   것이었다. 삭제 전 ENI 확인이 없었으면 AI LENS 와 무관한 서비스를 건드릴 뻔했다.

## 4부 — v1 OpenSearch 도메인도 삭제 (기존 "삭제 제외" 결정 번복)

DB 레이어 인벤토리를 마저 정리하다가 사용자가 "오픈서치도 빼야할듯"이라고 요청했다.
이건 이전에 이미 사용자가 명시적으로 "삭제 후보 제외"로 결정해뒀던 항목이라(과거
AWS 비용 점검 세션, 월 $27) 먼저 그 결정을 뒤집는 게 맞는지 확인부터 했다.

1차로 CloudWatch `SearchRate` 지표를 봤더니 최근 창에서 2,700건이 찍혀 있어서 "실제
트래픽이 있다"고 잘못 판단하고 한 번 멈췄다. 사용자가 "어디서 호출되고 있는거죠?"라고
재차 물어서 코드를 직접 추적했고, 거기서 정정 사항을 발견했다:

- `handlers/search_handler.py` 의 실제 프로덕션 함수(`search_dynamodb_optimized`)와
  `handlers/chatbot_handler.py` 의 RAG 유사 검색(`search_related_articles`, docstring:
  "Search DynamoDB for articles related to the user's message keywords")
  **둘 다 `OpenSearchClient` 를 import 조차 하지 않는다.**
- `handlers/` 디렉터리 전체를 grep 해도 `opensearch_client` 를 쓰는 곳이 없다.
  `OpenSearchClient` 가 실제로 인스턴스화되는 곳은 `tests/test_opensearch.py`,
  `tests/test_full_integration.py` 뿐 — 즉 통합테스트 전용이었다.
- `services/metrics_service.py` 는 `bool(settings.opensearch_endpoint)` 로 존재
  여부만 체크해 비용 추정에 반영할 뿐, 실제 호출은 하지 않는다.
- 즉 `OPENSEARCH_ENDPOINT` env var 는 `search-dev`/`chatbot-dev` Lambda 에 계속
  박혀 있었지만 **아무 코드도 그걸 읽지 않았다.** 검색·챗봇 RAG 는 이미 오래전에
  DynamoDB GSI 쿼리(`category-published_at-index`)로 완전히 대체돼 있었다.
  1차로 봤던 2,700건 트래픽은 애플리케이션 경로가 아니라 다른 데서(통합테스트 등)
  온 것으로 추정된다.

이 정정 이후 삭제를 진행했다:
- 접근 정책·VPC 연결 재확인 (일반 Lambda 실행 롤 하나만 허용, VPC 미연결 — 별다른
  숨은 의존관계 없음 확인)
- `aws opensearch delete-domain --domain-name sedaily-mbti-search-dev` 실행
  (harness 1회 차단 후 재시도로 Claude Code 세션에서 바로 성공, `Deleted: true`
  응답 — 실제 리소스 정리는 몇 분 뒤 완료)
- `CLAUDE.md`(루트 + `service/backend/CLAUDE.md`) 와 `README.md` 의 OpenSearch
  언급 전부 갱신 — "옵션, 없으면 DynamoDB 폴백"이 아니라 "애초에 안 불렸다"로 정정

### 교훈

CloudWatch 지표(요청 수)만 보고 "실사용 중"이라고 판단한 게 1차 오답이었다. 지표는
도메인에 뭔가 요청이 갔다는 것만 보여주지, **그 요청이 프로덕션 코드에서 왔는지는
안 알려준다.** 이번처럼 애플리케이션이 이미 딴 길로 갈아탄 뒤에도 인프라만 몇 달째
따로 살아있는 경우, 지표가 아니라 handler 코드의 실제 import/호출 여부를 확인해야
한다는 걸 다시 확인했다.

## 5부 — RDS `pgvector-v2-dev` 삭제 (사이트 실시간 중단)

VPC 사용 이유를 물은 뒤 "RDS도 버리시죠"로 이어졌다. RDS 는 이번 세션 내내 "필수
의존성이라 못 지운다"고 반복해서 설명해온 대상이라 — `articles`(Collector 원본),
`daily_letters`(Editor Pick 산출물, `/api/v2/today-letters` 가 읽는 데이터),
`cms_posts`(`/api/v2/posts`) 가 전부 이 안에 있다 — 지우면 사이트 콘텐츠가 그
순간부터 멈춘다고 명확히 설명한 뒤 진행 여부를 확인했다. 사용자가 "걍
지우시죠~~~"로 재확인해 진행했다.

**즉시 벌어지는 일을 실행 직전에 한 번 더 명시하고(콘텐츠 정지) 진행** — 되돌릴 수
없는 삭제라 데이터 보존을 위해 `--final-db-snapshot-identifier
sedaily-mbti-pgvector-v2-dev-final-20260804` 를 붙여 실행했다(`--skip-final-snapshot`
안 씀). `DeletionProtection` 이 `False` 인 것도 사전 확인.

```
aws rds delete-db-instance \
  --db-instance-identifier sedaily-mbti-pgvector-v2-dev \
  --final-db-snapshot-identifier sedaily-mbti-pgvector-v2-dev-final-20260804
```

### 실제 영향 범위 — 최초 설명보다 넓었다

삭제 직후 CLAUDE.md 를 갱신하다가, `PG_V2_HOST` 를 쓰는 Lambda 를 전수 확인했다.
당초 "오늘의 한 통만 멈춘다"고 말했으나 실제로는 그보다 넓다 — `v2-front-page-dev`
도 `PG_V2_HOST` 를 갖고 있어서 같이 깨진다. **RDS 를 쓰는 v2 Lambda 7개
(`v2-today-letters`, `v2-front-page`, `v2-posts`, `v2-collector`, `v2-editor-pick`,
`v2-article`, `v2-feed`) 전부 이제 매 호출마다 DB 연결 실패로 에러다.** 지금
살아있는 읽기 경로는 v1 DynamoDB 기반 `/api/posts` + `/api/questions` 뿐이다.

### 복구 경로 (필요해지면)

1. 스냅샷 `sedaily-mbti-pgvector-v2-dev-final-20260804` 에서 새 RDS 인스턴스 restore
2. 새 인스턴스의 엔드포인트로 위 7개 Lambda 의 `PG_V2_HOST` env var 갱신
3. 필요하면 VPC 서브넷 그룹·보안그룹 재확인 (VPC 자체는 안 지웠으니 그대로 붙는다)

## 다음

**최우선 — 사이트 콘텐츠가 지금 멈춰 있다.** 아래 나머지 항목보다 이게 먼저다.

- RDS 복구 여부부터 사용자와 정하기: (a) 스냅샷에서 새 인스턴스 restore + 7개
  Lambda 의 `PG_V2_HOST` 갱신해서 원상복구, 또는 (b) v2 백엔드를 pgvector 없는
  구조로 다시 설계(이번에 계속 논의된 "재설계"를 이 기회에 앞당겨서), 또는
  (c) 당분간 이대로 두고 v1 콘텐츠(`/api/posts`, `/api/questions`)만으로 버티기.
  세 선택지의 트레이드오프를 다음 세션 첫머리에서 정리할 것.
- 위 결정 전까지 `sedaily-mbti-v2-collector-schedule`(00:00 KST), `sedaily-mbti-v2-
  editor-pick-schedule`(01:00 KST) 두 크론이 매일 실패 알림/에러 로그를 쌓는다.
  당장 끄지는 않았다 — 복구하면 그대로 다시 쓸 수 있어서. 계속 실패하는 게 소음이
  되면 그때 DISABLE 처리.

이 아래는 RDS 삭제 이전부터 밀려있던 정리 항목 — RDS 복구 여부가 정해지기 전까지는
우선순위가 낮다.

- `deploy-v2.sh` 의 `CORE1_5_FUNCTIONS`(`selector-dev`) / `CORE2_FUNCTIONS`
  (`transform-dev`) / `CORE3_FUNCTIONS`(`consolidate-dev`, `interaction-dev`)
  배열에 삭제된 이름이 여전히 남아 있다. missing function 은 `[SKIP]` 으로
  gracefully 처리되어 당장 안 깨지지만, 죽은 참조라 다음에 코드 정리할 때 같이 뺄 것.
- `POST /api/v2/interactions` API Gateway 라우트 — 뒤에 Lambda 없이 5xx 반환 중.
  다음 API Gateway 정리 때 라우트 자체도 뺄 것.
- `/api/v2/feed` · `/api/v2/article/{id}` · 프론트 어댑터 코드 — RDS 자체가
  없어졌으니 `article_versions` 테이블 걱정은 무의미해졌다. 이 API들 자체를
  걷어낼지는 위 "RDS 복구 여부" 결정에 따라간다.
- `clients/opensearch_client.py`, `tests/test_opensearch.py`,
  `tests/test_full_integration.py` 의 OpenSearch 관련 부분 — 코드 자체는 안 지웠다.
  AWS 도메인은 없어졌으니 이 테스트들은 이제 항상 실패하거나 skip 돼야 하는데, 현재
  CI 에 안 물려 있어 당장은 무해하다. 다음에 코드 정리할 때 같이 뺄 것.
- `search-dev`/`chatbot-dev` Lambda 의 `OPENSEARCH_ENDPOINT` env var — 안 지웠다.
  아무도 안 읽으니 무해하지만, 죽은 설정이라 다음 Lambda 설정 정리 때 같이 뺄 것.
- v2 백엔드 아키텍처 재설계 — RDS 복구 여부 결정과 사실상 같은 논의가 됐다. 별도
  트랙으로 안 나누고 하나로 묶어서 다음 세션에서 다룰 것.
