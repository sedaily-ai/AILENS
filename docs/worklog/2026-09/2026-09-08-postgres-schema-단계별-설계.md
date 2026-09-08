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
