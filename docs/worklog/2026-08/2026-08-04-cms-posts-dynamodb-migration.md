# 2026-08-04 CMS posts pgvector → DynamoDB 재구축

작성: 영광 + Claude Code
관련: `sedaily-mbti-cms-posts-dev`(신규 DynamoDB), `admin/repo/posts_repo.py`,
`v2/clients/cms_posts_ddb_client.py`, 브랜치 `feat/cms-work`

## 배경

같은 세션에서 RDS `sedaily-mbti-pgvector-v2-dev` 를 삭제하면서(경위:
`2026-08-04-transform-pipeline-decommission.md`) `cms_posts` 테이블도 함께
사라졌다. CMS 작업을 다시 시작하기로 하면서, RDS 를 스냅샷에서 복원하는 대신
**CMS 저장소만 DynamoDB 로 새로 짓기로** 결정했다 — 오늘 하루 종일 걷어낸
VPC·NAT·RDS 고정비 방향과 맞고, 다른 v1 테이블들처럼 PAY_PER_REQUEST 라 유휴
비용이 없다.

## 설계

기존 `cms_posts_schema.sql` 과 `admin/repo/posts_repo.py`·
`handlers/cms_posts_public.py` 의 실제 쿼리를 코드로 먼저 다 읽고 접근 패턴을
확인한 뒤 설계했다:

- PK `id`(포스트 UUID)
- GSI `slug-index` — PK `slug` (공개 API 의 slug 조회 + 생성 시 유니크 체크)
- GSI `status-publish_date-index` — PK `status`, SK `publish_date` (어드민 목록·
  공개 발행글 목록)
- `channels` 는 배열이라(글 하나가 letters+paper 동시 소속 가능) GSI 로 직접
  인덱싱하지 않고, GSI-2 로 status/date 까지 좁힌 뒤 채널·삭제여부는 애플리케이션
  에서 필터링 — CMS 글은 수동 작성이라 볼륨이 작아(수십~수백 건) Scan/필터 비용이
  무시할 만하다는 전제.

## 한 것

1. **테이블 생성** — `sedaily-mbti-cms-posts-dev`, PAY_PER_REQUEST, GSI 2개.
2. **admin 쓰기 레포 재작성** — `admin/repo/posts_repo.py` 를 SQL(`pg_client`)에서
   DynamoDB(`shared/ddb_client.posts_table()`)로 전면 교체. **함수 시그니처는
   그대로 유지**(`create/get/list_posts/update/set_status/soft_delete`)해서
   `routes/posts.py` 는 한 줄도 안 고쳤다. `shared/ddb_client.py` 에
   `posts_table()` accessor 추가(기존 `config_table()`/`prompts_table()` 과
   같은 패턴).
3. **v2 공개 읽기 클라이언트 신규 작성** — `v2/clients/cms_posts_ddb_client.py`.
   admin/ 과 v2/ 는 별도 Lambda 패키지라 `posts_repo.py` 를 import 할 수 없어서
   읽기 전용 버전을 따로 뒀다(원래 SQL 버전도 같은 이유로 로직이 두 곳에
   나뉘어 있었다 — 그 구조를 그대로 유지). `handlers/cms_posts_public.py` 의
   `PgVectorV2Client` 참조를 전부 이걸로 교체.
4. **IAM 권한 추가** (신규 테이블은 아무 롤에도 권한이 없었다):
   - `sedaily-mbti-v2-collector-dev-role-nbf99tic`(v2-posts Lambda 가 공유하는
     롤) 에 `CmsPostsPublicRead` 인라인 정책 추가 — 테이블 + GSI 2개에 대한
     `dynamodb:Query` 만 (읽기 전용, 공개 API 라 그 이상 필요 없음).
   - `sedaily-mbti-admin-api-dev-role` 의 기존 `AdminApiAccess` 정책 중
     `DynamoDBAdmin` statement 의 Resource 배열에 테이블 + GSI 2개 추가
     (Get/Put/Update/Delete/Query/Scan — 기존 admin-config/prompts 테이블과
     동일 액션셋).
5. **테스트** — 기존 `admin/tests/test_posts_repo.py` 는 `pg_client.run` 을
   fake 로 대체하는 방식이라 SQL 버전 전용이었다. moto(`mock_aws`) 기반으로
   전면 재작성 — 실제 DynamoDB(인메모리) 에 대고 13개 테스트 실행, 전부 통과.
   `v2/tests/test_cms_posts_ddb_client.py` 신규 작성(8개, 채널/날짜 필터·
   발행상태 체크·소프트삭제 제외 커버) — 통과.
   `admin/tests/test_posts_routes.py`(18개, posts_repo 를 fake 로 대체하는
   방식이라 구현 교체와 무관)는 손 안 대고 그대로 통과 확인 — 함수 시그니처
   보존의 실효성 검증.
6. **배포** — `./v2/deploy-v2.sh posts`(sedaily-mbti-v2-posts-dev),
   `./admin/deploy-admin-api.sh`(sedaily-mbti-admin-api-dev) 실행.
7. **스모크 테스트**:
   - `GET /api/v2/posts?channel=letters` → `{"channel":"letters","date":null,"posts":[]}`
     (에러 아님, 빈 테이블이라 빈 배열 — 정상)
   - `GET /api/v2/posts/nonexistent-slug` → 404 `NOT_FOUND` (500 아님 — DynamoDB
     쿼리 경로가 깨끗하게 실행됨을 증명)
   - `GET /admin/posts`(인증 없이) → 401 (500 아님 — admin-api Lambda 가
     `posts_repo.py`/`ddb_client.py` import 없이 콜드스타트하고 인증 체크까지
     정상 도달함을 증명)

## 결정

- RDS 를 스냅샷에서 복원하지 않고 CMS 만 DynamoDB 로 분리했다. `articles`·
  `daily_letters`(오늘의 한 통)는 여전히 복구 안 됨 — 그건 별도 결정 사항으로
  남아 있다(decommission 워클로그의 "다음" 참조).
- `admin/shared/pg_client.py` 는 그대로 뒀다 — `letters_repo.py` 가 아직 이걸
  쓰고 있어서(daily_letters, RDS 없어 여전히 깨진 상태), CMS 만 먼저 떼어냈다.

## 남은 것

- `admin/repo/letters_repo.py` 도 같은 RDS 삭제로 깨져 있다 — 어드민에서
  daily_letters 관리 화면을 쓰려면 이것도 DynamoDB 로 옮기거나 RDS 복구를
  기다려야 한다. CMS 와 같은 패턴으로 옮기는 게 가능한지는 다음에 검토.
- CMS 글을 실제로 하나 만들어서 어드민 UI → API → 공개 API 전체 왕복을
  수기로 확인하지는 못했다(JWT 인증 필요, 이번 세션에서는 401 까지만 확인).
  다음에 어드민 로그인해서 실제 글 작성 테스트 권장.
- `sedaily-mbti-cms-media-dev` S3 버킷(커버 이미지 등 미디어 저장용으로 추정)
  과의 연동은 이번 작업 범위 밖 — 건드리지 않았다.
