-- daily_letters — Core 2.5 Editor Pick 결과 저장.
-- 매일 KST 05:30 에 Editor Pick Lambda 가 4 row 씩 추가.
-- v2 articles + article_versions 와 별도 테이블 (read pattern 다름).
--
-- 마이그레이션:
--   psql ... -f backend/v2/infrastructure/daily_letters_schema.sql
-- 또는 RDS Query Editor 에서 본 파일 내용 그대로 실행.
--
-- 모든 마이그레이션은 additive (.clauderules #8). DROP/ALTER DROP 금지.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS daily_letters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    letter_date     DATE NOT NULL,
    editor_id       TEXT NOT NULL,
    mbti_group      CHAR(2) NOT NULL CHECK (mbti_group IN ('NT', 'NF', 'ST', 'SF')),
    article_id      TEXT NOT NULL REFERENCES articles(news_id) ON DELETE CASCADE,
    secondary_article_ids TEXT[] NOT NULL DEFAULT '{}',
    mode            CHAR(1) NOT NULL DEFAULT 'A' CHECK (mode IN ('A', 'C')),
    archetype       TEXT,
    theme           TEXT,
    headline        TEXT NOT NULL,
    subtitle        TEXT,
    closing_line    TEXT,
    body_s3_uri     TEXT,        -- 본문은 S3 (sedaily-mbti-article-body-v2-dev/letters/{date}/{editor_id}.json)
    body_inline     JSONB,       -- body S3 다운로드 실패 fallback. 4~5 단락 배열 + key_points 등 포함.
    keywords        JSONB,       -- [{term, explain}, ...]
    bedrock_usage   JSONB,       -- input/output tokens 등 (관찰성)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (letter_date, editor_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_letters_date
    ON daily_letters (letter_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_letters_date_group
    ON daily_letters (letter_date DESC, mbti_group);

COMMENT ON TABLE daily_letters IS
    'Core 2.5 Editor Pick 결과. 일 4 row (4 에디터 × 1 letter). UNIQUE(letter_date, editor_id) 로 idempotent 재실행 안전.';

COMMENT ON COLUMN daily_letters.mode IS
    'A=4 에디터 다른 기사, C=1 기사 4 해석. mode=C 일 때 article_id 가 4 row 모두 같음.';

COMMENT ON COLUMN daily_letters.body_inline IS
    'body_s3_uri 가 NULL 이거나 fetch 실패 시 fallback. orchestrator JSON 그대로: {body: [...], key_points: [...]}.';
