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
| 회원 탈퇴 삭제 정책 | 완료 — 하드 삭제, 영업일 5일 이내(`14-operations.md` §4) |
| DynamoDB 베이스라인 측정 | 완료 (`15-baseline-benchmark.md`) |

**모든 진입 조건이 충족돼 §2(전체 스키마 적용)까지 계획 범위에서는
막힌 항목이 없다.** 다만 이 문서 전체는 계획이고, 실제 실행은 별도 확인
후 진행한다(문서 상단 참조).

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
2. `14-operations.md`의 결정 4건 적용:
   - §1 한국어 검색: `search_vector` 컬럼 제거 + `gin_bigm_ops` 인덱스
   - §2 파티션: `pg_partman.create_parent()` 설정
   - §3 권한: REVOKE/GRANT 문
   - §4 탈퇴 정책 관련 배치(삭제 배치)는 스키마 변경 없음, 애플리케이션
     레이어에서 구현

## §3 데이터 마이그레이션 (DynamoDB → Postgres)

**결정: 일괄 이관(정지 후 전체 복사).**

근거 — `docs/architecture/db-changelog/dynamodb/테이블-인벤토리.md`에
기록된 실측 규모:

| 테이블 | 아이템 수 | 크기 |
|---|---|---|
| cms-posts | 3,897 | 21.3MB |
| articles | 24,613 | 218.9MB |
| personal | 200 | 226KB |
| external-content | 51 | 440KB |
| engagement | 198 | 37KB |
| podcast | 3 | 2KB |
| quiz-questions | 5 | 2KB |
| newsletter-subscribers | 3 | 609B |
| daily-letters | 0 | 0 |
| **합계** | **28,970** | **약 240.9MB** |

9개 테이블 전체 합계가 240.9MB로, 단일 배치 작업으로 처리 가능한 규모다.
이중 쓰기(dual-write) 방식은 구현 복잡도 대비 이 데이터 규모에서 얻는
이득(다운타임 회피)이 크지 않다고 판단해 채택하지 않는다.

절차: (1) 서비스 쓰기 정지 공지 (2) DynamoDB 9개 테이블 전체 스캔·덤프
(3) 원본 SQL + `14-operations.md` 순서로 Postgres 스키마 생성 (4) 덤프
데이터를 Postgres 스키마에 맞게 변환·적재 (5) §4 검증 실행 (6) 컷오버.

## §4 검증 계획

`docs/architecture/lens-erd-src/15-baseline-benchmark.md`의 측정 명령을
동일 조건(같은 채널, 같은 limit)으로 Postgres에 대해 재실행하고, 같은
문서에 "이관 후" 열을 추가한다.

## §5 롤백 계획

**결정**:
- 컷오버는 `CMS_LIST_INDEX_MODE`(2026-09-07 GSI 이관 때 쓴 것과 동일한
  패턴)처럼 코드 배포와 분리된 환경변수 스위치로 — 문제 발생 시 재배포
  없이 즉시 DynamoDB로 되돌린다.
- DynamoDB 원본 9개 테이블은 컷오버 후 **30일간 읽기 전용으로 보존**한
  뒤 삭제한다.

**주의 — 탈퇴 정책과의 상충 지점**: §4(14-operations.md, 회원 탈퇴 =
영업일 5일 이내 하드 삭제)는 "그 시점 서비스 중인 DB"를 전제로 한다.
컷오버 후 30일 보존 기간 동안 DynamoDB는 서비스 중이 아니라 롤백용
스냅샷이지만, 그 안에는 컷오버 시점 기준 회원의 개인정보가 그대로 남아
있다. 이 기간 중 탈퇴 요청이 들어오면 **Postgres(운영계)뿐 아니라 보존
중인 DynamoDB 스냅샷에서도 해당 회원 데이터를 영업일 5일 이내 삭제**해야
한다 — 이 처리를 롤백 보존 기간 동안의 운영 절차에 명시적으로 포함해야
한다. 이 절차의 구체 구현(자동화 여부, 담당자)은 미정.

## 결정

- 실제 인프라 생성·데이터 마이그레이션 실행은 이 문서 작성만으로
  진행하지 않는다 — 비용 발생 + 되돌리기 어려운 작업이라 별도 확인 필요.
- §3 데이터 마이그레이션 방식: 일괄 이관 채택(실측 규모 28,970건·240.9MB
  기준, dual-write 대비 이득 작다고 판단).
- §5 롤백: 환경변수 스위치 + DynamoDB 30일 보존. 단, 보존 기간 중 탈퇴
  요청은 양쪽 시스템 모두에서 처리해야 한다는 제약 확인.

## 다음

- §5에서 확인된 상충 지점(보존 기간 중 탈퇴 처리를 양쪽에서 해야 하는
  절차)의 구체 구현 방법 결정 — 자동화 여부, 담당.
- 계획이 다 정리됐으므로, 실제 AWS 리소스 생성 여부를 사용자에게 별도로
  확인한다.
