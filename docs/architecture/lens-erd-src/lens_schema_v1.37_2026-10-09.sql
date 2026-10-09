-- ============================================================================
-- v1.37 (2026-10-09) — 이슈 레터(모아쓰기 레터) 테이블 7개
--   설계 문서: docs/architecture/lens-erd-src/17-이슈레터-설계.md
--   변경 이력: docs/architecture/db-changelog/postgres/v1.37-이슈레터-신설.md
--   기획·결정: docs/product/모아쓰기레터/README.md (Q1~Q8 결정 기록)
--
-- ⚠️ 상태: 설계 확정 전 초안(화면 목업 확정 후 작성). 실행 전 사용자 검토 필요.
-- ⚠️ 실행 주체: 마스터 계정(lens_admin). 앱 역할 lens_service_app 에는 DDL 권한이 없다
--    (v1.33~v1.36과 같은 절차 — 비밀번호는 세션에 노출하지 않는다).
-- 원본(lens_schema_2026-08-26.sql)은 고치지 않는다. 멱등: 전부 IF NOT EXISTS. 롤백은 맨 아래 주석 참조.
-- 이름 주의: 옛 "레터"(letters/daily-letters)와 구분하려고 내부 이름은 issue_letter 로 쓴다(Q1).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. issue_letters — 레터 본체(하나의 이슈를 소식·실체·다른 시각으로 읽는 글 한 편)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issue_letters (
    id            BIGSERIAL     PRIMARY KEY,
    slug          VARCHAR(255)  NOT NULL UNIQUE,
    issue_no      INTEGER       UNIQUE,
    title         TEXT          NOT NULL,
    deck          TEXT          NOT NULL DEFAULT '',
    summary       TEXT[]        NOT NULL DEFAULT '{}',
    editor_note   TEXT,
    read_minutes  SMALLINT      NOT NULL DEFAULT 3 CHECK (read_minutes BETWEEN 1 AND 60),
    status        VARCHAR(16)   NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'in_review', 'published', 'archived')),
    author_no     VARCHAR(32)   REFERENCES editors(employee_no) ON DELETE SET NULL,
    reviewer_no   VARCHAR(32)   REFERENCES editors(employee_no) ON DELETE SET NULL,
    reviewed_at   TIMESTAMPTZ,
    published_at  TIMESTAMPTZ,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(deck, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(editor_note, '')), 'C')
    ) STORED,
    -- 발행본은 호수와 발행 시각, 검수자가 있어야 한다(Q7: 작성→검수→발행)
    CONSTRAINT issue_letters_published_chk CHECK (
        status <> 'published' OR (issue_no IS NOT NULL AND published_at IS NOT NULL AND reviewer_no IS NOT NULL)
    )
);
COMMENT ON TABLE issue_letters IS '이슈 레터(모아쓰기). 하나의 이슈를 소식·실체·다른 시각 세 관점으로 읽는 글 한 편. 옛 letters/daily-letters와 별개 상품';
COMMENT ON COLUMN issue_letters.slug IS '주소. 날짜-주제 형식(예: 2026-10-08-라네즈-필리핀). 발행 후 변경하지 않는다';
COMMENT ON COLUMN issue_letters.issue_no IS '호수. 발행 시 부여(제 14호). 초안은 NULL';
COMMENT ON COLUMN issue_letters.deck IS '제목 아래 한두 문장 요약(목록 카드에도 쓴다)';
COMMENT ON COLUMN issue_letters.summary IS '1분 요약 문장 배열(보통 3줄)';
COMMENT ON COLUMN issue_letters.editor_note IS '에디터 한마디. 자기반영 고백 금지 등 규칙은 프롬프트 템플릿 쪽';
COMMENT ON COLUMN issue_letters.status IS 'draft 초안 → in_review 검수 중 → published 발행 → archived 내림';
COMMENT ON COLUMN issue_letters.author_no IS '작성자(편집자). 자동 생성 초안은 NULL';
COMMENT ON COLUMN issue_letters.reviewer_no IS '검수·발행 승인자. 앱이 role=admin(편집장)인지 확인한다';
COMMENT ON COLUMN issue_letters.deleted_at IS '소프트 삭제. 실제로 지우지 않는다(publications와 같은 규칙)';

CREATE INDEX IF NOT EXISTS issue_letters_published_idx
    ON issue_letters (published_at DESC) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS issue_letters_search_idx ON issue_letters USING GIN (search_vector);


-- ----------------------------------------------------------------------------
-- 2. issue_letter_categories — 분류(주 1 + 보조 N, Q3). article_categories와 같은 모양
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issue_letter_categories (
    letter_id    BIGINT        NOT NULL REFERENCES issue_letters(id) ON DELETE CASCADE,
    category_id  SMALLINT      NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    is_primary   BOOLEAN       NOT NULL DEFAULT FALSE,
    PRIMARY KEY (letter_id, category_id)
);
COMMENT ON TABLE issue_letter_categories IS '레터의 분류. 주 분류 1개 + 보조 N개. 필터는 둘 다 매칭';
-- 레터당 주 분류는 최대 1개
CREATE UNIQUE INDEX IF NOT EXISTS issue_letter_categories_primary_uq
    ON issue_letter_categories (letter_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS issue_letter_categories_cat_idx ON issue_letter_categories (category_id, letter_id);


-- ----------------------------------------------------------------------------
-- 3. issue_letter_sections — 관점별 섹션(소식·실체·다른 시각 등)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issue_letter_sections (
    id          BIGSERIAL    PRIMARY KEY,
    letter_id   BIGINT       NOT NULL REFERENCES issue_letters(id) ON DELETE CASCADE,
    position    SMALLINT     NOT NULL CHECK (position >= 0),
    axis        VARCHAR(16)  NOT NULL CHECK (axis IN ('news', 'substance', 'other')),
    axis_label  TEXT,
    heading     TEXT         NOT NULL,
    key_line    TEXT         NOT NULL,
    paragraphs  JSONB        NOT NULL DEFAULT '[]',
    UNIQUE (letter_id, position)
);
COMMENT ON TABLE issue_letter_sections IS '레터의 관점 섹션. 섹션 상단의 "핵심:" 한 줄과 본문 문단을 가진다';
COMMENT ON COLUMN issue_letter_sections.axis IS 'news 소식 · substance 실체 · other 다른 시각';
COMMENT ON COLUMN issue_letter_sections.axis_label IS '헤더에 보이는 축별 한 줄 이름(예: 경제효과·테마주)';
COMMENT ON COLUMN issue_letter_sections.key_line IS '섹션 맨 위 "핵심:" 문장';
COMMENT ON COLUMN issue_letter_sections.paragraphs IS '문단 배열. 문단 = [{"text": "..."} | {"text": "...", "href": "...", "article_no": "..."}] 조각의 배열(본문 인라인 링크). 형식은 API 검증기가 강제';


-- ----------------------------------------------------------------------------
-- 4. issue_letter_sources — "이 레터에 쓰인 기사"(자사 기사 FK 또는 외부 기사 URL, Q4)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issue_letter_sources (
    id             BIGSERIAL     PRIMARY KEY,
    letter_id      BIGINT        NOT NULL REFERENCES issue_letters(id) ON DELETE CASCADE,
    position       SMALLINT      NOT NULL CHECK (position >= 0),
    article_no     VARCHAR(32)   REFERENCES articles(article_no) ON DELETE RESTRICT,
    external_title TEXT,
    external_outlet VARCHAR(64),
    external_url   TEXT,
    axes           TEXT[]        NOT NULL DEFAULT '{}',
    approved_by    VARCHAR(32)   REFERENCES editors(employee_no) ON DELETE SET NULL,
    UNIQUE (letter_id, position),
    -- 자사 기사(article_no)이거나 외부 기사(제목·매체·URL)이거나 둘 중 하나만
    CONSTRAINT issue_letter_sources_kind_chk CHECK (
        (article_no IS NOT NULL AND external_url IS NULL AND external_title IS NULL)
        OR (article_no IS NULL AND external_url IS NOT NULL AND external_title IS NOT NULL AND external_outlet IS NOT NULL)
    ),
    -- 외부 기사는 편집장 승인 필수(Q4)
    CONSTRAINT issue_letter_sources_ext_approved_chk CHECK (external_url IS NULL OR approved_by IS NOT NULL),
    CONSTRAINT issue_letter_sources_axes_chk CHECK (axes <@ ARRAY['news', 'substance', 'other']::text[])
);
COMMENT ON TABLE issue_letter_sources IS '레터가 쓴 기사 목록(패널·JSON-LD isBasedOn). 자사 기사는 articles를 참조해 제목·링크가 항상 실제 기사와 일치한다';
COMMENT ON COLUMN issue_letter_sources.article_no IS '자사(서울경제) 기사. 제목·URL은 articles에서 읽는다';
COMMENT ON COLUMN issue_letter_sources.external_url IS '외부 매체 기사 URL. 제목·매체와 함께 승인된 경우만';
COMMENT ON COLUMN issue_letter_sources.axes IS '이 기사가 받치는 관점(news/substance/other 배열)';
COMMENT ON COLUMN issue_letter_sources.approved_by IS '외부 기사 인용 승인자(편집장)';
CREATE INDEX IF NOT EXISTS issue_letter_sources_article_idx ON issue_letter_sources (article_no) WHERE article_no IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 5~6. 투표 — 레터마다 질문 1개(최대), 선택지 N개
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issue_letter_polls (
    letter_id  BIGINT        PRIMARY KEY REFERENCES issue_letters(id) ON DELETE CASCADE,
    kind       VARCHAR(16)   NOT NULL DEFAULT 'binary' CHECK (kind IN ('binary', 'emotion')),
    question   TEXT          NOT NULL
);
COMMENT ON TABLE issue_letter_polls IS '레터 하단 투표 질문. 금융 소재는 감정 반응형(emotion)만 허용 — 앱이 검증';

CREATE TABLE IF NOT EXISTS issue_letter_poll_options (
    letter_id  BIGINT        NOT NULL REFERENCES issue_letter_polls(letter_id) ON DELETE CASCADE,
    key        VARCHAR(32)   NOT NULL,
    position   SMALLINT      NOT NULL CHECK (position >= 0),
    label      TEXT          NOT NULL,
    hint       TEXT,
    PRIMARY KEY (letter_id, key),
    UNIQUE (letter_id, position)
);
COMMENT ON TABLE issue_letter_poll_options IS '투표 선택지. key는 영문 식별자(send, wait 등)';


-- ----------------------------------------------------------------------------
-- 7. issue_letter_votes — 투표 기록(Q6: 익명 허용 + 해시만 저장)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issue_letter_votes (
    letter_id   BIGINT        NOT NULL,
    voter_hash  CHAR(64)      NOT NULL,
    option_key  VARCHAR(32)   NOT NULL,
    voted_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (letter_id, voter_hash),
    FOREIGN KEY (letter_id, option_key) REFERENCES issue_letter_poll_options(letter_id, key) ON DELETE CASCADE
);
COMMENT ON TABLE issue_letter_votes IS '투표 기록. 레터당 한 사람 한 표(PK). 식별자는 서버 비밀 솔트로 만든 SHA-256 해시만 저장하고 계정·쿠키 원문은 저장하지 않는다';
COMMENT ON COLUMN issue_letter_votes.voter_hash IS 'SHA-256(솔트 + 로그인 사용자 id 또는 익명 쿠키 id). 되돌릴 수 없다';
-- 결과 집계(레터·선택지별 건수)용
CREATE INDEX IF NOT EXISTS issue_letter_votes_agg_idx ON issue_letter_votes (letter_id, option_key);


-- ----------------------------------------------------------------------------
-- 권한 — 앱 역할(lens_service_app). 시퀀스 USAGE·SELECT 필수(v1.24 사고).
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON issue_letters TO lens_service_app;           -- 삭제는 소프트 삭제(deleted_at)
GRANT SELECT, INSERT, UPDATE, DELETE ON issue_letter_categories TO lens_service_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON issue_letter_sections TO lens_service_app;   -- 저장 시 교체
GRANT SELECT, INSERT, UPDATE, DELETE ON issue_letter_sources TO lens_service_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON issue_letter_polls TO lens_service_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON issue_letter_poll_options TO lens_service_app;
GRANT SELECT, INSERT ON issue_letter_votes TO lens_service_app;               -- 투표는 바꾸지도 지우지도 않는다
GRANT USAGE, SELECT ON SEQUENCE issue_letters_id_seq, issue_letter_sections_id_seq, issue_letter_sources_id_seq TO lens_service_app;

COMMIT;

-- ----------------------------------------------------------------------------
-- 검증 쿼리(적용 후 마스터 계정으로)
--   \d+ issue_letters
--   SELECT table_name, privilege_type FROM information_schema.role_table_grants
--     WHERE grantee = 'lens_service_app' AND table_name LIKE 'issue_letter%' ORDER BY 1,2;
--   -- 제약 동작 확인(롤백 트랜잭션 안에서): 발행 상태에 호수 없이 INSERT 하면 issue_letters_published_chk 위반이어야 한다
--
-- 롤백(데이터 입력 전에만)
--   BEGIN;
--   DROP TABLE IF EXISTS issue_letter_votes, issue_letter_poll_options, issue_letter_polls,
--       issue_letter_sources, issue_letter_sections, issue_letter_categories, issue_letters;
--   COMMIT;
-- ----------------------------------------------------------------------------
