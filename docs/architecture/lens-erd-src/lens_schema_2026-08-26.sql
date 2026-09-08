-- =============================================================
-- AI LENS · PostgreSQL 스키마
-- 대상: PostgreSQL 16+ (Aurora PostgreSQL / RDS PostgreSQL)
-- 작성: 2026-08-26 · 6단계 산출물
-- 테이블 50 · 뷰 1 · 확장 3
--
-- 식별자는 영문, 설명은 COMMENT로 단다.
-- 한글 식별자는 매번 큰따옴표를 붙여야 하므로 쓰지 않는다.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS vector;

-- 한국어 전문검색 설정은 미확정이다(5단계 3절).
-- 아래 search_vector는 'simple' 설정으로 만들어 두었다.
-- 'simple'은 형태소를 나누지 않으므로 조사가 붙은 채 색인된다.
-- RDS에서 pg_bigm 사용이 가능한지 확인한 뒤,
--   가능하면  → pg_bigm GIN 인덱스로 교체 (search_vector 칸은 제거)
--   불가하면  → pg_trgm GIN 인덱스로 보완 (아래에 이미 포함)
-- 어느 쪽이든 테이블 구조는 바뀌지 않는다.


-- =============================================================
-- 1. 분류 · 지면
-- =============================================================

CREATE TABLE sections (
    id              SMALLSERIAL PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL UNIQUE,
    sort_order      SMALLINT     NOT NULL DEFAULT 0,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE sections IS '지면. 지면 1면·증권 1면·산업 1면·시그널 1면';

INSERT INTO sections (name, sort_order) VALUES
    ('지면 1면', 1), ('증권 1면', 2), ('산업 1면', 3), ('시그널 1면', 4);


CREATE TABLE categories (
    id              SMALLSERIAL PRIMARY KEY,
    name            VARCHAR(64)  NOT NULL UNIQUE,
    slug            VARCHAR(64)  NOT NULL UNIQUE,
    sort_order      SMALLINT     NOT NULL DEFAULT 0,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE
);
COMMENT ON TABLE categories IS '주제 분류';

INSERT INTO categories (name, slug, sort_order) VALUES
    ('증시','stock',1), ('부동산','realestate',2), ('산업','industry',3),
    ('금융·정책','finance',4), ('국제','world',5), ('재테크','invest',6),
    ('문화','culture',7);


-- =============================================================
-- 2. 편집자
-- =============================================================

CREATE TABLE editors (
    employee_no     VARCHAR(32)  PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    name            VARCHAR(64)  NOT NULL,
    role            VARCHAR(16)  NOT NULL DEFAULT 'editor'
                    CHECK (role IN ('admin','editor')),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by      VARCHAR(32)  REFERENCES editors(employee_no) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ
);
COMMENT ON TABLE editors IS '편집자. 관리자가 계정을 만든다';
COMMENT ON COLUMN editors.created_by IS '어느 관리자가 등록했나. 최초 관리자는 NULL';


-- =============================================================
-- 3. 원천 기사
-- =============================================================

CREATE TABLE articles (
    article_no      VARCHAR(32)  PRIMARY KEY,
    title           TEXT         NOT NULL,
    subtitle        TEXT,
    body            TEXT,
    reporter_name   VARCHAR(64),
    section_id      SMALLINT     REFERENCES sections(id) ON DELETE RESTRICT,
    published_at    TIMESTAMPTZ  NOT NULL,
    source_url      TEXT,
    keywords        TEXT[]       NOT NULL DEFAULT '{}',
    hashtags        TEXT[]       NOT NULL DEFAULT '{}',
    body_hash       CHAR(64),
    collected_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    search_vector   tsvector GENERATED ALWAYS AS (
                        setweight(to_tsvector('simple', coalesce(title,'')),    'B') ||
                        setweight(to_tsvector('simple', coalesce(subtitle,'')), 'C') ||
                        setweight(to_tsvector('simple', coalesce(body,'')),     'C')
                    ) STORED
);
COMMENT ON TABLE articles IS '서울경제신문 원천 기사';
COMMENT ON COLUMN articles.reporter_name IS '기자를 독립 테이블로 두지 않는다(3단계 판정). 표시용';

CREATE INDEX articles_published_idx  ON articles (published_at DESC);
CREATE INDEX articles_section_idx    ON articles (section_id, published_at DESC);
CREATE INDEX articles_fts_idx        ON articles USING GIN (search_vector);
CREATE INDEX articles_keywords_idx   ON articles USING GIN (keywords);
CREATE INDEX articles_hashtags_idx   ON articles USING GIN (hashtags);
CREATE INDEX articles_title_trgm_idx ON articles USING GIN (title gin_trgm_ops);


CREATE TABLE article_images (
    id              BIGSERIAL PRIMARY KEY,
    article_no      VARCHAR(32) NOT NULL REFERENCES articles(article_no) ON DELETE CASCADE,
    position        SMALLINT    NOT NULL,
    url             TEXT        NOT NULL,
    caption         TEXT,
    UNIQUE (article_no, position)
);

CREATE TABLE article_related_news (
    id              BIGSERIAL PRIMARY KEY,
    article_no      VARCHAR(32) NOT NULL REFERENCES articles(article_no) ON DELETE CASCADE,
    position        SMALLINT    NOT NULL,
    title           TEXT,
    url             TEXT        NOT NULL,
    UNIQUE (article_no, position)
);

CREATE TABLE article_categories (
    article_no      VARCHAR(32) NOT NULL REFERENCES articles(article_no) ON DELETE CASCADE,
    category_id     SMALLINT    NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    is_primary      BOOLEAN     NOT NULL DEFAULT FALSE,
    PRIMARY KEY (article_no, category_id)
);
COMMENT ON TABLE article_categories IS '한 기사가 여러 주제에 걸칠 수 있다(다대다)';
CREATE INDEX article_categories_reverse_idx ON article_categories (category_id, article_no);


CREATE TABLE article_embeddings (
    article_no      VARCHAR(32) PRIMARY KEY REFERENCES articles(article_no) ON DELETE CASCADE,
    embedding       vector(1024) NOT NULL,
    model_id        VARCHAR(128) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE article_embeddings IS '기사 벡터. 목록 조회가 벡터를 끌고 다니지 않도록 분리';
COMMENT ON COLUMN article_embeddings.model_id IS '모델이 바뀌면 재생성 대상 식별용. 반드시 남긴다';
CREATE INDEX article_embeddings_hnsw_idx ON article_embeddings
    USING hnsw (embedding vector_cosine_ops);


CREATE TABLE external_archives (
    provider        VARCHAR(32)  NOT NULL,
    external_id     VARCHAR(128) NOT NULL,
    published_at    TIMESTAMPTZ  NOT NULL,
    title           TEXT         NOT NULL,
    press           VARCHAR(64),
    reporter_name   VARCHAR(64),
    summary         TEXT,
    source_url      TEXT,
    fetched_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, external_id)
);
COMMENT ON TABLE external_archives IS
    '외부 아카이브(빅카인즈 등)에서 받아온 과거 기사. articles와 출처가 달라 참조하지 않는다.
     본문 전문 저장 범위는 제공사 약관 확인 후 결정한다. 지금은 요약만 둔다';
CREATE INDEX external_archives_date_idx ON external_archives (provider, published_at DESC);


-- =============================================================
-- 4. 발행물 · 형식콘텐츠  ← 설계의 중심
-- =============================================================

CREATE TABLE publications (
    id              BIGSERIAL PRIMARY KEY,
    slug            VARCHAR(255) NOT NULL UNIQUE,
    title           TEXT         NOT NULL,
    subtitle        TEXT,
    question        TEXT,
    cover_image_url TEXT,
    section_id      SMALLINT     REFERENCES sections(id) ON DELETE RESTRICT,
    category_id     SMALLINT     REFERENCES categories(id) ON DELETE RESTRICT,
    editor_no       VARCHAR(32)  REFERENCES editors(employee_no) ON DELETE SET NULL,
    run_id          BIGINT,
    source_url      TEXT UNIQUE,
    bgm_url         TEXT,
    status          VARCHAR(16)  NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','published','archived')),
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    search_vector   tsvector GENERATED ALWAYS AS (
                        setweight(to_tsvector('simple', coalesce(title,'')),    'A') ||
                        setweight(to_tsvector('simple', coalesce(subtitle,'')), 'B') ||
                        setweight(to_tsvector('simple', coalesce(question,'')), 'B')
                    ) STORED
);
COMMENT ON TABLE publications IS
    '발행물. 이슈와 편집자의 글을 하나로 본다(3단계 판정 ①).
     형식콘텐츠 0개=카드형, 1개=편집자의 글, 4개=이슈';
COMMENT ON COLUMN publications.source_url IS
    '원문 주소. UNIQUE로 같은 기사의 중복 발행을 구조로 막는다.
     DDB 시절 contains() 풀스캔으로 확인하던 것을 제약으로 대체';
COMMENT ON COLUMN publications.editor_no IS '파이프라인이 만든 것은 NULL';
COMMENT ON COLUMN publications.deleted_at IS '실제로 지우지 않는다. 이 칸이 채워지면 지워진 것';

CREATE INDEX publications_published_idx ON publications (published_at DESC)
    WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX publications_category_idx  ON publications (category_id, published_at DESC)
    WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX publications_section_idx   ON publications (section_id, published_at DESC)
    WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX publications_editor_idx    ON publications (editor_no, updated_at DESC);
CREATE INDEX publications_deleted_idx   ON publications (deleted_at)
    WHERE deleted_at IS NOT NULL;
CREATE INDEX publications_fts_idx       ON publications USING GIN (search_vector);
CREATE INDEX publications_title_trgm_idx ON publications USING GIN (title gin_trgm_ops);


CREATE TABLE publication_articles (
    publication_id  BIGINT      NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    article_no      VARCHAR(32) NOT NULL REFERENCES articles(article_no) ON DELETE CASCADE,
    is_primary      BOOLEAN     NOT NULL DEFAULT FALSE,
    position        SMALLINT    NOT NULL DEFAULT 0,
    PRIMARY KEY (publication_id, article_no)
);
COMMENT ON TABLE publication_articles IS '발행물↔기사 다대다. is_primary가 중심 기사';
CREATE INDEX publication_articles_reverse_idx ON publication_articles (article_no);


CREATE TABLE publication_slug_history (
    old_slug        VARCHAR(255) PRIMARY KEY,
    publication_id  BIGINT       NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    changed_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE publication_slug_history IS
    '제목이 바뀌면 주소가 바뀐다. 옛 주소로 들어온 독자·검색엔진을 위해 남긴다';
CREATE INDEX publication_slug_history_pub_idx ON publication_slug_history (publication_id);


CREATE TABLE renditions (
    id              BIGSERIAL PRIMARY KEY,
    publication_id  BIGINT      NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    format          VARCHAR(16) NOT NULL
                    CHECK (format IN ('letter','webtoon','podcast','video')),
    status          VARCHAR(16) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','generating','ready','failed')),
    label           TEXT,
    duration_sec    INTEGER,
    sequence_no     INTEGER,
    attempts        SMALLINT    NOT NULL DEFAULT 0,
    last_error      TEXT,
    next_retry_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (publication_id, format)
);
COMMENT ON TABLE renditions IS
    '형식콘텐츠. UNIQUE(publication_id, format)이 채널 복제를 구조로 막는다.
     DDB 시절 한 기사가 -webtoon/-video/-podcast 4행으로 흩어지던 구조를 대체';
COMMENT ON COLUMN renditions.sequence_no IS '웹툰 순번. 다른 형식은 NULL';
COMMENT ON COLUMN renditions.status IS
    '형식마다 상태를 따로 갖는다. 영상만 없는 채로 나머지 셋을 먼저 공개할 수 있다.
     ※ 형식 단위 재시도가 실제로 되려면 애플리케이션이 형식별로 나눠 호출해야 한다.
        스키마만으로는 해결되지 않는다';

CREATE INDEX renditions_format_idx ON renditions (format, created_at DESC)
    WHERE status = 'ready';
CREATE INDEX renditions_retry_idx  ON renditions (next_retry_at)
    WHERE status = 'failed';
CREATE UNIQUE INDEX renditions_webtoon_seq_idx ON renditions (sequence_no)
    WHERE format = 'webtoon' AND sequence_no IS NOT NULL;


CREATE TABLE rendition_blocks (
    id              BIGSERIAL PRIMARY KEY,
    rendition_id    BIGINT      NOT NULL REFERENCES renditions(id) ON DELETE CASCADE,
    position        SMALLINT    NOT NULL,
    block_type      VARCHAR(16) NOT NULL DEFAULT 'text'
                    CHECK (block_type IN ('text','image','quote')),
    content         TEXT,
    image_url       TEXT,
    UNIQUE (rendition_id, position)
);
COMMENT ON TABLE rendition_blocks IS
    '레터 본문 블록. 편집자의 글도 이 테이블을 쓴다.
     block_type=image가 "본문에 글과 이미지를 섞어 넣는다"를 흡수한다';

CREATE INDEX rendition_blocks_fts_idx ON rendition_blocks
    USING GIN (to_tsvector('simple', coalesce(content,'')));


CREATE TABLE webtoon_panels (
    id              BIGSERIAL PRIMARY KEY,
    rendition_id    BIGINT   NOT NULL REFERENCES renditions(id) ON DELETE CASCADE,
    position        SMALLINT NOT NULL,
    image_url       TEXT     NOT NULL,
    dialogue        TEXT,
    UNIQUE (rendition_id, position)
);
COMMENT ON COLUMN webtoon_panels.dialogue IS
    '말풍선 대사. 짧고 구어체라 검색 대상에서 제외한다(3단계 결정). 칸만 둔다';


CREATE TABLE media_assets (
    id              BIGSERIAL PRIMARY KEY,
    rendition_id    BIGINT      NOT NULL UNIQUE REFERENCES renditions(id) ON DELETE CASCADE,
    media_type      VARCHAR(16) NOT NULL CHECK (media_type IN ('audio','video')),
    file_url        TEXT        NOT NULL,
    thumbnail_url   TEXT,
    transcript      TEXT,
    search_vector   tsvector GENERATED ALWAYS AS (
                        to_tsvector('simple', coalesce(transcript,''))
                    ) STORED
);
COMMENT ON TABLE media_assets IS
    '음성·영상을 하나로 본다(3단계 판정 ②). 차이는 thumbnail_url뿐';
COMMENT ON COLUMN media_assets.transcript IS
    '대본·자막. 레터에 없는 표현이 있으므로 검색 대상에 포함한다';
CREATE INDEX media_assets_fts_idx ON media_assets USING GIN (search_vector);


CREATE TABLE publication_revisions (
    id              BIGSERIAL PRIMARY KEY,
    publication_id  BIGINT      NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    editor_no       VARCHAR(32) REFERENCES editors(employee_no) ON DELETE SET NULL,
    change_type     VARCHAR(32) NOT NULL,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX publication_revisions_pub_idx ON publication_revisions (publication_id, changed_at DESC);


-- =============================================================
-- 5. 부가 콘텐츠
-- =============================================================

CREATE TABLE glossary_terms (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL UNIQUE,
    description     TEXT         NOT NULL,
    created_by_type VARCHAR(16)  NOT NULL DEFAULT 'human'
                    CHECK (created_by_type IN ('human','auto')),
    editor_no       VARCHAR(32)  REFERENCES editors(employee_no) ON DELETE SET NULL,
    run_id          BIGINT,
    is_reviewed     BOOLEAN      NOT NULL DEFAULT FALSE,
    reviewed_by     VARCHAR(32)  REFERENCES editors(employee_no) ON DELETE SET NULL,
    reviewed_at     TIMESTAMPTZ,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    search_vector   tsvector GENERATED ALWAYS AS (
                        setweight(to_tsvector('simple', coalesce(name,'')),        'A') ||
                        setweight(to_tsvector('simple', coalesce(description,'')), 'C')
                    ) STORED,
    CHECK ( (created_by_type = 'human' AND editor_no IS NOT NULL)
         OR (created_by_type = 'auto'  AND run_id    IS NOT NULL) )
);
COMMENT ON TABLE glossary_terms IS '용어 해설. 사람과 자동 둘 다 만들 수 있다';
CREATE INDEX glossary_terms_fts_idx  ON glossary_terms USING GIN (search_vector);
CREATE INDEX glossary_terms_trgm_idx ON glossary_terms USING GIN (name gin_trgm_ops);
CREATE INDEX glossary_terms_review_idx ON glossary_terms (created_at DESC)
    WHERE created_by_type = 'auto' AND NOT is_reviewed;


CREATE TABLE rendition_terms (
    rendition_id    BIGINT   NOT NULL REFERENCES renditions(id) ON DELETE CASCADE,
    term_id         BIGINT   NOT NULL REFERENCES glossary_terms(id) ON DELETE CASCADE,
    position        SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (rendition_id, term_id)
);


CREATE TABLE quizzes (
    id              BIGSERIAL PRIMARY KEY,
    quiz_date       DATE        NOT NULL,
    position        SMALLINT    NOT NULL DEFAULT 1,
    question        TEXT        NOT NULL,
    created_by_type VARCHAR(16) NOT NULL DEFAULT 'human'
                    CHECK (created_by_type IN ('human','auto')),
    editor_no       VARCHAR(32) REFERENCES editors(employee_no) ON DELETE SET NULL,
    run_id          BIGINT,
    is_reviewed     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (quiz_date, position)
);
COMMENT ON TABLE quizzes IS '오늘의 단어 퀴즈. 응답은 저장하지 않는다(제품 결정)';

CREATE TABLE quiz_options (
    id              BIGSERIAL PRIMARY KEY,
    quiz_id         BIGINT   NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    position        SMALLINT NOT NULL,
    content         TEXT     NOT NULL,
    is_correct      BOOLEAN  NOT NULL DEFAULT FALSE,
    UNIQUE (quiz_id, position)
);


-- =============================================================
-- 6. 회원
-- =============================================================

CREATE TABLE users (
    id              VARCHAR(64)  PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    name            VARCHAR(128),
    image_url       TEXT,
    status          VARCHAR(16)  NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','withdrawn')),
    joined_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE users IS '회원';
COMMENT ON COLUMN users.id IS
    'Cognito sub. 자체 가입이든 소셜이든 하나의 sub로 통일된다.
     이메일은 바뀔 수 있으므로 식별자로 쓰지 않는다';


CREATE TABLE user_identities (
    provider        VARCHAR(16)  NOT NULL
                    CHECK (provider IN ('cognito','google','kakao','naver','apple')),
    provider_uid    VARCHAR(255) NOT NULL,
    user_id         VARCHAR(64)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    linked_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, provider_uid)
);
COMMENT ON TABLE user_identities IS
    '한 회원이 여러 로그인 수단을 갖는다. 카카오·네이버·애플 추가 시 행만 늘어난다';
CREATE INDEX user_identities_user_idx ON user_identities (user_id);


CREATE TABLE anonymous_visitors (
    id              VARCHAR(64) PRIMARY KEY,
    ip_hash         CHAR(64),
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON COLUMN anonymous_visitors.ip_hash IS 'SHA-256이므로 64. MD5 길이(32)로 두지 않는다';


-- =============================================================
-- 7. 내 서랍 · 추천
-- =============================================================

CREATE TABLE sentence_stats (
    sentence_hash   CHAR(64) PRIMARY KEY,
    content         TEXT     NOT NULL,
    rendition_id    BIGINT   REFERENCES renditions(id) ON DELETE SET NULL,
    saved_count     INTEGER  NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE sentence_stats IS
    '"다른 사람들이 담은 문장" 표출용. 많이 담은 순 정렬을 매번 세지 않기 위해 저장한다';
CREATE INDEX sentence_stats_popular_idx ON sentence_stats (saved_count DESC)
    WHERE saved_count > 1;


CREATE TABLE user_archives (
    id              BIGSERIAL PRIMARY KEY,
    user_id         VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rendition_id    BIGINT      REFERENCES renditions(id) ON DELETE SET NULL,
    sentence_hash   CHAR(64)    NOT NULL,
    content         TEXT        NOT NULL,
    saved_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, sentence_hash)
);
COMMENT ON TABLE user_archives IS '내 서랍. 로그인한 회원만 담을 수 있다';
COMMENT ON COLUMN user_archives.content IS
    '정규화를 의도적으로 어긴다. 편집자가 원문을 고쳐도 담은 사람이 본 문장은 남아야 한다';
CREATE INDEX user_archives_calendar_idx ON user_archives (user_id, saved_at DESC);
CREATE INDEX user_archives_hash_idx     ON user_archives (sentence_hash);


CREATE TABLE archive_keywords (
    id              BIGSERIAL PRIMARY KEY,
    archive_id      BIGINT      NOT NULL REFERENCES user_archives(id) ON DELETE CASCADE,
    keyword         VARCHAR(64) NOT NULL,
    weight          NUMERIC(4,3) NOT NULL DEFAULT 1.0
);
CREATE INDEX archive_keywords_archive_idx ON archive_keywords (archive_id);


CREATE TABLE archive_embeddings (
    archive_id      BIGINT PRIMARY KEY REFERENCES user_archives(id) ON DELETE CASCADE,
    embedding       vector(1024) NOT NULL,
    model_id        VARCHAR(128) NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX archive_embeddings_hnsw_idx ON archive_embeddings
    USING hnsw (embedding vector_cosine_ops);


CREATE TABLE recommendations (
    id              BIGSERIAL PRIMARY KEY,
    user_id         VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    article_no      VARCHAR(32) NOT NULL REFERENCES articles(article_no) ON DELETE CASCADE,
    score           NUMERIC(5,4) NOT NULL,
    matched_keywords TEXT[]     NOT NULL DEFAULT '{}',
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE recommendations IS
    '순위는 벡터 유사도 단독. matched_keywords는 "키워드 6개 매칭" 표시용 근거';
CREATE INDEX recommendations_user_idx ON recommendations (user_id, score DESC);


CREATE TABLE user_readings (
    user_id         VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    publication_id  BIGINT      NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    read_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_count      INTEGER     NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, publication_id)
);
COMMENT ON TABLE user_readings IS '추천에서 이미 읽은 글을 빼기 위해 쓴다';


-- =============================================================
-- 8. 조회수
-- =============================================================

CREATE TABLE view_events (
    id              BIGSERIAL,
    publication_id  BIGINT      NOT NULL,
    user_id         VARCHAR(64),
    anon_id         VARCHAR(64),
    dwell_sec       INTEGER,
    scroll_pct      SMALLINT CHECK (scroll_pct BETWEEN 0 AND 100),
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);
COMMENT ON TABLE view_events IS
    '조회 이벤트. 이 시스템에서 가장 빨리 커진다.
     조회수를 직접 UPDATE하지 않고 여기에 쌓은 뒤 주기적으로 합산한다.
     90일 후 파티션째 삭제';

CREATE TABLE view_events_2026_09 PARTITION OF view_events
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE view_events_2026_10 PARTITION OF view_events
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE INDEX view_events_pub_idx ON view_events (publication_id, occurred_at DESC);


CREATE TABLE view_counts (
    publication_id  BIGINT PRIMARY KEY REFERENCES publications(id) ON DELETE CASCADE,
    real_count      BIGINT NOT NULL DEFAULT 0,
    adjustment      BIGINT NOT NULL DEFAULT 0,
    display_count   BIGINT GENERATED ALWAYS AS (real_count + adjustment) STORED,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE view_counts IS
    '실측과 조정을 분리한다. 화면은 display_count만 읽는다';
COMMENT ON COLUMN view_counts.real_count IS
    '합산 배치만 갱신한다. 애플리케이션 계정에는 UPDATE 권한을 주지 않는다.
     ※ 이 규칙은 제약으로 표현할 수 없다. DB 권한으로 처리한다';
CREATE INDEX view_counts_popular_idx ON view_counts (display_count DESC);


CREATE TABLE view_adjustments (
    id              BIGSERIAL PRIMARY KEY,
    publication_id  BIGINT      NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    editor_no       VARCHAR(32) REFERENCES editors(employee_no) ON DELETE SET NULL,
    delta           BIGINT      NOT NULL,
    reason          TEXT,
    adjusted_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE view_adjustments IS '누가 왜 조정했는지 남긴다. 감사 기록';


-- =============================================================
-- 9. 챗봇
-- =============================================================

CREATE TABLE chat_conversations (
    id              UUID PRIMARY KEY,
    user_id         VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    anon_id         VARCHAR(64) REFERENCES anonymous_visitors(id) ON DELETE CASCADE,
    tier            VARCHAR(16) NOT NULL CHECK (tier IN ('anonymous','member')),
    title           TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (num_nonnulls(user_id, anon_id) = 1)
);
COMMENT ON TABLE chat_conversations IS
    '대화. 회원 또는 익명방문자 중 정확히 하나에만 속한다';
COMMENT ON COLUMN chat_conversations.tier IS
    '대화 중 로그인해도 이미 나간 답변이 어느 조건에서 생성됐는지 남아야 한다';
CREATE INDEX chat_conversations_user_idx ON chat_conversations (user_id, updated_at DESC)
    WHERE user_id IS NOT NULL;


CREATE TABLE chat_messages (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id UUID        NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    position        SMALLINT    NOT NULL,
    role            VARCHAR(16) NOT NULL CHECK (role IN ('user','assistant')),
    content         TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (conversation_id, position)
);


CREATE TABLE chat_message_sources (
    id              BIGSERIAL PRIMARY KEY,
    message_id      BIGINT   NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    footnote_no     SMALLINT NOT NULL,
    publication_id  BIGINT   NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    start_pos       INTEGER,
    end_pos         INTEGER,
    UNIQUE (message_id, footnote_no)
);
COMMENT ON TABLE chat_message_sources IS
    '문장별 각주. 발행물을 인용한다(원천 기사가 아니라).
     ※ start_pos/end_pos를 채우려면 답변 생성 시 애플리케이션이 위치를 기록해야 한다';


CREATE TABLE chat_quota_usage (
    subject_type    VARCHAR(16) NOT NULL CHECK (subject_type IN ('user','anon','ip')),
    subject_id      VARCHAR(64) NOT NULL,
    window_date     DATE        NOT NULL,
    message_count   INTEGER     NOT NULL DEFAULT 0,
    token_count     BIGINT      NOT NULL DEFAULT 0,
    PRIMARY KEY (subject_type, subject_id, window_date)
);
COMMENT ON TABLE chat_quota_usage IS
    '날짜를 식별자에 넣어 리셋이 필요 없게 한다. 오래된 것은 삭제';


-- =============================================================
-- 10. 뉴스레터
-- =============================================================

CREATE TABLE newsletters (
    id              SMALLSERIAL PRIMARY KEY,
    section_id      SMALLINT    NOT NULL UNIQUE REFERENCES sections(id) ON DELETE RESTRICT,
    name            VARCHAR(128) NOT NULL,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE
);
COMMENT ON TABLE newsletters IS '지면당 하나. 1면에 해당하는 것만 발송한다';


CREATE TABLE subscriptions (
    id                BIGSERIAL PRIMARY KEY,
    newsletter_id     SMALLINT     NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
    user_id           VARCHAR(64)  REFERENCES users(id) ON DELETE CASCADE,
    email             VARCHAR(255) NOT NULL,
    unsubscribe_token VARCHAR(64)  NOT NULL UNIQUE,
    started_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    cancelled_at      TIMESTAMPTZ,
    UNIQUE (newsletter_id, email)
);
COMMENT ON TABLE subscriptions IS
    '회원일 수도, 이메일만 남긴 사람일 수도 있다. user_id는 NULL 허용';
CREATE INDEX subscriptions_active_idx ON subscriptions (newsletter_id)
    WHERE cancelled_at IS NULL;


CREATE TABLE newsletter_sends (
    id              BIGSERIAL PRIMARY KEY,
    newsletter_id   SMALLINT NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
    publication_id  BIGINT   REFERENCES publications(id) ON DELETE SET NULL,
    send_date       DATE     NOT NULL,
    target_count    INTEGER  NOT NULL DEFAULT 0,
    success_count   INTEGER  NOT NULL DEFAULT 0,
    failure_count   INTEGER  NOT NULL DEFAULT 0,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    UNIQUE (newsletter_id, send_date)
);


CREATE TABLE newsletter_send_items (
    id              BIGSERIAL PRIMARY KEY,
    send_id         BIGINT      NOT NULL REFERENCES newsletter_sends(id) ON DELETE CASCADE,
    subscription_id BIGINT      REFERENCES subscriptions(id) ON DELETE SET NULL,
    email           VARCHAR(255) NOT NULL,
    result          VARCHAR(16) NOT NULL DEFAULT 'sent'
                    CHECK (result IN ('sent','failed','bounced')),
    sent_at         TIMESTAMPTZ,
    opened_at       TIMESTAMPTZ
);
COMMENT ON TABLE newsletter_send_items IS
    '구독이 지워져도 발송 사실은 남는다. email을 복사해 둔다';
CREATE INDEX newsletter_send_items_send_idx ON newsletter_send_items (send_id);


-- =============================================================
-- 11. 파이프라인 · 운영
-- =============================================================

CREATE TABLE pipeline_runs (
    id              BIGSERIAL PRIMARY KEY,
    pipeline_name   VARCHAR(64) NOT NULL,
    trigger_source  VARCHAR(32) NOT NULL DEFAULT 'eventbridge',
    status          VARCHAR(16) NOT NULL DEFAULT 'success'
                    CHECK (status IN ('success','partial','failed')),
    created_count   INTEGER     NOT NULL DEFAULT 0,
    skipped_count   INTEGER     NOT NULL DEFAULT 0,
    failed_count    INTEGER     NOT NULL DEFAULT 0,
    ecs_task_arn    TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ
);
COMMENT ON COLUMN pipeline_runs.ecs_task_arn IS
    'Fargate는 태스크가 끝나면 사라진다. 이 값이 없으면 CloudWatch 로그를 찾아갈 수 없다.
     ECS_CONTAINER_METADATA_URI_V4에서 읽어 기록해야 한다(현재 미구현)';
CREATE INDEX pipeline_runs_started_idx ON pipeline_runs (started_at DESC);


CREATE TABLE pipeline_run_items (
    id              BIGSERIAL PRIMARY KEY,
    run_id          BIGINT      NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
    article_no      VARCHAR(32),
    result          VARCHAR(16) NOT NULL CHECK (result IN ('created','skipped','failed')),
    reason          VARCHAR(64)
);
COMMENT ON COLUMN pipeline_run_items.article_no IS
    '로그 성격이라 FK를 걸지 않는다. 기사가 정리돼도 실패 기록은 남아야 한다';
CREATE INDEX pipeline_run_items_run_idx ON pipeline_run_items (run_id);


CREATE TABLE lens_candidates (
    id              BIGSERIAL PRIMARY KEY,
    article_no      VARCHAR(32)  NOT NULL REFERENCES articles(article_no) ON DELETE CASCADE,
    run_id          BIGINT       REFERENCES pipeline_runs(id) ON DELETE SET NULL,
    score           NUMERIC(4,2) NOT NULL,
    threshold       NUMERIC(4,2) NOT NULL,
    is_selected     BOOLEAN      NOT NULL DEFAULT FALSE,
    scored_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE lens_candidates IS
    '채점 결과를 남긴다. 임계값을 조정할 때 과거 점수 분포가 없으면 감으로 튜닝하게 된다';
CREATE INDEX lens_candidates_article_idx ON lens_candidates (article_no, scored_at DESC);


CREATE TABLE ai_usage_logs (
    id              BIGSERIAL,
    purpose         VARCHAR(16) NOT NULL
                    CHECK (purpose IN ('generate','chat','classify')),
    rendition_id    BIGINT,
    message_id      BIGINT,
    candidate_id    BIGINT,
    model_id        VARCHAR(255) NOT NULL,
    tier            VARCHAR(16),
    input_tokens    INTEGER     NOT NULL DEFAULT 0,
    output_tokens   INTEGER     NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER  NOT NULL DEFAULT 0,
    cache_read_tokens  INTEGER  NOT NULL DEFAULT 0,
    cost_usd        NUMERIC(12,6) NOT NULL DEFAULT 0,
    outcome         VARCHAR(16) NOT NULL DEFAULT 'success'
                    CHECK (outcome IN ('success','refused','failed')),
    error_message   TEXT,
    latency_ms      INTEGER,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, occurred_at),
    CHECK (num_nonnulls(rendition_id, message_id, candidate_id) = 1)
) PARTITION BY RANGE (occurred_at);
COMMENT ON TABLE ai_usage_logs IS
    '생성·대화·채점 비용을 한곳에 모은다. 용도별로 흩으면 매번 UNION이 필요하다.
     대상 셋 중 정확히 하나만 채워진다';
COMMENT ON COLUMN ai_usage_logs.cache_read_tokens IS
    '캐시 토큰을 따로 센다. 합산하면 프롬프트 캐시 최적화 효과를 측정할 수 없다';
COMMENT ON COLUMN ai_usage_logs.cost_usd IS
    'NUMERIC(12,6)으로 전 테이블 통일. 정밀도가 어긋나면 집계 시 반올림 오차가 쌓인다';

CREATE TABLE ai_usage_logs_2026_09 PARTITION OF ai_usage_logs
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE ai_usage_logs_2026_10 PARTITION OF ai_usage_logs
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE INDEX ai_usage_logs_purpose_idx ON ai_usage_logs (purpose, occurred_at DESC);


CREATE TABLE prompts (
    id              SMALLSERIAL PRIMARY KEY,
    name            VARCHAR(64) NOT NULL UNIQUE,
    category        VARCHAR(32)
);

CREATE TABLE prompt_versions (
    id              BIGSERIAL PRIMARY KEY,
    prompt_id       SMALLINT    NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    version         INTEGER     NOT NULL,
    content         TEXT        NOT NULL,
    is_active       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by      VARCHAR(32) REFERENCES editors(employee_no) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (prompt_id, version)
);
CREATE UNIQUE INDEX prompt_versions_active_idx ON prompt_versions (prompt_id)
    WHERE is_active;
COMMENT ON INDEX prompt_versions_active_idx IS '프롬프트당 활성 버전은 하나만';


CREATE TABLE feature_flags (
    name            VARCHAR(64) PRIMARY KEY,
    is_enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    flag_name       VARCHAR(64) REFERENCES feature_flags(name) ON DELETE SET NULL,
    editor_no       VARCHAR(32) REFERENCES editors(employee_no) ON DELETE SET NULL,
    before_value    TEXT,
    after_value     TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE incidents (
    id              VARCHAR(64) PRIMARY KEY,
    mechanism       VARCHAR(64) NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','resolved')),
    severity        VARCHAR(16),
    title           TEXT,
    detail          JSONB       NOT NULL DEFAULT '{}',
    opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ
);
CREATE INDEX incidents_open_idx ON incidents (opened_at DESC) WHERE status = 'open';


-- =============================================================
-- 12. 뒤늦은 외래키 (순환 참조 해소)
-- =============================================================

ALTER TABLE publications
    ADD CONSTRAINT publications_run_fk
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(id) ON DELETE SET NULL;

ALTER TABLE glossary_terms
    ADD CONSTRAINT glossary_terms_run_fk
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(id) ON DELETE SET NULL;

ALTER TABLE quizzes
    ADD CONSTRAINT quizzes_run_fk
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(id) ON DELETE SET NULL;


-- =============================================================
-- 13. 게재용 뷰
-- =============================================================

CREATE VIEW v_live_renditions AS
SELECT
    r.id             AS rendition_id,
    r.format,
    r.duration_sec,
    r.sequence_no,
    p.id             AS publication_id,
    p.slug,
    p.title,
    p.subtitle,
    p.question,
    p.cover_image_url,
    p.published_at,
    c.slug           AS category_slug,
    c.name           AS category_name,
    s.name           AS section_name,
    vc.display_count
FROM renditions r
JOIN publications p ON p.id = r.publication_id
LEFT JOIN categories c  ON c.id  = p.category_id
LEFT JOIN sections   s  ON s.id  = p.section_id
LEFT JOIN view_counts vc ON vc.publication_id = p.id
WHERE r.status = 'ready'
  AND p.status = 'published'
  AND p.deleted_at IS NULL;

COMMENT ON VIEW v_live_renditions IS
    '공개 화면은 이 뷰만 읽는다.
     화면마다 게재 조건을 반복하면 어느 한 곳에서 빠뜨렸을 때 초안이 노출된다.
     조건을 한곳에 모아 사고를 구조로 막는다.
     웹툰·영상·오디오 전용 페이지는 이 뷰를 format으로 거른다';


-- =============================================================
-- 14. 스키마로 막을 수 없는 것 — 운영에서 처리
-- =============================================================
--
-- (1) view_counts.real_count는 사람이 고칠 수 없어야 한다
--     → DB 권한으로 처리한다. 제약으로 표현할 방법이 없다
--       REVOKE UPDATE ON view_counts FROM app_user;
--       GRANT  UPDATE ON view_counts TO   batch_user;
--
-- (2) 형식 단위 재시도
--     → renditions.status/attempts 칸은 있으나, 실제로 형식별 재시도가 되려면
--       파이프라인이 형식별로 나눠 호출해야 한다. 애플리케이션 수정이 선행
--
-- (3) 이슈는 질문을 가져야 한다
--     → 발행물과 편집자의 글을 하나로 본 대가. 데이터로 확인
--
-- (4) 한국어 전문검색
--     → search_vector는 'simple' 설정. pg_bigm 가용 여부 확인 후 교체
--
-- =============================================================
