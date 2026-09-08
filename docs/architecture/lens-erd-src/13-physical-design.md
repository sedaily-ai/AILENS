# 13 · 물리 설계 — 인덱스 · 파티셔닝

갱신: 2026-09-08

00~12는 개념·논리 설계(엔터티·관계·정규화·제약)만 다룬다. 이 문서는 그 위에
얹는 물리 설계 — "실제로 어떻게 저장·조회되는가"다. 추측이 아니라 지금
DynamoDB 위에서 실제로 도는 쿼리 패턴(코드 근거: `service/backend/clients/`,
`admin/backend/repo/`, 2026-09-07 채널 GSI 이관 사고)을 근거로 삼는다. 경위·조사
전체는 `docs/worklog/2026-09/2026-09-08-postgres-schema-단계별-설계.md` 참조.

## 원칙

1. **인덱스는 실제 쿼리 조건을 보고 만든다, 추측하지 않는다.** 지금 DynamoDB
   GSI(해시키+정렬키)가 이미 검증된 접근 패턴이므로, 그 조합을 그대로
   Postgres 복합 인덱스로 옮기는 게 1순위다.
2. **"전체 스캔 후 애플리케이션 필터링"은 이관 시점에 반드시 없앤다.**
   DynamoDB에서 이 패턴이 최소 3곳(레거시 채널 목록, admin 상태-미지정
   목록, slug 중복검사)에서 병목이었다. 그대로 옮기면 Postgres에서도
   똑같이 느려진다 — WHERE 절/인덱스로 흡수해야 한다.
3. **목록 API는 기본이 keyset pagination이다.** `limit=1000` 같은 대량 조회가
   지금도 남아있고, 프론트가 SSR 데이터를 받고도 마운트 시 같은 목록을
   재요청하는 전역 패턴이 있어 실질 조회 빈도가 배가된다. 물리 설계
   단계에서 페이지네이션을 옵션이 아니라 기본값으로 넣는다.

## 도메인별 인덱스 계획

| 테이블 | 인덱스 | 근거 (실제 쿼리) |
|---|---|---|
| `publications` | `(section_id, published_at DESC)`, `(category_id, published_at DESC)`, UNIQUE `(slug)`, UNIQUE `(source_url)` | `category-published_at-index` GSI로 검색/브리핑/챗봇 컨텍스트가 카테고리+기간 Query — `search_service.py:230`, `chatbot_context_service.py:112,176,199` |
| `publications` | GIN `(search_vector)` | 지금 `Attr(...).contains()` 부분일치 필터(title_ko/content_ko/keywords/hashtags)를 대체 — 순차 매치라 이관 1순위 |
| `publications` (channel 개념이 있다면 status/channel 스칼라) | `(status, published_at DESC)` | admin 목록·CMS 레거시 목록이 쓰던 `status-publish_date-index` — status 지정 시엔 여전히 이 패턴이 유효 |
| `media_assets` | GIN `(search_vector)` | transcript(대본/자막)가 검색 대상 포함으로 명시돼 있음 |
| `renditions` | UNIQUE `(publication_id, format)`, 부분 UNIQUE `(sequence_no) WHERE format='webtoon'` | 이미 논리 설계에 명시된 제약, 물리적으로 인덱스로 구현 |
| `newsletters`/`newsletter_sends` | `(newsletter_id, sent_at DESC)` | `letter_date-index` GSI 패턴 — daily_letters_ddb_client, letters_repo.py |
| `chat_message_sources` | `(message_id, footnote_no)`, `(publication_id)` | 챗봇 컨텍스트가 대화당 최대 3회 같은 인덱스 호출 — 조인/배치로 합칠 여지 있으므로 publication_id 인덱스도 필요 |
| `view_counts` | PK `(publication_id)`, `count` 컬럼은 원자적 `UPDATE ... SET count = count + 1` 대상 | 지금 DynamoDB는 get→+1→put(비원자적 RMW) — `personal_repository.py:261-277`. Postgres 이관 시 반드시 원자 연산으로 교체 |
| `articles` | UNIQUE `(article_no)`(PK), `(section_id, published_at DESC)` | article 목록·수집 파이프라인 조회 패턴 |
| `ai_usage_logs` | `(occurred_at)` range partition(월별) + PK `(id, occurred_at)`, `(subject_type, subject_id)` 보조 인덱스 | 파티션 키는 PK에 포함돼야 함(Postgres 네이티브 파티셔닝 제약). subject_type/subject_id는 논리 설계 결정(11-pipeline.mmd)에 따른 비FK 참조용 인덱스 |
| `user_archives` | `(user_id, saved_at DESC)`, UNIQUE `(user_id, sentence_hash)` | Personal 테이블의 PK=user_id/SK=sk 단일 테이블 설계와 동일한 접근 패턴(`personal_db_client.py:120`) |

## 파티셔닝 후보

- **`ai_usage_logs`**: `occurred_at` 기준 월별 range partition. 이미 로그 볼륨이 크고
  (모든 AI 호출마다 적재) 조회도 대부분 최근 구간 위주라 파티션 프루닝 효과가 큼.
- **`publications`/`articles`**: 채널별 발행량이 계속 누적되는 채널(하루 최대
  96건 규모, 2026-09-07 worklog 기준)이 있어 `published_at` 월별 파티션을
  검토할 만하다. 단, 지금 규모(수천 건)에서 즉시 필요한 건 아니고, 인덱스만으로도
  당분간 충분할 가능성이 높다 — 실측 후 결정(과설계 방지).

## 응답 페이로드 · 페이지네이션

- 목록 API는 본문/패널/자막 등 무거운 필드를 SELECT에서 제외한 shaper를
  기본으로 둔다 — webtoon 목록 페이로드가 shaper 적용으로 3.2MB→604KB로
  줄어든 전례가 이미 이 방향이 맞다는 걸 증명했다.
- `limit=1000` 같은 무제한에 가까운 조회를 허용하지 않는다. keyset pagination
  (예: `WHERE (published_at, id) < (:last_published_at, :last_id) ORDER BY
  published_at DESC, id DESC LIMIT :n`)을 기본값으로.

## 미해결 · 확인 필요

- 원본 정의서(`lens_schema.sql`, 2026-08-26)와 대조 전이라 위 인덱스 계획은
  "실제 접근 패턴 기준 초안"이다. 컬럼명·테이블명이 정의서와 다를 수 있음.
- `publications`/`articles` 파티셔닝은 실제 테이블 증가 속도를 봐야 확정 가능 —
  지금은 후보로만 남긴다.
