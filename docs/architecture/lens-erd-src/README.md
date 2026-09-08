# lens-erd-src — PostgreSQL 스키마 설계 소스

DynamoDB에서 PostgreSQL로의 이관을 검토하며 만드는 스키마 설계 소스. 아직
프로덕션에 반영된 스키마가 아니다 — `docs/architecture`의 다른 문서와 달리
"지금 시스템"이 아니라 "이관 대상으로 검토 중인 설계"를 담는다. 렌더 결과물은
`../lens-postgres-erd.html`(2026-09-08 변경분 미반영 — 재렌더 필요, 아래 참조).

## 버전 이력

**`../db-changelog/`** — 2026-08-26 원본 설계부터 지금까지, 그리고 그
이전 DynamoDB 시절부터의 이력까지 전부 버전/날짜별 파일로 쪼개 폴더에
정리했다. `db-changelog/postgres/`가 이 스키마의 여정, `db-changelog/
dynamodb/`가 지금 시스템의 여정 — 두 트랙이 어떻게 이어지는지는
`db-changelog/README.md`의 통합 타임라인 참조. worklog가 "그날 있었던 일"
이라면 db-changelog는 "지금까지의 여정을 주제별로 훑어보는 것".

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
  미정이었으나, 이후 개인정보보호법 근거로 확정 — 아래 "기술 결정 4건" 참조).

## 기술 결정 4건 확정 (2026-09-08) — `14-operations.md`

원본에 조건부/미정으로 남아있던 기술 결정과, 원본에도 없던 회원 탈퇴
삭제 정책까지 확정했다:

- **한국어 전문검색 = pg_bigm 채택** — Aurora/RDS PostgreSQL 16 공식 지원
  확인됨. `search_vector`(tsvector 'simple') 컬럼·인덱스를 걷어내고 원문
  컬럼에 `gin_bigm_ops` 인덱스를 직접 건다. 가중 랭킹은 애플리케이션 쿼리에서
  계산(구현 영향, 스키마 영향 아님).
- **월별 파티션 자동화 = pg_partman 채택** — 마찬가지로 공식 지원 확인됨.
  `view_events`(90일 보존 후 파티션째 삭제)·`ai_usage_logs`(무기한 보존)에
  `create_parent()` 설정, 매달 `run_maintenance_proc()`을 기존 EventBridge
  스케줄 패턴으로 호출.
- **`view_counts` 갱신 권한 분리** — 이 레포의 두 백엔드 구조(service/admin)를
  그대로 반영해 역할 3개(`lens_service_app`/`lens_admin_app`/`lens_batch`) +
  컬럼 단위 GRANT로 구체화.
- **회원 탈퇴 = 하드 삭제, 영업일 5일 이내** — 개인정보보호법 제21조
  근거(지체없이 파기). 원본 `ON DELETE CASCADE` 관계가 그대로 삭제 경로가
  되어 스키마 변경 없음.

## DynamoDB 베이스라인 (2026-09-08 측정) — `15-baseline-benchmark.md`

Postgres 이관 전/후를 비교할 수 있게 지금 DynamoDB 상태를 측정해뒀다.
테이블 규모, DynamoDB 자체 처리 지연(15~30ms), 종단 간 API 응답(1.2~5.6초),
2일 소비 용량까지. **DynamoDB 엔진 자체는 빠른데 종단 간 응답이 느린 격차가
핵심 지표** — 병목이 애플리케이션 레이어(스캔+필터링)에 있다는 뜻이라,
이관 후 이 격차가 줄어드는지가 이관 성공의 실질적 증거다. 이관 후엔 이
문서에 같은 명령을 재실행해 "이관 후" 열을 추가한다(새 파일 안 만듦).

## 5단계(구현) 진입 준비 — `docs/worklog/2026-09/2026-09-08-postgres-migration-plan.md`

실제 AWS 인프라 생성 전 실행 순서(프로비저닝 → 스키마 적용 → 데이터
마이그레이션 → 검증 → 롤백)를 정리한 계획 문서. 계획만 담겨 있고, 실제
인프라 생성·데이터 이관은 별도 확인 후 진행한다.

## 미해결

- `lens-postgres-erd.html` 재렌더 — 로컬에 mermaid-cli 없음.
- 마이그레이션 실행 계획의 데이터 이관 방식·롤백 절차 — `docs/worklog/
  2026-09/2026-09-08-postgres-migration-plan.md` 참조.
