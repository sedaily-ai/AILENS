# lens-erd-src — PostgreSQL 스키마 설계 소스

DynamoDB에서 PostgreSQL로의 이관을 검토하며 만드는 스키마 설계 소스. 아직
프로덕션에 반영된 스키마가 아니다 — `docs/architecture`의 다른 문서와 달리
"지금 시스템"이 아니라 "이관 대상으로 검토 중인 설계"를 담는다. 렌더 결과물은
`../lens-postgres-erd.html`(2026-09-08 변경분 미반영 — 재렌더 필요, 아래 참조).

## 원본

**`lens_schema_2026-08-26.sql`** — 2026-08-26 작성된 실제 DDL(50테이블·뷰1·
확장3: `pg_trgm`, `btree_gin`, `vector`). 이 폴더의 `.mmd` 파일들은 전부 이
SQL을 옮긴 것이다 — 뭔가 다르면 이 SQL이 맞고 `.mmd`가 틀린 것이다.

## 설계는 세 단계로 나눠 진행한다

교과서적 DB 설계 순서(개념 → 논리 → 물리)를 그대로 따른다.

| 단계 | 다루는 것 | 소스 | 상태 |
|---|---|---|---|
| **개념 설계** | 엔터티·관계만 | `00-map.mmd` + `01-12` | 완료 — 50테이블·12도메인, 원본과 개수·구성 일치 확인 |
| **논리 설계** | 정규화, PK/FK, CHECK 제약 | `01-12` + `99-full.mmd` | **완료 — 원본 SQL과 전체 대조 완료(2026-09-08)** |
| **물리 설계** | 인덱스, 파티셔닝 | `13-physical-design.md` | 완료 — 원본에 이미 정의된 인덱스·파티션을 옮기고 실제 DynamoDB 접근 패턴과 대조 검증 |

**경위(왜 이렇게 정했는가, 세션 중 있었던 오류와 정정 과정)는 이 폴더가
아니라 worklog에 있다** — `docs/worklog/2026-09/2026-09-08-postgres-schema-
단계별-설계.md`.

## 2026-09-08 전체 대조에서 바로잡은 것

원본 SQL(`lens_schema_2026-08-26.sql`)을 확보하기 전까지 `.mmd` 파일들은
"추정"이 40여 곳 남은 초안이었다. 확보 후 전체 대조 결과:

- **"추정" 태그 대부분은 실제로 맞는 값이었다** — 태그만 제거.
- **컬럼명·타입이 실제로 틀린 곳이 다수 발견돼 수정함**: `article_images.url`
  (image_url 아님), `publication_revisions.change_type`/`changed_at`
  (change_summary/revised_at 아님), `newsletter_sends.publication_id`+
  `send_date`(누락돼 있었음), `chat_messages.position`(누락), `chat_quota_usage`
  가 `message_count`+`token_count` 두 컬럼인데 `used_count` 하나로 잘못 단순화,
  `recommendations`가 복합 PK가 아니라 surrogate `id` PK, `prompts`/`audit_logs`
  가 완전히 다른 구조로 잘못 추측돼 있었음(`audit_logs`는 범용 감사로그가
  아니라 feature_flags 변경이력).
- **세션 초반에 제가 직접 만든 오류 2건도 이 대조 과정에서 발견해 원복함**:
  `ai_usage_logs`를 배타 FK 문제가 있다고 잘못 판단해 `subject_type+subject_id`
  로 구조를 바꿨었는데, 원본은 애초에 FK 없이 CHECK만으로 이미 해결돼 있었음.
  `users.deleted_at`을 임의로 추가했었는데 원본엔 없음(탈퇴 정책은 원본에도
  미정 — 아래 미해결 참조).

## 미해결 · 원본에도 없는 것

- **회원 탈퇴 시 삭제 정책** — `users.status='withdrawn'`만 있고 소프트/하드
  삭제, 보존기간, PII 처리 범위가 원본 SQL에도 정의돼 있지 않다. 하위
  테이블은 전부 `ON DELETE CASCADE`(행 삭제 전제)라 실제 삭제 시점·방식은
  운영 정책으로 별도 결정해야 한다.
- **월별 파티션 운영** — `view_events`, `ai_usage_logs`는 2026-09/10 파티션만
  만들어져 있다. 11월 이후 파티션을 누가 언제 미리 만드는지 배치/크론이 없다.
- **한국어 전문검색 설정** — `search_vector`가 전부 `'simple'`(형태소 미분리)
  설정. RDS `pg_bigm` 가용 여부 확인 후 교체 여부 결정 필요(스키마 구조는
  안 바뀜, 원본 주석에 명시돼 있음).
- **`view_counts.real_count` 갱신 권한 분리** — 애플리케이션 계정은 못 고치고
  배치 계정만 갱신하게 하는 REVOKE/GRANT가 원본에 메모로만 있고 미실행.
- `lens-postgres-erd.html` 재렌더 — 로컬에 mermaid-cli 없음.
