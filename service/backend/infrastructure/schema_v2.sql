-- =============================================================================
-- AI LENS v2 — pgvector Storage Hub schema  (v2.0)
-- =============================================================================
-- Target DB:      PostgreSQL 16.6 on RDS (sedaily-mbti-pgvector-v2-dev)
-- Extensions:     vector (pgvector), pgcrypto (gen_random_uuid)
-- Idempotent:     All CREATE statements use IF NOT EXISTS. Safe to re-run.
--
-- Tables:
--   articles            Original sources. status-tracked through pipeline:
--                       raw -> transformed -> (optionally) failed.
--   article_versions    4 MBTI rewrites per article (NT/NF/ST/SF).
--                       UNIQUE(news_id, mbti_type) enforces the 1:4 invariant.
--   user_profiles       Per-user MBTI + category weights + preference embedding.
--   user_interactions   Per-event log (click/dwell/scroll/skip/react/rate) used
--                       for Stage 2 ranking (AVG/COUNT FILTER over columns).
--
-- Vector dimension:  1024 (Titan V2 embeddings, normalize=True -> cosine == L2).
-- Vector index:      ivfflat, lists=100 (initial). 3 vector columns total:
--                      articles.embedding
--                      article_versions.embedding
--                      user_profiles.preference_embedding
--                    Consider switching to HNSW once any table exceeds ~1M
--                    rows (lower recall loss at the cost of build time). See
--                    backend/v2/CLAUDE.md Section 6.
--
-- NOTE: If you edit this file, re-run
--           python3 v2/infrastructure/init_pgvector_v2.py
--       to apply incremental DDL. CREATE ... IF NOT EXISTS makes additions
--       safe; column drops or CHECK changes require an explicit migration
--       script (see .clauderules #8: migrations must be additive).
-- =============================================================================

-- 1. EXTENSIONS --------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- 2. articles ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS articles (
    news_id         TEXT          PRIMARY KEY,
    status          TEXT          NOT NULL CHECK (status IN ('raw','transformed','failed')),
    title           TEXT          NOT NULL,
    category        TEXT,
    published_at    TIMESTAMPTZ,
    embedding       vector(1024),
    metadata        JSONB         NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_articles_status
    ON articles (status);
CREATE INDEX IF NOT EXISTS idx_articles_category_published
    ON articles (category, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_embedding_cosine
    ON articles USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 3. article_versions --------------------------------------------------------
CREATE TABLE IF NOT EXISTS article_versions (
    version_id      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    news_id         TEXT          NOT NULL REFERENCES articles(news_id) ON DELETE CASCADE,
    mbti_type       CHAR(2)       NOT NULL CHECK (mbti_type IN ('NT','NF','ST','SF')),
    title           TEXT          NOT NULL,
    body            TEXT          NOT NULL,
    embedding       vector(1024),
    metadata        JSONB         NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (news_id, mbti_type)
);

CREATE INDEX IF NOT EXISTS idx_article_versions_news_id
    ON article_versions (news_id);
CREATE INDEX IF NOT EXISTS idx_article_versions_embedding_cosine
    ON article_versions USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 4. user_profiles -----------------------------------------------------------
-- mbti_type stores the full 16-value MBTI (e.g. 'INTJ'). The 4-group code
-- (NT/NF/ST/SF) can be derived as SUBSTRING(mbti_type FROM 2 FOR 2). Storing
-- the group alone would be lossy; the 2-byte/row cost is negligible.
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id                 TEXT          PRIMARY KEY,
    mbti_type               CHAR(4)       CHECK (mbti_type IS NULL OR mbti_type IN (
                                              'INTJ','INTP','ENTJ','ENTP',
                                              'INFJ','INFP','ENFJ','ENFP',
                                              'ISTJ','ISTP','ESTJ','ESTP',
                                              'ISFJ','ISFP','ESFJ','ESFP'
                                          )),
    category_weights        JSONB         NOT NULL DEFAULT '{}'::jsonb,
    preference_embedding    vector(1024),
    created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_preference_cosine
    ON user_profiles USING ivfflat (preference_embedding vector_cosine_ops) WITH (lists = 100);

-- 5. user_interactions -------------------------------------------------------
-- mbti_type here is the GROUP (2-char) — which version of the article the
-- user consumed. Measured signals (dwell_ms, scroll_pct, rating,
-- reaction_type) are top-level columns so Stage 2 ranking can AVG/COUNT
-- FILTER them without JSONB path casts. Anything else goes into metadata.
CREATE TABLE IF NOT EXISTS user_interactions (
    id                  BIGSERIAL     PRIMARY KEY,
    user_id             TEXT          NOT NULL,
    news_id             TEXT          NOT NULL,
    mbti_type           CHAR(2)       CHECK (mbti_type IS NULL OR mbti_type IN ('NT','NF','ST','SF')),
    interaction_type    TEXT          NOT NULL CHECK (interaction_type IN
                                        ('click','dwell','scroll','skip','react','rate')),
    dwell_ms            INTEGER       CHECK (dwell_ms IS NULL OR dwell_ms >= 0),
    scroll_pct          SMALLINT      CHECK (scroll_pct IS NULL OR (scroll_pct BETWEEN 0 AND 100)),
    rating              SMALLINT      CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
    reaction_type       TEXT,
    metadata            JSONB         NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_interactions_user_created
    ON user_interactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_interactions_news_created
    ON user_interactions (news_id, created_at DESC);

-- 6. article_selections -----------------------------------------------------
-- Phase 2.5 Selection layer. Selector Lambda writes per-MBTI scores per
-- article per day; Transform Lambda polls selected=TRUE rows; Feed API
-- serves selected=TRUE AND transformed_at IS NOT NULL rows.
--
-- A single article can be selected for multiple MBTI groups on the same
-- day (different rows, one per (news_id, mbti_type, selection_date)).
-- Multi-run merge-and-rerank within a day uses ON CONFLICT UPSERT on the
-- UNIQUE constraint, then rerank_selections flips the selected flag.
CREATE TABLE IF NOT EXISTS article_selections (
    id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    news_id                     TEXT          NOT NULL REFERENCES articles(news_id) ON DELETE CASCADE,
    mbti_type                   CHAR(2)       NOT NULL CHECK (mbti_type IN ('NT','NF','ST','SF')),
    selection_date              DATE          NOT NULL,
    mbti_score                  REAL          NOT NULL CHECK (mbti_score BETWEEN 0 AND 10),
    quality_score               REAL          CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 10),
    composite_score             REAL          NOT NULL,
    selected                    BOOLEAN       NOT NULL DEFAULT FALSE,
    scored_at                   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    transformed_at              TIMESTAMPTZ,
    -- Phase 5 retry-limit cost cap. Validator-rejected (article, mbti) pairs
    -- otherwise loop forever in the 5-min transform polling. Each
    -- transform_validation_failure increments this; once it reaches
    -- threshold/transform-retry-limit (default 5) the row is force-released
    -- by stamping transformed_at = now(). The feed query naturally hides such
    -- rows because article_versions has no row for them (INNER JOIN).
    validation_failure_count    INTEGER       NOT NULL DEFAULT 0,
    UNIQUE (news_id, mbti_type, selection_date)
);

CREATE INDEX IF NOT EXISTS idx_selections_ranking
    ON article_selections (selection_date, mbti_type, composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_selections_transform_queue
    ON article_selections (scored_at)
    WHERE selected = TRUE AND transformed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_selections_feed
    ON article_selections (mbti_type, selection_date DESC, composite_score DESC)
    WHERE selected = TRUE AND transformed_at IS NOT NULL;
