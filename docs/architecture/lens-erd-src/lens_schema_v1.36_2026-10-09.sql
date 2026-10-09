-- ============================================================================
-- v1.36 (2026-10-09) — DynamoDB 잔여 데이터 이관용 테이블 3개
--   설계 문서: docs/architecture/lens-erd-src/16-ddb-잔여-이관-설계.md
--   변경 이력: docs/architecture/db-changelog/postgres/v1.36-ddb-잔여-이관.md
--
-- ⚠️ 실행 주체: 마스터 계정(lens_admin). 앱 역할 lens_service_app 에는 DDL 권한이 없다
--    (v1.33~v1.35와 같은 절차 — SSM 릴레이 또는 로컬 psql, 비밀번호는 세션에 노출하지 않는다).
-- 원본(lens_schema_2026-08-26.sql)은 고치지 않는다. 이후 변경분은 이 파일처럼 버전별 SQL로만 남긴다.
-- 멱등: 전부 IF NOT EXISTS 이므로 재실행해도 안전하다. 롤백은 파일 맨 아래 주석 참조.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. candidate_seen — 자동 선정 파이프라인이 "이미 본 후보 기사" 이력
--    (DynamoDB sedaily-lens-mustknow-seen-dev 대체. 11,359건, 하루 수십~수백 건 증가)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candidate_seen (
    pipeline              VARCHAR(32)   NOT NULL,
    article_key           VARCHAR(64)   NOT NULL,
    seen_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
    tab                   VARCHAR(32),
    score                 NUMERIC(6,2),
    reasoning             TEXT,
    is_manual             BOOLEAN       NOT NULL DEFAULT false,
    excluded_from_general BOOLEAN       NOT NULL DEFAULT false,
    reason                TEXT,
    detail                JSONB         NOT NULL DEFAULT '{}',
    PRIMARY KEY (pipeline, article_key)
);
COMMENT ON TABLE candidate_seen IS '자동 선정 파이프라인이 이미 채점·판단한 후보 기사. 같은 기사를 다시 채점하지 않기 위한 중복 방지 이력. 발행 결과(publications)·선정 결과(selection_*)와는 별개라 기사 FK를 두지 않는다';
COMMENT ON COLUMN candidate_seen.pipeline IS '파이프라인 이름(mustknow, frontpage 등). 같은 article_key라도 파이프라인마다 따로 본다';
COMMENT ON COLUMN candidate_seen.article_key IS '원문 기사 번호(articles.article_no와 같은 값이지만 articles에 없는 후보도 있어 FK 없음)';
COMMENT ON COLUMN candidate_seen.seen_at IS '처음 판단한 시각';
COMMENT ON COLUMN candidate_seen.tab IS '발행된 탭(없으면 NULL)';
COMMENT ON COLUMN candidate_seen.score IS 'LLM 채점 점수';
COMMENT ON COLUMN candidate_seen.is_manual IS '운영자가 수동으로 처리한 기사인가';
COMMENT ON COLUMN candidate_seen.excluded_from_general IS '일반 카테고리 선정에서 제외된 기사인가';
COMMENT ON COLUMN candidate_seen.detail IS '위 컬럼에 없는 부가 속성(옛 DynamoDB 항목의 나머지 필드)';

-- 최근 순 조회·정리 용도. 키 조회는 PK가 처리한다.
CREATE INDEX IF NOT EXISTS candidate_seen_seen_at_idx ON candidate_seen (pipeline, seen_at DESC);


-- ----------------------------------------------------------------------------
-- 2. admin_jobs — 관리자 비동기 작업 상태(웹툰 컷 생성, 프롬프트 테스트 등)
--    (DynamoDB sedaily-mbti-admin-config-dev 의 WEBTOONLAB/PROMPTTEST job 대체)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_jobs (
    id          BIGSERIAL     PRIMARY KEY,
    kind        VARCHAR(32)   NOT NULL,
    job_id      VARCHAR(64)   NOT NULL,
    status      VARCHAR(16)   NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'done', 'error')),
    payload     JSONB         NOT NULL DEFAULT '{}',
    result      JSONB         NOT NULL DEFAULT '{}',
    error       TEXT,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ   NOT NULL DEFAULT (now() + interval '30 days'),
    UNIQUE (kind, job_id)
);
COMMENT ON TABLE admin_jobs IS '관리자 콘솔이 시작하는 비동기 작업의 상태 저장소. 수명이 짧아 expires_at이 지나면 정리한다. 이벤트 로그(audit_logs)와 달리 같은 행의 상태가 바뀐다';
COMMENT ON COLUMN admin_jobs.kind IS '작업 종류(webtoon_cut, prompt_test 등). 새 종류는 테이블 변경 없이 값만 추가한다(검증은 애플리케이션)';
COMMENT ON COLUMN admin_jobs.job_id IS '작업 식별자(클라이언트가 폴링에 쓰는 값). kind와 함께 유일';
COMMENT ON COLUMN admin_jobs.payload IS '작업 입력(장면·카메라·프롬프트 이름 등). 종류마다 모양이 다르다';
COMMENT ON COLUMN admin_jobs.result IS '작업 결과(이미지 URL·모델 출력 등)';
COMMENT ON COLUMN admin_jobs.expires_at IS '이 시각 이후 정리 대상. DynamoDB는 TTL이 꺼져 있어 무한 누적됐던 것을 막는다';

-- 진행 중 작업만 빠르게 찾는다(폴링·장애 점검용).
CREATE INDEX IF NOT EXISTS admin_jobs_active_idx ON admin_jobs (kind, created_at DESC)
    WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS admin_jobs_kind_created_idx ON admin_jobs (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_jobs_expires_idx ON admin_jobs (expires_at);


-- ----------------------------------------------------------------------------
-- 3. daily_questions — 홈 "오늘의 질문" 날짜별 생성 캐시
--    (DynamoDB sedaily-mbti-personal-dev 의 user_id='__questions__' 항목 대체. 89건)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_questions (
    question_date DATE          PRIMARY KEY,
    questions     JSONB         NOT NULL,
    question_count SMALLINT     NOT NULL DEFAULT 0,
    model         VARCHAR(64),
    generated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
COMMENT ON TABLE daily_questions IS '그날의 질문 묶음을 LLM으로 한 번 생성해 보관하는 캐시. 첫 요청이 만들고 이후는 읽기만 한다(KST 날짜 기준)';
COMMENT ON COLUMN daily_questions.question_date IS 'KST 날짜. 하루 한 행';
COMMENT ON COLUMN daily_questions.questions IS '질문 배열(JSON). 개별 질문 구조는 애플리케이션이 정의';
COMMENT ON COLUMN daily_questions.model IS '생성에 쓴 모델(프로파일) 이름. 모델이 바뀌면 재생성 대상 식별용';


-- ----------------------------------------------------------------------------
-- 권한 — 앱 역할(lens_service_app). 시퀀스 USAGE·SELECT 를 같이 줘야 INSERT ... RETURNING 이 동작한다(v1.24 사고).
-- 파이프라인·관리자 Lambda·서비스 Lambda 는 모두 lens-cms-api(앱 역할)를 거치므로 다른 역할에는 주지 않는다.
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON candidate_seen TO lens_service_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_jobs TO lens_service_app;      -- DELETE: 만료 정리
GRANT SELECT, INSERT, UPDATE ON daily_questions TO lens_service_app;
GRANT USAGE, SELECT ON SEQUENCE admin_jobs_id_seq TO lens_service_app;

COMMIT;

-- ----------------------------------------------------------------------------
-- 검증 쿼리(적용 후 마스터 계정으로)
--   \d+ candidate_seen
--   \d+ admin_jobs
--   \d+ daily_questions
--   SELECT table_name, privilege_type FROM information_schema.role_table_grants
--     WHERE grantee = 'lens_service_app' AND table_name IN ('candidate_seen','admin_jobs','daily_questions') ORDER BY 1,2;
--
-- 롤백(데이터 이관 전에만; 이관 후에는 DynamoDB를 삭제하기 전까지 환경변수 스위치로 되돌린다)
--   BEGIN;
--   DROP TABLE IF EXISTS candidate_seen, admin_jobs, daily_questions;
--   COMMIT;
-- ----------------------------------------------------------------------------
