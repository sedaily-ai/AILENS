# 2026-09-08 PostgreSQL 이관 실행 계획 (5단계 진입 준비)

작성: Claude Code
관련: `docs/architecture/lens-erd-src/`, `docs/architecture/db-changelog/`

## 배경

개념·논리·물리 설계(1~4단계)가 원본 SQL과 대조까지 끝나고, 원본에 조건부로
남아있던 기술 결정 3건(pg_bigm, pg_partman, 권한분리)도 확정됐다. 5단계
(구현)로 넘어가기 전에, 실제 AWS 리소스를 만들기 전 단계에서 실행 순서와
검증 방법을 문서로 먼저 확정해두는 것이 이 문서의 목적이다.

**이 문서는 계획만 담는다 — 실제 RDS/Aurora 인스턴스 생성, 파라미터
그룹 변경, 데이터 마이그레이션 실행은 이 문서 작성만으로 진행되지 않는다.
비용이 발생하고 되돌리기 어려운 인프라 작업이라 실행 전 별도 확인이
필요하다.**

## 진입 조건 (현재 상태)

| 조건 | 상태 |
|---|---|
| 개념·논리·물리 설계 확정 | 완료 (`docs/architecture/db-changelog/postgres/v1.0`) |
| 원본 SQL 대조 | 완료 |
| 기술 결정 3건(검색·파티션·권한) | 완료 (`14-operations.md`) |
| 회원 탈퇴 삭제 정책 | **미확정** — 법무/정책 판단 필요, 이 계획의 진행을 막는 유일한 항목 |
| DynamoDB 베이스라인 측정 | 완료 (`15-baseline-benchmark.md`) |

탈퇴 정책이 정해지지 않아도 아래 §1(인프라 프로비저닝)까지는 준비할 수
있으나, §2(전체 스키마 적용)는 `users`/`ai_usage_logs` 관련 DDL이
바뀔 수 있어 탈퇴 정책 확정 후 진행한다.

## §1 인프라 프로비저닝 순서

1. Aurora PostgreSQL 16 인스턴스 생성 (리전: 기존 DynamoDB 리전인
   us-east-1과 동일하게 — `docs/architecture/db-changelog/dynamodb/
   테이블-인벤토리.md` 확인 결과)
2. 확장 설치 순서: `pg_trgm` → `btree_gin` → `vector` → `pg_bigm` →
   `pg_partman` (원본 SQL 헤더 + `14-operations.md` 순서)
3. 역할 3개 생성(`lens_service_app`, `lens_admin_app`, `lens_batch`) —
   `14-operations.md` §3

## §2 스키마 적용 순서

1. `lens_schema_2026-08-26.sql` 원본 DDL 실행 (테이블 50개, 뷰 1개)
2. `14-operations.md`의 결정 3건 적용:
   - §1 한국어 검색: `search_vector` 컬럼 제거 + `gin_bigm_ops` 인덱스
   - §2 파티션: `pg_partman.create_parent()` 설정
   - §3 권한: REVOKE/GRANT 문
3. 탈퇴 정책 확정 후 결정되는 DDL(있다면) 반영

## §3 데이터 마이그레이션 (DynamoDB → Postgres)

**이 계획 문서 작성 시점엔 구체적 방법을 확정하지 않았다** — 다음 중 택일
필요:
- 일괄 이관(정지 후 전체 복사) — 다운타임 발생, 방법은 단순
- 이중 쓰기(dual-write) 후 검증·컷오버 — 다운타임 없음, 구현 복잡도 높음

`docs/architecture/db-changelog/dynamodb/테이블-인벤토리.md` 기준 데이터
규모(cms-posts 3,897건/21.3MB, articles 24,613건/218.9MB 등)는 일괄 이관도
현실적인 규모다.

## §4 검증 계획

`docs/architecture/lens-erd-src/15-baseline-benchmark.md`의 측정 명령을
동일 조건(같은 채널, 같은 limit)으로 Postgres에 대해 재실행하고, 같은
문서에 "이관 후" 열을 추가한다.

## §5 롤백 계획

**미정 — 실제 실행 전 확정 필요.** 최소한 다음을 포함해야 한다:
- 컷오버는 `CMS_LIST_INDEX_MODE`(2026-09-07 GSI 이관 때 쓴 것과 동일한
  패턴)처럼 코드 배포와 분리된 환경변수 스위치로
- DynamoDB 원본 테이블은 컷오버 후에도 일정 기간 삭제하지 않고 보존

## 결정

- 실제 인프라 생성·데이터 마이그레이션 실행은 이 문서 작성만으로
  진행하지 않는다 — 비용 발생 + 되돌리기 어려운 작업이라 별도 확인 필요.
- 탈퇴 정책 확정 전까지 §2(전체 스키마 적용)는 보류, §1(인프라
  프로비저닝)까지만 준비 가능.

## 다음

- 회원 탈퇴 삭제 정책 확정 (법무/정책 판단 대기).
- §3 데이터 마이그레이션 방식(일괄 vs dual-write) 결정.
- §5 롤백 계획 구체화.
- 위 항목이 정리되면 실제 AWS 리소스 생성 여부를 별도로 확인한다.
