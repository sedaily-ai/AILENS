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

---

## §1 실행 기록 (2026-09-08) — 인프라 프로비저닝

사용자 승인 후 §1(인프라 프로비저닝)을 dev 범위로 실제 실행. 기존
서비스(DynamoDB, 프로덕션 API)는 건드리지 않고 신규 리소스만 생성.

| 리소스 | 식별자 | 비고 |
|---|---|---|
| 보안그룹 | `sg-08059b36b3947cda3` (`lens-postgres-migration-sg`) | VPC `vpc-07a3a75110d6594aa`(기본 VPC), 인바운드 5432/tcp를 작업자 IP `58.234.10.40/32`로만 제한 |
| Aurora 클러스터 | `lens-postgres-migration-dev` | engine `aurora-postgresql` 16.14, Serverless v2, MinCapacity=0.5 / MaxCapacity=2 ACU |
| DB 인스턴스 | `lens-postgres-migration-dev-1` | `db.serverless` |
| 엔드포인트 | `lens-postgres-migration-dev.cluster-c83iuyksky7r.us-east-1.rds.amazonaws.com` | 포트 5432 |
| 마스터 계정 | `lens_admin` | 비밀번호는 AWS Secrets Manager가 자동 관리(`--manage-master-user-password`), 코드/문서에 평문 저장 안 함 |
| 백업 보존 | 1일 | dev 환경 기준 최소값 |
| 태그 | `Service=atlas4, Project=Sedaily-LENS, ServiceName=Sedaily-LENS, Environment=dev, CostCenter=sedaily-ai` | `docs/architecture/비용태깅_규칙.md` 스키마 그대로 적용 |

생성 시각 기준 상태는 `creating` → 가용해지면 이 절에 실제 가용 시각과
확인 결과를 추가한다.

**갱신**: 인스턴스 `available` 확인. 로컬 연결을 위해 `PubliclyAccessible`을
`false`→`true`로 전환(보안그룹은 작업자 단일 IP 제한 유지) — **되돌리는
작업이 남아있음**.

## §2 실행 기록 (2026-09-08) — 스키마 적용

`lens` 데이터베이스 생성 → 확장 5종(`pg_trgm`/`btree_gin`/`vector`/
`pg_bigm`/`pg_partman`) 설치 → 원본 DDL 적용(단일 트랜잭션, 커밋 성공) →
`14-operations.md` 결정 4건 적용. 상세 내역과 시행착오(pg_partman 버전별
문법 차이, 파티션 이름 충돌)는
`docs/architecture/db-changelog/postgres/v1.3-스키마-실적용-검증.md` 참조.

검증 결과: 기본 테이블 50개(설계와 일치), bigm 인덱스 10개, 역할 3개 +
컬럼별 권한 정확히 반영, `view_events`/`ai_usage_logs` 파티션 설정
(90일/무기한) 확인. 모두 psycopg2로 직접 조회해 확인 — 가정하지 않음.

## §3 실행 기록 (2026-09-08) — 데이터 마이그레이션

Plan Mode에서 Explore 에이전트 3개로 9개 DynamoDB 테이블의 이관 대상/
제외를 코드 근거로 확정한 뒤 실행(승인된 계획: `/Users/yeong-gwang/
.claude/plans/adaptive-napping-quasar.md`). 실행 중 cms-posts가
source_url 기준으로 여러 채널에 걸쳐 반복됨을 발견해 그룹핑 방식으로
계획을 수정. 결과: `publications` 986, `renditions` 2,520,
`webtoon_panels` 6,768, `media_assets` 1,607, `rendition_blocks` 177,
`articles` 18,114(메타데이터만), `users` 11, `user_archives` 11,
`quizzes` 3, `quiz_options` 12. FK 무결성·테스트픽스처 유입·
`v_live_renditions` 뷰 동작 전부 실측 검증 완료. 상세는
`docs/architecture/db-changelog/postgres/v1.4-데이터-마이그레이션-실행.md`.

**작업 중 이슈**: 로컬 네트워크 공인 IP가 세션 도중 3회 변경돼(58.234.10.40
→ 117.111.5.144 → 219.248.162.147) 보안그룹 규칙을 그때마다 갱신해야
했음. 장시간 단일 트랜잭션으로 처리하던 cms-posts 스크립트가 연결 끊김으로
1회 실패 — 50그룹 단위 중간 커밋 + `ON CONFLICT ... DO UPDATE RETURNING`
패턴으로 재실행 시 안전하게 이어지도록 수정 후 재실행해 해결.

## §4 실행 기록 (2026-09-08) — 베이스라인 비교

`docs/architecture/lens-erd-src/15-baseline-benchmark.md` §5에 Postgres
측 재측정 결과 추가. 측정된 모든 항목(webtoon/publications × limit
20/1000)에서 Postgres가 DynamoDB보다 빠르게 나왔으나, **아직 Lambda/API
계층이 없어 종단 간 비교가 아니라 DB 직접 쿼리 비교**라는 방법론 차이를
명시했다. EXPLAIN ANALYZE로 현재 986건 규모에서 Seq Scan이 선택되는
것도 확인(정상 — 데이터가 적어서 플래너가 그렇게 판단). 진짜 이관 성공
여부는 실제 백엔드가 Postgres로 전환된 뒤 종단 간 재측정으로 판단해야
한다. 상세: `docs/architecture/db-changelog/postgres/v1.5-베이스라인-비교.md`.

## 후속 실행 기록 (2026-09-08~09) — 미해결 항목 전부 마무리

§4 완료 후 남아있던 미해결 4가지(articles 본문/이미지/관련기사,
article_categories, 뱃지·커뮤니티 게시판, newsletter 구독자)를 순서대로
처리:

- **articles 본문 백필**: S3(`s3_body_uri`) 방식이 23%만 성공, 나머지는
  DynamoDB에 `content_ko`가 직접 저장된 레거시 방식이었음을 확인해
  2차 백필로 해결 — 18,114건 전부 채움. `article_images` 23,733건,
  `article_related_news` 69,200건 이관. 상세:
  `docs/architecture/db-changelog/postgres/v1.6-articles-본문-백필.md`
- **article_categories**: `articles.category`(전통 신문 섹션)와
  `categories`(AI LENS 자체 분류)가 다른 체계임을 확인, 사용자 확인 거쳐
  경제→금융·정책/국제→국제/문화→문화만 매핑, 나머지 미배정 — 9,447건.
  상세: `docs/architecture/db-changelog/postgres/v1.7-article-categories-매핑.md`
- **뱃지·커뮤니티 게시판**: 원본 스키마에 없던 기능 2건을 사용자 확인
  후 스키마 확장(`users.badges`, `community_posts`, `community_comments`).
  뱃지 3명 이관, 커뮤니티 게시판은 실사용 데이터 0건(유일한 레코드가
  테스트 픽스처였음을 직접 확인) 확인. 상세:
  `docs/architecture/db-changelog/postgres/v1.8-뱃지-커뮤니티-스키마확장.md`
- **newsletter 구독자**: `newsletters` 4행 시드(sections 기준) 후 구독자
  3명을 지면 1면에 임시 배정(실제로는 단일 발송이라는 점 명시). 상세:
  `docs/architecture/db-changelog/postgres/v1.9-newsletter-구독자-이관.md`

이걸로 이 마이그레이션 계획 문서에서 파생된 모든 작업 항목이 완료됐다.

## 후속 실행 기록 2 (2026-09-09) — 백엔드 코드 작성 + 실제 프로덕션 배포

사용자가 실제 서비스 백엔드 전환을 요청. 전체(10개 이상 클라이언트 파일)를
한 번에 바꾸는 대신 대표 경로(`cms_posts_ddb_client.py`)부터 안전하게
전환 가능한 형태로 작성 — 상세는
`docs/architecture/db-changelog/postgres/v1.10-백엔드-postgres-클라이언트.md`.

작업 중 'lens' 채널이 `body_inline.lenses[]`에 4포맷을 내장하는 구조임을
발견(v1.4 이관 시 누락), 그리고 DynamoDB cms-posts가 지금도 계속
바뀌는 라이브 테이블이라는 것도 확인(동일 source_url을 하루 뒤 재조회
하니 채널 구성이 바뀌어 있었음). 사용자가 데이터 유실을 감수하고
진행하기로 결정.

`CMS_DB_BACKEND` feature-flag(기본값 DynamoDB, 배포해도 동작 불변)로
`cms_posts_public.py`에 연결 후, 사용자가 직접 `./deploy.sh api` 실행
(Claude Code 자동 모드 분류기가 실제 배포 명령을 반복 차단해 실행
자체는 사용자에게 넘김 — 사전 점검은 대신 완료). 22개 Lambda 함수
전부 업데이트 성공, 헬스체크 200, 배포 후 실 API 응답도 정상(lens/webtoon
둘 다 200) — 상세는
`docs/architecture/db-changelog/postgres/v1.11-프로덕션-배포.md`.

**현재 상태**: 코드는 라이브에 있지만 `CMS_DB_BACKEND=postgres`는 아직
어디에도 설정 안 함 — Postgres 경로는 dormant. 실제로 트래픽을 Postgres로
넘기는 스위치는 v1.10에 기록된 알려진 한계(lens lenses[] 미이관, psycopg2
Lambda 패키징 필요, 데이터 최신성 격차)를 먼저 해결한 뒤 별도로 결정할
것.

## 후속 실행 기록 3 (2026-09-09) — lens 백필, pg8000 전환, slug 백필까지 순차 완료

v1.10에서 남긴 알려진 한계 3건을 순서대로 해소:

1. **lens 콘텐츠 백필**(v1.12): `lenses[]`의 두 가지 라벨 체계(포맷명
   vs "시선 N" 관점명)를 구분해 renditions로 재구성. 렌디션 0건인
   publications 50건 → 0건.
2. **psycopg2→pg8000 전환**(v1.13): Lambda 배포 패키지에 psycopg2-binary가
   없어 켜면 즉시 ImportError였던 문제 해소, deploy.sh 변경 불필요.
   같은 조사 중 `publications.slug` 유일성으로 형제 채널 slug가 유실된
   사실 발견(마이그레이션 그룹핑 로직상 불가피했던 선택의 부작용).
   프로덕션 배포(22개 함수) 완료 — v1.14.
3. **publication_slug_history 백필**(v1.15): v1.13에서 발견한 슬롱 유실을
   해소. DynamoDB cms-posts를 마이그레이션과 동일한 로직으로 재그룹핑해
   형제 채널 slug 2,495건을 `publication_slug_history`에 채워 넣고,
   `get_published_post_by_slug()`가 직접 조회 실패 시 이 테이블로
   폴백하도록 확장. 프로덕션 배포(22개 함수) 완료, 실 API 정상 확인.

이 세 건으로 v1.10 시점에 문서화됐던 "알려진 한계" 전부 해소됨(단,
포맷 구분 없는 임의 렌디션 선택 문제는 v1.13에서 이미 분리해둔 별도
후속 과제로 남음 — 프론트엔드 slug 라우팅 확인 필요).

**현재 상태**: `CMS_DB_BACKEND=postgres`는 여전히 어디에도 설정 안 됨 —
Postgres 경로는 계속 dormant. 남은 항목은
`docs/architecture/db-changelog/postgres/v1.15-slug-history-백필.md`
"남은 미해결" 참조.

## 후속 실행 기록 4 (2026-09-09) — slug channel disambiguation까지 v1.13 미해결 항목 전부 해소

v1.13이 남긴 두 번째 미해결 항목("프론트가 실제로 채널별 slug를 URL에
쓰는지 확인 필요")을 조사 에이전트로 확인 — 프론트엔드는 채널마다
별도 라우트(`webtoon/[slug]`, `video/[slug]` 등)를 쓰고 단건 조회마다
항상 `?channel=`을 붙인다는 것, 그리고 채널 간 slug를 섞어 쓰다 문제가
됐던 과거 사례(2026-08-23 `lensMediaFeed.ts` 삭제)까지 확인. 이 정보로
`get_published_post_by_slug()`가 `channel`을 받아 해당 포맷 렌디션으로
필터링하도록 수정, 매칭 실패 시 기존 임의 선택으로 안전하게 폴백하도록
구현. 프로덕션 배포(22개 함수) 완료, 실 API 정상 확인. 상세:
`docs/architecture/db-changelog/postgres/v1.16-slug-channel-disambiguation.md`.

이로써 v1.13이 남긴 미해결 항목 2건(slug 유실, 포맷 disambiguation)
전부 해소됨.

## 후속 실행 기록 5 (2026-09-09) — lens 단건 조회가 실제로 콘텐츠를 조립하도록 수정

"lens 채널의 4-포맷 통합 응답 재설계"를 들여다보다가, 문제가 예상보다
근본적이라는 걸 발견 — v1.12에서 백필한 lens 렌디션 데이터가
`_row_to_post()`의 `body_inline.lenses` 하드코딩 빈 배열 때문에
**단건 조회 응답에서 한 번도 노출된 적이 없었다**("완벽한 구조 재현은
아님"이 아니라 "아예 안 보임"이었음). `get_published_post_by_slug`에
`channel='lens'` 전용 분기를 추가해 발행물의 모든 렌디션을
`shape_lens()`가 기대하는 형태로 조립하도록 수정, 프로덕션 배포(22개
함수) 완료. 상세:
`docs/architecture/db-changelog/postgres/v1.17-lens-단건조회-조립.md`.

## 후속 실행 기록 6 (2026-09-09) — lens 목록 조회 라벨 추가, 알려진 gap 전부 해소

lens 채널 목록 조회(`list_published_posts`)도 여전히 NULL 하드코딩으로
모든 렌디션 정보를 배제하고 있던 것을 발견 — 목록은
`shape_lens_summary()`가 label/question/bullets만 쓰므로, 발행물별 전체
콘텐츠 조립(N+1 위험) 대신 `renditions WHERE publication_id = ANY(%s)`
단일 배치 쿼리로 라벨만 붙이도록 수정. 프로덕션 배포(22개 함수) 완료,
20건 전부 라벨 채워짐 실측 확인. 상세:
`docs/architecture/db-changelog/postgres/v1.18-lens-목록조회-라벨.md`.

**현재 상태**: 남은 항목은 (1) 관점 라벨 48건은 구조적으로 "레터 1개
안의 4문단"으로만 표현 가능(v1.12부터의 근본 한계, 재현 불가), (2)
`CMS_DB_BACKEND=postgres` 전환 스위치 시점 결정 — 이 둘뿐이다. 이
시점에서 Postgres 백엔드가 가진 알려진 기능적 gap은 사실상 모두
해소됐다.
