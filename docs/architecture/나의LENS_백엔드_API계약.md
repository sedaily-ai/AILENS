# 나의 LENS — 백엔드 API 계약

> **2026-10-19 기능 다이어트 이후 현재 상태(이 블록이 아래 내용보다 우선)** — 경위: [작업 기록](../worklog/2026-10/2026-10-19-기능-다이어트.md)
> - 제거: API-06의 시간 예산(`minutes`), API-07의 `GET /sentences/{id}/recommendations`(404), API-09 `GET /activity`·`GET /rewards`(404), API-13 `GET /format-preference`(404). CMS 내부 `/activity`·`/rewards`·`/format-preference`·`/sentence-inputs`도 제거.
> - API-01 홈 집계: `format_preference`·`weekly_activity`·`weekly_rewards`·`notifications`는 조회하지 않고 `{"status":"unavailable"}`로만 남는다(옛 웹 호환, 다음 정리 때 제거). 웹은 `minutes=0`을 붙여 부른다(옛 계정 API 호환).
> - API-02 preferences: 저장은 `{revision,interests}`만. 옛 웹의 `{minutes,revision}`은 쓰지 않고 현재 설정을, `{interests,minutes,revision}`은 minutes를 버리고 저장한다. 응답의 `minutes`는 옛 계정 API 호환용 DB 값이다.
> - API-04 저장 레터: 읽음 필터 `read`는 받기만 하고 거르지 않는다. 카드에 `completed`·`read_minutes`가 없다(CMS 내부 카드에는 옛 계정 API 호환용 `read_minutes`가 남음).
> - API-08 이용 세션·이벤트: 보기 신호(`visible_ms`)만 판정하고 완료·스탬프·배지를 만들지 않는다.
> - **2026-10-20 2차** — [작업 기록](../worklog/2026-10/2026-10-20-기능-다이어트-2차.md)
>   - 제거(404): API-06 `GET /recommendations`(대시보드와 중복), API-10~12 알림 설정·동의·미리보기·기기 구독(`/notifications/*`·`/push-subscriptions`), `/api/user/read`·`history`·`stats`와 GET `/api/user/profile`. POST `/api/user/profile`(로그인 프로필 동기화)만 남고 응답에 `streak`이 없다.
>   - 알림 워커와 CMS 워커 경로(`/internal/personal/lens/notifications/*`)도 제거했다. 알림 테이블·데이터는 그대로다.
>   - CMS `POST /api/v2/issue-letters/subscriptions/test`(테스트 메일) 제거.
> - **추가(2026-10-20) API-14 저장한 기사** — [작업 기록](../worklog/2026-10/2026-10-20-저장한-기사.md), SQL v1.57 `user_article_bookmarks`
>   - `GET /api/v2/me/article-bookmarks?limit=1~200&cursor=` → 200 `{items:[{article_id,saved_at,content}],count,total,next_cursor}`. 최신 저장순. 다른 쿼리는 400.
>   - `content`: `{content_key:"publication:{id}",kind:"publication",available}`. available이면 `slug,title,summary,published_at,href(정규 기사 주소),categories,formats`도 싣는다. 비공개·삭제·형식 없는 기사는 `available:false`로 남아 해제만 할 수 있다.
>   - `GET /api/v2/me/article-bookmarks/{id}` → `{article_id,saved,saved_at}`. `PUT` 저장(공개 중이고 볼 수 있는 형식이 있는 기사만, 아니면 404. 다시 저장해도 처음 시각 유지), `DELETE` 해제(언제든 200). id는 숫자만(아니면 400).
>   - 웹은 기사 slug를 `GET /api/v2/me/content/resolve?kind=publication&key_type=slug&key=`로 ID로 바꾼 뒤 부른다. 404를 받으면 저장 버튼을 숨기고 서랍은 빈 목록으로 보여 준다(배포 사이 CMS에 경로가 없을 때도 계정 API가 404로 넘긴다).
>   - 커서는 레터 북마크 커서와 섞이지 않는다(서명 안에 목록 종류). 계정·기사를 실제로 지우면 저장 행도 함께 지워진다.

> 2026-10-14 추가 구현: 계정별 형식 선호·추천/알림 연결, 에디터 팔로우, 서버 완료 읽음 필터, 사용자 선택 북마크 가져오기를 로컬 구현했다. 현재 계약은 [형식 선호·계정 연결](../product/나의LENS/형식선호·계정연결_구현상태.md)과 [최신 전체 리뷰 보완](../product/나의LENS/백엔드_리뷰_보완.md)의 v1.54 계약을 따른다. 아래 이전 단계의 미구현 표시는 해당 구현으로 대체하며 운영은 미반영이다.

> 2026-10-14 레터 북마크 정책 보완: 저장·해제는 로그인 필수이며 목록·상세·나의 LENS가 계정 API를 공유한다. 기존 브라우저 데이터는 조회용으로 보존하고 자동 병합하지 않는다. 실제 API·보존·화면 흐름은 [최신 북마크 계약](../product/모아쓰기레터/북마크_동기화_연동요구사항.md)을 따른다. 운영 미반영이다.

> 최신 [백엔드 리뷰 보완](../product/나의LENS/백엔드_리뷰_보완.md)의 v1.52 SQL·서랍/콘텐츠 검사·worker 계약을 함께 따른다.

> 2026-10-14 네 번째 로컬 구현: [개인화 알림·동의·기기 구독·발송 구현 상태](../product/나의LENS/알림·푸시_구현상태.md)가 현재 계약이다. 아래 초기 제안과 응답/파일/테이블명이 다르면 구현 상태와 최신 코드를 우선한다. 운영 DB·배포·실제 발송은 미반영이다.

> 2026-10-14 세 번째 로컬 구현: [완료·기간 기록·스탬프·배지 구현 상태](../product/나의LENS/완료·리워드_구현상태.md)를 함께 따른다. 이전 설계의 미연동 표시는 이 문서의 실제 구현/운영 인수 경계로 갱신한다.
> 후속 로컬 구현(2026-10-14): 서랍 GET 인증·콘텐츠 resolver·계정 관심/읽을 시간·레터 북마크를 구현했다. 운영 DB/API Gateway/배포는 미반영이다. 실제 지원 범위와 기존 제안 계약의 차이는 [계정 저장 구현 상태](../product/나의LENS/계정저장_구현상태.md)를 우선한다. 두 번째 묶음인 [이용 신호·추천·홈 집계](../product/나의LENS/이용신호·추천_구현상태.md)도 로컬 구현했다. 나머지 기능은 아래 명세의 후속 구현 범위다.

기준일: 2026-10-14, HEAD `fc8c46e4` + 작업 트리. [개발 인수인계](../product/나의LENS/백엔드_개발_인수인계.md) · [데이터·구현 설계](나의LENS_백엔드_데이터·구현설계.md) · [문서 지도](../README.md).

**2절은 초기 조사, 3절부터는 당시 신규 계약 제안이다. 현재 로컬 구현·프론트 호출 범위는 상단 네 묶음 구현 상태를 따른다.** 프론트 모델에 그대로 호환되는 응답이라고 가정하지 말고 마지막 절의 어댑터를 함께 구현한다. 표시 개수·관심 한도 외 새로운 제한값은 권장 초기안이다.

## 1. 신규 API 공통 규약

공개 개인 API는 기존 `API_URL` origin을 사용한다. 새 `/api/v2/me/*`를 공개 Lambda로 연결하는 API Gateway route/integration을 구현할 때 확인한다. 기존 `CMS_API_URL`의 `/api/v2/issue-letters/me/*` 기기 API와 구분한다.

| 항목 | 계약 |
|---|---|
| 인증 | `Authorization: Bearer <Cognito ID token>` 필수. 기존 `core/auth.py`와 같은 RS256·iss·aud·exp·token_use=id·sub 검증 |
| 계정 | 서버에서 검증한 `sub`. body/query user_id로 owner 지정 불가. 내부 API에서만 검증 후 owner 전달 |
| 공통 헤더 | JSON 요청은 Content-Type application/json. 개인 응답은 Cache-Control private, no-store. CORS의 Authorization·Content-Type·Idempotency-Key와 OPTIONS 확인 |
| 성공 | 신규 API는 200/201 JSON, DELETE는 200 JSON. 기존 서비스 성공 wrapper는 별도 유지 |
| 시간 | 시각 ISO 8601 UTC `Z`, 기록 일자 YYYY-MM-DD KST. 알림 일정은 저장된 IANA zone의 local date/time |
| 키 | content_key=`publication:숫자ID` 또는 `issue_letter:숫자ID`. JSON의 DB bigint ID는 문자열 |
| 포맷 | `letter`, `webtoon`, `podcast`, `video`. issue_letter는 현재 실제 지원 읽기만. 메타데이터 없는 미디어를 있다고 반환 금지 |
| 목록 | limit 기본 50, 1~200 제안. 반환 `count`는 이번 페이지 길이, `total`은 전체 조건 일치 건수, `next_cursor`는 없으면 null |
| cursor | owner·필터·정렬·last timestamp/ID에 묶인 불투명 값. 다른 필터/계정 cursor는 400. 저장 목록은 saved_at DESC, stable ID DESC |
| 변경 충돌 | 전체 설정 PUT은 body revision으로 비교·갱신. 불일치 409. 새 항목은 revision=0. 빈 배열은 명시적인 전체 해제 |
| 멱등성 | 북마크·팔로우 PUT/DELETE는 상태 지정. 가져오기 Idempotency-Key 필수. activity는 event_id와 session_seq로 중복 제거 |
| 상태 | `ready`: 정상(빈 목록 포함), `unavailable`: 아직 제공 안 됨, `error`: 조회 실패. 실패를 정상 0건으로 숨기지 않음 |

영역 wrapper:

```json
{"status":"ready","data":{"items":[],"count":0,"total":0,"next_cursor":null},"error":null}
```

미준비는 `data:null,error:null`, 부분 장애는 `data:null,error:{code,message,retryable}`. 개인 인증 실패는 dashboard 일부 영역 error로 처리하지 않고 HTTP 401로 전체 거부한다.

신규 오류 envelope:

```json
{"error":{"code":"REVISION_CONFLICT","message":"다른 기기에서 설정이 변경됐습니다. 다시 확인해 주세요.","retryable":false},"request_id":"request-fixture"}
```

| HTTP | code 예 | 의미·재시도 |
|---|---|---|
| 400 | INVALID_ARGUMENT, INVALID_CURSOR, UNKNOWN_INTEREST | 잘못된 타입·범위·신규 키. 입력 수정 |
| 401 | AUTH_REQUIRED, INVALID_TOKEN | 로그인 다시 확인. 개인 데이터 반환 없음 |
| 403 | ACCOUNT_UNAVAILABLE | 정지·탈퇴 계정 정책 적용. 계정 상태 검증 구현 필요 |
| 404 | NOT_FOUND | 타인 소유 또는 없는/읽기 불가 개인 리소스. 타인 존재 여부 노출 금지 |
| 409 | REVISION_CONFLICT, IDEMPOTENCY_CONFLICT | revision/동일 키 다른 payload 충돌. 서버 최신 상태 조회 |
| 413 | PAYLOAD_TOO_LARGE | 요청 크기 초과 |
| 429 | RATE_LIMITED | Retry-After. 권장 초기안: 개인 조회 60/분, 변경 30/분, activity 계정 120/분 + 세션 간격. 실제 배포 제한은 확인·구현 후 기록 |
| 503 | DEPENDENCY_UNAVAILABLE | DB/내부 API/발송 서비스 실패. 원본 보존·제한된 재시도 |

rate limit은 기존에 구현됐다고 확인한 값이 아니다. 신규 요청 body 64KiB, import 128KiB, SQL timeout과 서버 client timeout을 함께 조정하는 초기안을 제안한다. 초과·dependency 장애는 개인 정보를 로그에 남기지 않는다.

## 2. 기존 API와 호환 요구

| 기존 경로 | 현재 코드/응답 | 변경 경계 |
|---|---|---|
| GET `/api/v2/posts?channel=lens&limit=100` | 공개 축약 목록 `posts`. lenses의 keywords는 제거됨 | 새 추천의 콘텐츠 소스. 공개 캐시와 개인 집계를 섞지 않음 |
| GET `/api/v2/issue-letters?limit=50`, `/{slug}`, `/topics`, `/editors` | 공개 레터·사전 | 사전·발행 상태 재사용, 목록 밖 저장 항목은 신규 계정 목록에서 일괄 shaping |
| GET/PUT `/api/v2/issue-letters/me/interests`, GET `/me/feed?limit=30` | X-Voter-Id, reader_hash. 전체 관심 교체·최대 40개. 피드 `letters`, reason_text | 계정 API와 별도 유지. 새 owner 인증으로 오인하지 않음 |
| POST `/api/archive` | JWT sub로 owner 덮어씀. text 최대 5000자, article_id 필요, 201 `{sentence,vector_status:"disabled"}` | 기존 저장 payload/응답 유지. 콘텐츠 resolver·서버 메타데이터·비공개 검사 보완 |
| GET `/api/archive?user_id=…&limit=200` | `{sentences,count,user_id}`, cursor/전체 total 없음 | **P0 인증 수정**. 기존 sentences/count는 유지하며 cursor/total/href를 추가하거나 신규 조회 어댑터 제공 |
| DELETE `/api/archive/{id}?user_id=…` | JWT sub로 owner 덮어씀. 200 `{deleted:true,archive_id}` | owner 조건 유지. upstream 오류를 404로 오인하는 기존 client의 HTTPError 처리 보완 |
| GET `/api/archive/popular` | 공개 `{highlights,count}`, 사용자 ID 없음 | 개인 목록과 독립. 대시보드 개인 문장 추천의 데이터 소스가 아님 |
| POST `/api/archive/similar` | 제공 종료 410 | 새 관련 글 기능은 아래 sentence/recommendations. 폐기된 임베딩 검색 복원 아님 |
| POST `/api/user/profile`, `/api/user/read`; GET `/history`, `/stats` | ID token 인증. profile/history/read와 기존 배지 계산 | 현재 이력은 완료 원장 아님. 새 activity/rewards와 계약 분리 |
| `/api/v2/issue-letters/subscriptions*` | 이메일 동의·확인·수신거부·미리보기·테스트 | 신규 Web Push와 별도. 이메일 설정을 자동 변경하지 않음 |

근거: [공개 개인 handlers](../../service/backend/handlers/user/archive.py), [사용자 handler](../../service/backend/handlers/user/user.py), [레터 라우터](../../service/lens-cms-api/routes_letters.py), [내부 personal 라우터](../../service/lens-cms-api/routes_users.py), [프론트 archive client](../../service/frontend/src/shared/lib/api/archiveApi.ts).

## 3. 신규 operation 목록

아래 모든 공개 경로는 로그인 필수. 개인 리소스의 owner는 토큰 sub다.

| ID | Method·Endpoint | 역할 |
|---|---|---|
| API-01 | GET `/api/v2/me/dashboard` | 홈 집계와 실제 연결 상태 |
| API-02 | GET/PUT `/api/v2/me/preferences` | 직접 관심·읽을 시간 전체 설정 |
| API-03 | GET `/api/v2/me/followed-editors`; PUT/DELETE `/api/v2/me/followed-editors/{editor_id}` | 팔로우 분리 저장 |
| API-04 | GET `/api/v2/me/letter-bookmarks`; PUT/DELETE `/api/v2/me/letter-bookmarks/{letter_id}` | 계정 레터 목록·저장·해제 |
| API-05 | POST `/api/v2/me/import` | 명시적으로 검토한 브라우저 자료 가져오기 |
| API-06 | GET `/api/v2/me/recommendations` | 뉴스/레터·이유 필터·시간 예산 (2026-10-20 제거) |
| API-07 | GET `/api/v2/me/sentences`; GET `/api/v2/me/sentences/{id}/recommendations` | 서랍 페이지/검색·문장별 관련 뉴스. 저장·삭제는 기존 API |
| API-08 | POST `/api/v2/me/activity/sessions`; POST `/api/v2/me/activity/events` | 유효 이용 세션·진행 보고 |
| API-09 | GET `/api/v2/me/activity`; GET `/api/v2/me/rewards` | 기간 집계·스탬프·배지 |
| API-10 | GET/PUT `/api/v2/me/notifications/preferences` | 계정 알림 설정 (2026-10-20 제거) |
| API-11 | PUT `/api/v2/me/notifications/consent` | Web Push 별도 동의·철회 (2026-10-20 제거) |
| API-12 | POST `/api/v2/me/push-subscriptions`; DELETE `/api/v2/me/push-subscriptions/{id}` | 현재 기기 구독 등록·해제 (2026-10-20 제거) |
| API-13 | GET `/api/v2/me/format-preference` | 후속 형식 선호. 최초 UI 연결은 별도 범위 (2026-10-19 제거) |
| API-14 | GET `/api/v2/me/article-bookmarks`; GET/PUT/DELETE `/api/v2/me/article-bookmarks/{article_id}` | 저장한 기사 목록·상태·저장·해제 (2026-10-20, 상단 요약 참고) |

신규 경로에 중복된 ‘북마크 조회용’ API를 또 만들지 않는다. 기존 북마크 문서와 여기의 API-04/05를 하나의 계약으로 확정한다. 위 경로명은 구현 제안이며 운영에 이미 있는 경로와 충돌하는지 등록 전에 확인한다.

## 4. 콘텐츠·추천 공통 객체

`ContentCard`: content_key(안정키), kind(publication/issue_letter), id(문자열), slug, title, summary, published_at, category_keys(정규 slug 배열), keywords(등록 용어 배열), formats(실제로 제공하는 포맷 배열), read_minutes(integer 또는 null), href(허용된 내부 정식 주소), availability(available/unavailable), saved(boolean), viewed(boolean), completed(boolean). 추천 요청의 kind=news는 publication, kind=letter는 issue_letter로 매핑한다. 이용 불가 항목은 title/summary/keywords 등 비공개 메타데이터를 반환하지 않고 key·availability·해제 가능한 식별값만 제공한다.

`Recommendation = ContentCard + reasons[]`. reason 필드:

| 필드 | 타입·규칙 |
|---|---|
| type | category / keyword / sentence / editor / latest |
| origin | selected / observed / saved_sentence / followed_editor / fallback |
| key | category/topic/editor/term 키. fallback은 null |
| text | 사실형 표시 문구. 화면에서 새 이모지 장식 추가하지 않음 |
| method | exact / semantic / editorial. 초기 버전은 exact·실제 editor 관계만 |
| evidence_count | 서로 다른 유효 관심 콘텐츠 수. 모르면 null |

‘열람한’과 ‘자주 열람한’은 표본 수로 구별한다. semantic method는 평가된 의미 모델 구현 전 반환하지 않는다. 이유에는 저장 문장 원문이나 다른 계정 자료를 넣지 않는다.

## 5. API-01 홈 집계

Query `minutes=0|5|10`(생략하면 계정 기본값). 홈 상한 뉴스 4·레터 3·문장 3. 전체 서랍을 이 API 한 번에 보내지 않는다. 정상은 200, 인증 실패 401, 전체 dependency 실패 503. 인증을 먼저 완료한 뒤 영역을 집계한다.

```json
{
  "schema_version":1,"scope":"account","generated_at":"2026-10-14T03:00:00Z",
  "preferences":{"status":"ready","data":{"revision":1,"interests":[{"type":"category","key":"industry","label":"산업","active":true}],"minutes":5},"error":null},
  "profile":{"status":"ready","data":{"window_days":90,"categories":[{"key":"industry","label":"산업","distinct_contents":2}],"keywords":[{"key":"semiconductor","label":"반도체","distinct_contents":2}],"sentence_terms":["반도체"],"coverage":{"legacy_unmatched":0}},"error":null},
  "news":{"status":"ready","data":{"items":[],"algorithm_version":"exact-v1","fallback":false},"error":null},
  "letters":{"status":"ready","data":{"items":[],"minutes_budget":5,"total_minutes":0},"error":null},
  "saved_letters":{"status":"ready","data":{"items":[],"total":0},"error":null},
  "recent_sentences":{"status":"ready","data":{"items":[],"total":0},"error":null},
  "followed_editors":{"status":"ready","data":{"items":[]},"error":null},
  "weekly_rewards":{"status":"unavailable","data":null,"error":null},
  "notifications":{"status":"unavailable","data":null,"error":null}
}
```

뉴스·레터 items는 4절의 객체이며 저장 항목은 availability를 포함한다. `profile.coverage`는 대상 기간과 기존 미해결 ID 수를 표시해 전체 이력을 분석했다고 오해하지 않게 한다. 첫 이용에서 분석 자료가 없으면 분야·키워드는 빈 배열이다. 리워드 미준비 상태를 0일로 반환하지 않는다.

## 6. API-02/03 설정·팔로우

GET preferences → `{revision,interests,minutes,updated_at}`. PUT body 예:

```json
{"revision":1,"interests":[{"type":"category","key":"industry"},{"type":"topic","key":"semiconductor"}],"minutes":5}
```

interests는 중복 제거 후 합계 0~40개, type=category/topic, key는 비어 있지 않은 64자 이하 문자열이다. category는 현재 9개 분류, topic은 사전 키다. minutes는 0/5/10. key를 이름의 불명확한 유사 일치로 다른 slug로 바꾸지 않는다. 기존 비활성 선택의 무변경 재송신은 유지하고 신규 비활성 추가는 400으로 거부한다. 저장 성공 200은 GET과 같은 형태이며 revision을 증가시킨다. revision 확인과 전체 교체는 같은 DB transaction에서 처리한다.

GET followed-editors → `{items:[{id,name,href,active}],total}`. PUT path의 editor_id는 현재 서버 에디터 사전 식별자로 정규화하고 존재·active 상태를 확인한다. 200 `{editor_id,following:true,updated_at}`, DELETE는 `{editor_id,following:false,updated_at}`. 이미 미팔로우 상태여도 DELETE는 200이다. 비활성 에디터는 목록에 상태를 반환하고 해제할 수 있다. 직접 관심의 PUT을 부수효과로 호출하지 않는다.

## 7. API-04/05 저장 레터·가져오기

GET bookmarks query는 limit/cursor, `read=all|unread`(기본 all), 선택 검색 `q`(trim 후 120자 이하)다. saved_at DESC/ID DESC keyset으로 조회한다. items는 `{letter_id,saved_at,version,content:ContentCard}`이며 total/next_cursor를 반환한다. unread는 현재 viewed=false로 정의하며 completed와 구분한다.

PUT path letter_id는 stable issue_letters ID이며 body는 없다. 공개·존재 확인 → 같은 owner/key에 UPSERT. 200 `{letter_id,saved:true,saved_at,version}`. 반복 저장이 saved_at을 임의 갱신하지 않게 한다. DELETE는 같은 형태로 saved=false를 반환한다. 비공개화한 저장 항목도 본인이 해제할 수 있다. UI의 로컬 200개를 서버 저장 상한으로 확정하지 말고 운영 한도를 별도로 결정한다.

POST import는 `Idempotency-Key` 필수(128자 이하)이며 인증된 owner에만 귀속한다. body 예:

```json
{
  "source":"browser-v1","confirmed":true,
  "saved_letter_slugs":["fixture-letter"],"followed_editor_ids":[],
  "interests":[{"type":"category","key":"industry"}],
  "legacy_read_letter_slugs":[]
}
```

목록 배열은 각각 최대 200개, interests는 40개다. legacy_read는 날짜 없는 약한 열람 정보로만 가져온다. `occurred_at:null,origin:legacy_import`로 구분하고 최근 90일 기간에 가짜 시각으로 포함하지 않는다. 완료·스탬프·알림 동의를 생성하지 않는다. 초기 기간 분석에서는 일자가 없는 기록을 제외하고 적용 범위를 안내한다.

200 `{import_id,replayed,accepted:{saved_letter_keys,editor_ids,interest_keys,legacy_view_keys},rejected:[{input,code}],imported_at}`. 먼저 전체 형식·사용자 확인·owner·상한을 검증한다. 존재하지 않는 개별 slug는 rejected에 남기고 유효 자료를 한 transaction으로 반영한다. 합쳐진 관심이 40개를 넘으면 전체 400으로 기존 관심을 유지한다. 빈 로컬 목록으로 서버 전체 목록을 삭제하지 않는다.

같은 owner/키/같은 payload의 재송신은 기존 가져오기 결과를 반환하고 다시 삽입하지 않는다. 같은 키에 다른 payload는 409다. 재송신 결과는 가져오기 이력이며 현재 saved 상태가 아니므로 프론트는 최신 목록을 재조회한다. 다른 기기에서 해제한 항목이 오래된 가져오기 재시도로 살아나면 안 된다. 서버 성공 확인 전 원본 localStorage를 삭제하지 않는다. 가져온 원본을 새 키로 자동 재수입하지 않도록 완료 식별값을 계정별로 관리한다.

## 8. API-06/07 추천·문장

GET recommendations query:

| 이름 | 규칙 |
|---|---|
| kind | news / letter, 필수 |
| reason | all / category / keyword / sentence, 기본 all. letter는 초기 all만 지원 |
| limit | news 기본4/최대20, letter 기본3/최대3 |
| minutes | letter만 0/5/10. 미지정 시 계정 설정. news에 지정하면400 |

200 `{items:[Recommendation],count,algorithm_version,generated_at,fallback,coverage}`. 이유 필터는 후보 선택 전에 적용한다. letter의 시간 상한은 묶음 전체 합계다. 실제 read_minutes를 모르는 항목은 5/10분 제한 묶음에서 제외하고 0분(여유롭게)에서만 길이 미확인 상태로 제공한다. 임의의 1분으로 예산을 계산하지 않는다. 공개 후보가 없으면 items=[]. news reason=all에만 자료 부족 시 최근 공개 후보를 반환할 수 있고 `fallback:true`와 latest 이유를 붙인다. `coverage`는 `{window_days,legacy_unmatched}`이며 분석 자료의 한계를 안내한다.

GET sentences query는 limit/cursor/q(본인 문장·원문 제목 검색). 200 `{items:[Sentence],count,total,next_cursor}`. Sentence는 기존 `id,text,article_id,article_title,article_published_at,created_at`에 `source:{content_key,href,availability}`를 추가한다. 이전 연결 불명 행은 source=null로 보존한다. 본문은 본인에게만 반환하고 추측 링크나 가짜 메타데이터를 만들지 않는다. 저장 본문은 편집자의 원문 변경으로 수정하지 않는다.

GET `/sentences/{id}/recommendations` query는 limit 기본3/최대3만 받는다. body의 문장 원문·owner를 받지 않는다. 200 `{sentence_id,items:[Recommendation],method:"exact",count}`. 소유권 확인 → 해당 문장만 분석 → 모든 저장 원문과 이미 읽은 뉴스 제외 → sentence 이유가 있는 후보만 반환. 단어 없음·일치 없음은 200 빈 배열, 존재하지 않음·타인·삭제 문장은404다. SQL 검색은 파라미터화하고 q의 LIKE wildcard는 문자 그대로 escape한다.

## 9. API-08 이용 세션·이벤트

POST sessions body `{content_key,format}`. 서버가 공개 상태·실제 제공 포맷·owner를 확인하고 201 `{session_id,content_key,format,started_at,rule_version,reward_evaluation_enabled}`를 반환한다. session_id는 서버 UUID다. 판정 규칙 미확정이면 reward_evaluation_enabled=false. 제공하지 않는 포맷은400, 비공개/없는 콘텐츠는404다.

POST events body(초기 단건, 필요하면 추후 batch 확장):

```json
{
  "event_id":"550e8400-e29b-41d4-a716-446655440001",
  "session_id":"550e8400-e29b-41d4-a716-446655440002",
  "session_seq":1,"event_type":"progress","client_occurred_at":"2026-10-14T03:00:15Z",
  "visible_ms":10000,"active_ms":8000,"scroll_ratio":0.4,
  "viewed_panel_ids":[],"consumed_ranges":[]
}
```

- event_type은 progress/ended, seq는 양의 정수다. visible_ms/active_ms는 세션의 누적 비음수 정수이고 scroll_ratio는 0~1이다. received_at은 서버가 생성한다.
- viewed_panel_ids는 실제 세션 콘텐츠의 컷 ID만 허용한다. 최대 실제 컷 수로 제한하고 컷별 유효 노출 기준을 적용한다.
- 미디어 consumed_ranges는 `[start_seconds,end_seconds]` 배열(최대100). 유한수·비음수·start<end·서버 미디어 길이 이내를 확인한다. 겹친 구간을 합쳐 실제 소비 시간을 세며 seek 위치나 ended 선언만으로 완료를 인정하지 않는다.
- 포맷에 맞지 않는 진행 필드는400이다. 서버 시간차보다 과도한 누적 증가, 역순 seq, 중복 event ID, 타계정 session, 만료 session을 검사한다.
- 같은 event 재송신은200으로 기존 결과를 반환한다. 같은 ID의 다른 payload는409. 클라이언트 시각을 보상 날짜로 사용하지 않는다. 최소 보고 간격5초·세션 만료24시간은 초기 제안이다.

200 `{event_id,accepted:true,duplicate:false,viewed:true,completed:false,reward:{status:"not_eligible",stamp_awarded:false},rule_version}`. reward status는 not_eligible/pending/awarded/already_awarded. 판정 부족 progress는 정상 수락하되 미완료다. DB 저장 실패는503이고 accepted=true를 반환하지 않는다. 완료는 서버 결과다. 브라우저 계측은 위조 불가능한 증거가 아니므로 서버 시간·실제 콘텐츠·중복·임계값을 검사하고 현금 보상으로 확대하지 않는다.

## 10. API-09 기간 기록·리워드

GET activity query `period=week|month|year`, `anchor=YYYY-MM-DD`(미지정 KST 오늘). timezone은 초기 Asia/Seoul 고정이다. 주는 anchor가 포함된 월~일, 월은 해당 월 전체, 년은 해당 연도 전체다. 유효 완료·스탬프 일자·분야별 서로 다른 콘텐츠 수를 기간 전체 SQL로 집계한다. 일부 최신 목록의 길이를 전체 기간 기록으로 반환하지 않는다.

```json
{"status":"ready","data":{"period":"week","start":"2026-10-12","end":"2026-10-18","timezone":"Asia/Seoul","coverage_start":"2026-10-14","completed_contents":0,"stamp_days":0,"days":[{"date":"2026-10-14","completed_contents":0,"stamped":false,"future":false,"covered":true}],"categories":[]},"error":null}
```

예시는 날짜 항목 한 개만 발췌했다. 실제 days는 기간 내 모든 날짜(주7/월28~31/연365~366)를 반환한다. 오늘 이후는 future=true, 수집 시작 이전은 covered=false로 구분한다. 기록 보존 범위를 벗어난 날짜를 정상 0건으로 단정하지 않는다. 년 응답에는 콘텐츠 본문을 포함하지 않는다. 저장 수·약한 열람을 completed에 섞지 않는다. 미래 anchor/비정상 연도는400, 권장 허용 범위는 수집 시작 연도~현재 연도다.

GET rewards query `week=YYYY-MM-DD`(해당 주 월요일, 생략 현재 주). 200 영역 wrapper의 data:
`{week_start,week_end,timezone,goal_days:3,stamp_days,stamps:[{date,awarded_at}],badges:[{id,title,rule_version,period_key,earned,earned_at,progress:{current,target}}]}`.

초기 badge ID는 steady_week/discovery_week/revisit_week 제안이다. 미준비는 status=unavailable, 구현 후 미달성은 earned=false, 조회 실패는 error다. 과거 획득 기록은 별도 목록 확장 시에도 보존하며 같은 주 동일 배지를 규칙 버전 변경으로 다시 지급하지 않는다. 화면 예시 자료를 API 응답에 섞지 않는다.

## 11. API-10/11 알림 설정·동의

GET notifications preferences: 200 `{revision,preferences,consent,delivery}`. PUT body:

```json
{"revision":0,"preferences":{"version":1,"briefing":false,"followups":false,"weekly":false,"frequency":"daily","time":"08:00","timezone":"Asia/Seoul","weeklyDay":1,"paused":false,"categorySource":true,"keywordSource":true,"sentenceSource":false}}
```

preferences는 현재 프론트의 camelCase와 맞춘다. boolean 필드는 모두 필수, version=1, frequency=daily/threeDays, time=HH:mm 08:00~20:59. timezone은 Asia/Seoul, America/New_York, Europe/London, UTC, weeklyDay는 정수0~6이다. briefing=true면 세 source 중 하나 이상 true여야 한다. 모든 유형이 false인 저장도 허용한다. PUT은 동의·구독·발송을 생성하지 않는다. 200은 GET과 같은 형태로 revision을 올리고409에서는 프론트의 선택을 유지한다.

PUT consent body `{channel:"web_push",granted:true,policy_version:"policy-fixture-v1"}` 또는 granted=false. 별도 사용자 행동으로 요청해야 한다. 서버가 현재 정책 버전을 확인하고 agreed_at/revoked_at을 서버 시각으로 기록한다. 기기 권한 허용을 계정 수신 동의로 자동 승격하지 않는다. 200 `{channel,granted,policy_version,agreed_at,revoked_at}`. 철회하면 대기 작업 취소와 전송 직전 차단을 적용한다. 동의 필요 버전 변경은 재동의 상태로 분리한다.

`delivery = {supported:boolean,status:"disabled|blocked|ready|paused|unavailable",blocked_reasons:[],active_subscriptions:0,last_sent_at:null}`. blocked_reasons는 no_types/no_consent/no_subscription/permission_denied/provider_unavailable/policy_pending이다. ready는 발송 가능한 조건이지 전송 완료가 아니다. 권한은 기기별 관찰값이며 서버 계정 동의와 구분한다.

## 12. API-12 Web Push 구독

POST body `{subscription:{endpoint,expirationTime,keys:{p256dh,auth}},permission:"granted"}`. HTTPS endpoint·허용 발송 제공자 정책을 검증하고 keys의 base64url 형식과 크기를 제한한다. 요청64KiB 안에서 endpoint2048자·각key512자는 초기 상한 제안이다. 임의 endpoint에 HTTP fetch해 검증하는 방식은 사용하지 않는다.

서버가 구독 ID를 발행하고 현재 owner에 귀속한다. endpoint_hash는 UNIQUE. 같은 기기의 endpoint가 다른 계정으로 전환되면 이전 귀속을 transaction으로 해제하고 현재 계정으로 갱신한다. 신규201 `{id,active:true,created_at}`, 기존 갱신200. 동의가 없으면 활성 전송 구독으로 등록하지 않고400 NO_CONSENT를 반환한다. endpoint·키는 일반 응답 목록·로그·dashboard에 노출하지 않는다.

DELETE path ID는 본인 확인 후200 `{id,active:false}`, 타인/없는 ID는404. 프론트에서 로그아웃 전에 현재 기기 구독 해제를 호출하고 provider410·동의 철회에 따른 비활성화도 구현한다. signOut만으로 서버 구독이 해제됐다고 가정하지 않는다. 전송 직전 동의·현재 귀속·pause를 재확인한다.

service worker·VAPID 공개키 설정 조회는 프론트 담당과 별도로 확정한다(현재 실제 구독 연결 미구현). private key는 서버 비밀 저장소에만 둔다. 공개 설정 조회 API를 추가한다면 조회 자체를 동의나 기기 식별자 전송과 결합하지 않는다.

## 13. API-13 4가지 시선 선호 — 후속

GET query window_days 초기30 고정. 200 `{status:"insufficient_data|ready",algorithm_version,window_days,qualified_sessions,preferred_format:null,distribution:[{format,sessions,share}]}`. 표본 부족이면 preferred_format=null이며 임의 대표 포맷을 선택하지 않는다. 유효 이용 세션 측정과 최소 표본 정책 확정 후 구현한다. 현재 대시보드에 이 선호 UI가 있다고 문서화하지 않는다.

## 14. 서버 전용 내부 operation

제안 prefix는 `/internal/dashboard/*`다. 모든 요청은 기존 X-Internal-Token 가드로 검증한 서비스만 접근하고 브라우저 직접 호출은 금지한다. Lambda가 JWT에서 검증한 owner를 전달한다. DB 쪽은 조건부 갱신·원자 저장·조회를 담당하며 같은 규칙을 서로 다른 모듈에서 다시 판정하지 않는다.

| 내부 경로 그룹 제안 | DB 작업 |
|---|---|
| `/snapshot`, `/content/resolve`, `/content/candidates` | 계정 자료·실제 콘텐츠 일괄 조회, ID 매핑 |
| `/preferences`, `/followed-editors`, `/bookmarks`, `/imports` | revision/unique/멱등 CRUD와 가져오기 |
| `/activity/sessions`, `/activity/events`, `/activity/complete` | 세션 소유권·seq·조건부 진행 갱신. complete는 검증 결과 원자 저장 |
| `/activity/summary`, `/rewards` | 기간 전체 SQL 집계·완료/스탬프/배지 원장 |
| `/notifications/preferences`, `/notifications/consent`, `/push-subscriptions`, `/deliveries` | 설정·동의·구독·발송 작업 원장 |

각 operation의 세부 method/payload는 공개 API와 repo의 transaction 경계를 맞춰 구현하며 내부 owner 필드만 추가한다. 공개 사용자 입력을 검증하지 않은 채 전달하지 않는다. internal snapshot이 곧 공개 dashboard 응답은 아니며 토큰·구독 키 같은 비공개 필드는 공개 shaping에서 제외한다.

내부 HTTP 한 번을 transaction 경계로 한다. completion/stamp/badge를 세 번의 독립 요청으로 나누지 않는다. 현재 get_cursor 호출마다 각각 commit하므로 복합 작업은 같은 cursor를 공유하는 함수로 작성한다. 내부 token만으로 공개 `/me`를 프론트에 개방하지 않는다.

## 15. 프론트 어댑터와 연결 완료 조건

- API-01/06을 [MyLensPage](../../service/frontend/src/widgets/MyLensPage/MyLensPage.tsx)·news/usePersonalNews·useDashboardLetters에 연결한다. 기존 점수 함수를 서버 순위 위에 다시 적용하지 않는다.
- API-02/03을 useInterests/useFollowedEditors에 연결한다. 직접 선택과 팔로우의 owner·revision을 분리하고 공개 사전은 재사용한다.
- API-04/05를 useLetterShelf 및 목록·상세·대시보드 저장 버튼에 함께 연결한다. 동기 toggle 반환을 비동기 상태로 바꾸고 중복 클릭·해제 실패·계정 전환을 처리한다.
- API-07을 useDashboardArchive/DrawerPanel에 연결한다. 서버 total/cursor/href를 사용하고 삭제한 문장 ID 딥링크는 안내한다.
- API-08을 활성 포맷과 실제 플레이어·웹툰·읽기 계측에 연결한다. 기존 로컬10초 신호·70% 열람 표시와 보상 판정을 구분한다.
- API-09로 ReadingPeriodView/WeeklyStampSummary/ReadingRewards의 예시와 실제 기록을 분리한다. 클라이언트에서 임의 스탬프를 생성하지 않는다.
- API-10~12로 NotificationSettings의 초안·서버 저장·동의·권한·실제 수신 가능 상태를 분리한다. 기존 이메일 구독은 유지한다.
- 401에서 계정 개인 자료를 비우고 기존 로그인 복귀 흐름으로 안내한다. authFetch가 토큰을 붙인다는 것만으로 모든401을 자동 처리한다고 가정하지 않는다.

배포·실제 로그인·DB·발송 인수는 인수인계7절과 데이터 설계의 검증 순서를 따른다. 이번 문서 작성에서 실제 서버 호출·저장·발송은 실행하지 않았다.
