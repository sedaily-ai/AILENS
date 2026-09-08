# 2026-09-08 PostgreSQL 스키마 개념·논리·물리 단계별 설계 검토

작성: Claude Code
관련: `docs/architecture/lens-erd-src/`, `docs/architecture/lens-postgres-erd.html`

## 배경

09/01에 다른 팀원(minyoung0303)이 `lens_schema.sql`(2026-08-26 정의서) 기반
PostgreSQL ERD 문서(`lens-erd-src/` Mermaid 소스 14개 + 렌더 HTML)를 커밋했다.
DynamoDB→PostgreSQL 이관을 검토하는 초안이고, 작성자 본인이 두 가지 미해결
설계 이슈(웹툰 시리즈 엔터티 부재, `ai_usage_logs` 배타 CHECK와 탈퇴 정책
충돌)를 커밋 메시지에 남겨뒀다. 사용자가 "정석 교과서 방식대로 단계별로"
이 설계를 검토·정리해달라고 요청.

## 한 것

1. **개념 설계 검증**: `00-map.mmd` + 도메인별 12개 파일을 전부 읽고 엔터티·관계
   누락 여부 확인. 큰 누락은 없음(50 테이블 + 뷰 1, 12 도메인).
2. **실제 접근 패턴 조사** (Explore 서브에이전트): `service/backend/clients/`,
   `admin/backend/repo/` 코드와 2026-09-07 채널 GSI 이관 worklog를 근거로,
   지금 DynamoDB가 실제로 어떤 쿼리를 어떤 인덱스로 처리하는지 조사. 핵심
   발견: (a) 목록 조회는 거의 전부 "단일 값 이퀄리티 + 날짜 범위 정렬" 패턴
   (b) "전체 스캔 후 애플리케이션 필터링"이 병목의 근원으로 최소 3곳에서
   반복 (c) 텍스트 검색이 `Attr.contains()` 순차 매치로 진짜 인덱스가 아님
   (d) 조회수 갱신이 비원자적 read-modify-write (e) 챗봇 컨텍스트가 요청당
   같은 인덱스를 최대 3회 호출.
3. **논리 설계 이슈 2건 해결**:
   - `06-users.mmd`: `deleted_at` 컬럼 추가, 삭제 정책을 "탈퇴=즉시 소프트
     삭제, 하드 삭제는 별도 배치"로 명문화.
   - `11-pipeline.mmd`: `ai_usage_logs`의 배타적 FK(rendition_id/message_id/
     candidate_id)를 폐기하고 `subject_type + subject_id`(비FK) 패턴으로 교체.
   - `99-full.mmd`에 위 변경 반영 주석 추가.
4. **논리 설계 이슈 1건 보류 결정**: `04-publications.mmd`에 `webtoon_series`
   엔터티를 지금 추가하지 않기로 하고, 승격 트리거 조건을 주석으로 명시.
5. **물리 설계 신규 작성**: `13-physical-design.md` — 도메인별 인덱스 계획표
   (실제 DynamoDB GSI 패턴 근거), 파티셔닝 후보(`ai_usage_logs` 월별 range
   partition), 페이지네이션 원칙(keyset, `limit=1000` 제거).
6. `lens-erd-src/README.md` 신설(3단계 방법론·상태·결정 요약), 상위
   `docs/architecture/README.md`의 "지금 있는 것" 표에 `lens-erd-src` 항목 추가
   (기존에 누락돼 있었음).
7. AI로 DB 스키마 작업할 때 지켜야 할 규칙 웹 리서치 — 트랜잭션·타임아웃
   명시, 프로덕션 규모 데이터로 사전 검증, 인덱스 `CONCURRENTLY` 생성,
   실제 테스트된 롤백 경로, 인증/결제/PII/인프라 변경은 사람 승인 필수.

## 결정

- **탈퇴 정책 = 소프트 삭제 우선**: 지금 `users.status`에 이미 `withdrawn`
  값이 있어 소프트 삭제를 전제로 설계된 것으로 보이는데, 하위 테이블들의
  CASCADE는 하드 삭제를 전제로 하고 있어 앞뒤가 안 맞았다. 소프트 삭제로
  통일하고 CASCADE는 "하드 삭제 배치 실행 시에만 발동"으로 재정의했다.
  정확한 보존기간(30일? 즉시?)과 PII 익명화 범위는 법무 확인이 필요해서
  결정하지 않고 남겨뒀다 — 이건 기술 문제가 아니라 정책 문제라 임의로
  정하지 않았다.
- **`ai_usage_logs` 배타 FK 폐기, subject_type+subject_id로 교체**: 서브타입
  테이블 분리(`ai_usage_generation`/`ai_usage_chat`/`ai_usage_scoring`)도
  검토했지만, 비용 집계 리포트가 여러 테이블 UNION 없이 단일 테이블
  GROUP BY로 되는 이점이 커서 버렸다. 대신 `chat_quota_usage`가 이미 쓰고
  있는 "FK 포기 + 앱이 참조무결성 보장" 패턴으로 통일 — 원장(ledger) 성격
  테이블은 원본 삭제와 독립적으로 보존돼야 한다는 게 핵심 근거.
- **`webtoon_series` 승격 보류**: 정석대로면 약한 엔터티를 미리 테이블로
  승격하는 게 맞지만, 지금 시리즈가 1개뿐이고 복수 시리즈 계획의 근거가
  코드·커밋 이력 어디에도 없어서 지금 만들면 과설계(YAGNI 위반)로 판단.
  대신 트리거 조건(시리즈 2개 이상)을 문서에 박아둬서 나중에 놓치지 않게 함.

## 다음

- **원본 정의서(`lens_schema.sql`, 2026-08-26) 위치 확인 및 대조** — 이 레포엔
  없음(Notion 등 외부 추정). 이걸 찾아서 ERD 전체의 "추정" 표시 40여 곳을
  하나씩 확정으로 바꿔야 지금 설계를 "완료"로 부를 수 있다.
- `lens-postgres-erd.html`은 이번 `.mmd` 변경분을 반영하지 못했다 — 로컬에
  mermaid-cli(`mmdc`)가 없어서 재렌더를 못 했다. 재렌더할 도구/환경을
  정하고 다시 생성해야 함.
- 회원 탈퇴 보존기간·PII 익명화 범위는 법무/정책 확인 필요 — 확인 후
  `06-users.mmd` 주석과 실제 하드 삭제 배치 설계에 반영.
- `publications`/`articles` 파티셔닝은 실측(증가 속도) 후 결정하기로 보류.
- 다음 단계로 실제 마이그레이션 스크립트(DDL)를 짤 거라면, 이번에 리서치한
  AI 작업 규칙(트랜잭션/타임아웃 명시, 프로덕션 규모 사전 검증, 인덱스
  CONCURRENTLY, 실제 롤백 테스트, 사람 승인 없이 프로덕션 반영 금지)을
  체크리스트로 먼저 문서화해두는 걸 권장.

---

## 후속 — 원본 정의서 확보 후 전체 대조 (같은 날 오후)

### 배경

사용자가 "lens_schema.sql 정의서부터 찾아서 대조해보시죠"라고 요청. 로컬
파일시스템을 검색해 `~/Downloads/lens_디비.sql`(2026-08-26 작성, 실제 DDL —
"추정" 없는 완성본)을 찾았다. 검색 중 `~/Downloads/en_sedaily_PostgreSQL_
스키마_정의서.html`도 발견했는데, 이건 **AI LENS가 아니라 en.sedaily.com
(AILINK/globe 프로젝트, 영문 뉴스 번역 사이트) 정의서**였다 — 테이블 구성
(translation_runs, article_companies, PRISM 플래그 등)이 완전히 다른
서비스였다. 파일명이 비슷해 혼동하기 쉬우니 기록해둔다.

### 한 것

1. 원본 SQL 전체(896줄, 50테이블)를 읽고 `.mmd` 12개 파일 전부와 1:1 대조.
2. **오전 세션에서 제가 만든 오류 2건을 원복**:
   - `11-pipeline.mmd`의 `ai_usage_logs` — `subject_type+subject_id`로
     바꿨던 걸 원본 그대로(`rendition_id`/`message_id`/`candidate_id`,
     FK 없음, CHECK만)로 되돌림. 원본은 애초에 FK를 안 걸어서 이 문제가
     없었는데, 없는 문제를 고친 것이었다.
   - `06-users.mmd`의 `deleted_at` 컬럼 — 원본에 없어서 제거. 삭제 정책은
     "미확정"으로 정확하게 기록(원본에도 정의 안 돼 있음을 확인했으므로).
3. **원본 대비 실제로 틀렸던 부분 다수 수정** (전부 이전 팀원의 "추정" 작업
   중 발생한 오류, 제 오전 작업과 무관):
   - `03-articles.mmd`: `article_images.url`(image_url 아님)
   - `04-publications.mmd`: `publication_revisions.change_type`/`changed_at`
     (change_summary/revised_at으로 잘못 추측돼 있었음), `renditions.attempts`
     타입(INTEGER→SMALLINT), `renditions.created_at/updated_at` 누락 보강
   - `06-users.mmd`: `name` VARCHAR(64)→(128), `user_identities.provider`
     VARCHAR(32)→(16), `provider_uid` VARCHAR(128)→(255)
   - `07-archive.mmd`: `sentence_stats.rendition_id` 컬럼 통째 누락 → 추가,
     `recommendations`가 복합 PK로 잘못 설계돼 있었음(실제는 surrogate
     `id` PK, user_id+article_no는 그냥 인덱스라 재계산마다 행이 누적되는
     구조) → 수정, `user_readings.read_count` 누락 → 추가
   - `09-chat.mmd`: `chat_messages.position`(정렬용) 누락 → 추가,
     `chat_quota_usage`가 `used_count` 1개로 잘못 단순화(실제는
     `message_count`+`token_count` 2개) → 수정
   - `10-newsletter.mmd`: `newsletter_sends.publication_id`/`send_date`
     통째 누락 → 추가, 존재하지 않는 컬럼 `sent_at` 삭제하고 실제
     `started_at`/`finished_at`으로 교체, `newsletter_send_items.result`
     컬럼 누락 → 추가, `delivered_at`은 실제 컬럼명 `sent_at`으로 정정
   - `11-pipeline.mmd`: `prompts`가 완전히 다른 구조(`key`+`description`)로
     잘못 추측돼 있었음 → 실제 구조(`id`+`name`+`category`)로 전면 수정,
     `prompt_versions.created_by` 누락 → 추가, `prompt_versions.prompt_id`
     타입 오류(VARCHAR(64)→SMALLINT), `feature_flags` PK명 오류(key→name),
     `audit_logs`가 범용 감사로그(actor/action/target)로 완전히 잘못
     추측돼 있었음 → 실제는 feature_flags 변경이력(flag_name/before_value/
     after_value)으로 전면 수정, `incidents` PK 타입 오류(BIGSERIAL→
     VARCHAR(64)) + `mechanism`/`severity`/`detail` 컬럼 누락 → 추가
   - `05-extras.mmd`: `rendition_terms.position` 누락 → 추가,
     `glossary_terms.is_active`/`created_at` 누락 → 추가
   - `08-views.mmd`: `view_counts.updated_at` 누락 → 추가
   - `99-full.mmd`: 위 변경에 맞춰 관계선 보강(newsletter_sends↔publications,
     feature_flags↔audit_logs), ai_usage_logs 관련 주석 정정
4. **`13-physical-design.md` 전면 재작성** — 어제 작성한 건 DynamoDB
   접근 패턴에서 "추측"한 인덱스 계획이었는데, 원본 SQL에 인덱스·파티셔닝이
   이미 전부 정의돼 있었다. 그 실제 정의를 옮기고, DynamoDB 실사용 패턴은
   "검증"(실제 인덱스가 실사용 패턴을 커버하는지 대조) 용도로 재배치.
5. **원본 SQL을 레포에 영구 보관** — `lens_schema_2026-08-26.sql`로 복사해
   `lens-erd-src/` 안에 커밋. 그동안 `~/Downloads/`에만 있어서 지워질 위험이
   있었다.
6. `lens-erd-src/README.md`를 대조 완료 상태로 갱신 — 원본 SQL 위치, 오늘
   바로잡은 것 목록, 원본에도 없어서 진짜 미해결로 남는 것(삭제 정책,
   파티션 운영, 한국어 검색 설정, view_counts 권한 분리) 구분해서 기록.

### 결정

- **오전에 만든 두 "논리 설계 결정"은 전부 철회**. 진짜 원본이 나온 이상
  추측 기반 결정은 의미가 없다 — 원본을 그대로 따르는 게 맞다.
- **탈퇴 정책은 "미확정"으로 명시적으로 남긴다** — 컬럼을 지어내서 해결된
  것처럼 보이게 하지 않는다. 원본 작성자도 안 정한 걸 제가 임의로 정하면
  나중에 실제 정책과 또 어긋난다.
- **원본 SQL을 레포에 커밋해서 단일 진실 공급원으로 고정** — Downloads
  폴더에만 있으면 이번처럼(다른 프로젝트 파일과 이름이 비슷해 헷갈리는
  것 포함) 또 유실·혼동될 수 있다.

### 다음

- `lens-postgres-erd.html` 재렌더는 여전히 미해결(mermaid-cli 없음).
- 탈퇴 정책·파티션 운영·한국어 검색 설정·view_counts 권한 분리 4가지는
  원본에도 없는 진짜 미해결 항목 — 다음 단계는 이 4가지에 대한 결정이다.
- 이번 세션에서 "추정"을 확정으로 바꾸는 과정에서 오류가 이 정도로 많이
  나온 걸 보면, 향후 이런 정의서 대조 작업은 원본을 먼저 확보한 뒤 시작하는
  게 맞다 — 원본 없이 ERD부터 그리면 이번처럼 재작업이 필요해진다.

---

## 후속 2 — 원본에 조건부로 남아있던 기술 결정 3건 확정 (같은 날)

### 배경

교과서적 6단계(요구사항분석/개념/논리/물리/구현/운영) 기준으로 지금 어디까지
왔는지 사용자가 물어서 단계별 표로 답했다. 3~4단계(논리·물리 설계)는
원본 대조까지 끝났지만, 원본에도 조건부로만 남아있던 미해결 4가지(탈퇴
정책, 파티션 운영, 한국어 검색 설정, view_counts 권한분리) 때문에 "설계
확정"이라 부르기엔 일렀다. 사용자가 이 중 기술 결정 3개(법무 판단 필요한
탈퇴 정책 제외)부터 먼저 정리해달라고 요청.

### 한 것

1. pg_bigm/pg_partman의 Amazon Aurora/RDS PostgreSQL 16 지원 여부를
   웹 검색으로 확인 — 둘 다 AWS 공식 지원 확장으로 확인됨(원본 SQL 주석은
   "가능한지 확인 후" 조건부로 남겨뒀던 부분).
2. `14-operations.md` 신규 작성 — 원본 DDL(`lens_schema_2026-08-26.sql`)은
   "기준 파일"로 그대로 두고, 그 이후 추가 결정을 별도 파일에 담음:
   - 한국어 검색: pg_bigm 채택, search_vector 컬럼 제거 + gin_bigm_ops
     인덱스로 교체하는 구체 SQL, 가중 랭킹은 애플리케이션 책임으로 이관
     된다는 점 명시
   - 파티션 자동화: pg_partman `create_parent()`/`run_maintenance_proc()`
     설정, RDS에서 bgw 대신 기존 EventBridge 스케줄 패턴 재사용
   - view_counts 권한분리: 이 레포의 실제 구조(service/backend, admin/backend
     두 백엔드)에 맞춰 역할 3개(service/admin/batch) + 컬럼 단위 GRANT로 구체화
3. `13-physical-design.md`·`README.md`의 "미해결" 절을 갱신 — 3건은 완료로
   옮기고 남은 미해결은 탈퇴 정책 1건만 남김.
4. 사용자가 "50개 테이블이 많은 거 아니냐"고 질문 — 12개 도메인에 고르게
   분산돼 있고(도메인당 평균 4~5개), God 테이블 없이 정션/이력 테이블이
   제대로 분리돼 있다는 점, 이관 전 DynamoDB가 오히려 반대(단일 테이블에
   19종 item_type 욱여넣음)였다는 점을 근거로 "이 범위 서비스 기준 정상"
   이라고 답함. 문서 변경은 없음, 대화로만 답변.

### 결정

- **한국어 검색은 pg_bigm, pg_trgm은 유지**: 목적이 다르다(bigm=전문검색,
  trgm=오타 대응 유사검색) — 하나를 버리고 다른 하나로 대체하는 게 아니라
  둘 다 필요.
- **파티션 자동화는 pg_partman + 기존 EventBridge 패턴**: pg_partman
  bgw(백그라운드 워커)는 RDS 파라미터 그룹 변경+재부팅이 필요해 운영
  부담이 커서 배제, 대신 이미 쓰고 있는 스케줄 패턴을 재사용.
- **ai_usage_logs 파티션은 보존기간 미설정(무기한)**: view_events는 원본에
  "90일 후 삭제"가 명시돼 있지만 ai_usage_logs(비용/정산 원장)는 원본에
  보존기간 언급이 없어서, 임의로 삭제 정책을 만들지 않고 무기한으로 둠 —
  필요해지면 별도 결정.

### 다음

- 남은 미해결은 회원 탈퇴 삭제 정책 1건 — 법무/정책 확인 후 진행.
- 그 다음이 5단계(구현): 실제 RDS/Aurora 인스턴스 프로비저닝, 원본 DDL +
  `14-operations.md`의 SQL을 순서대로 실행하는 마이그레이션 스크립트 작성,
  프로덕션 규모 데이터로 사전 검증 — 아직 시작 전.
- `lens-postgres-erd.html` 재렌더는 여전히 미해결(mermaid-cli 없음).
