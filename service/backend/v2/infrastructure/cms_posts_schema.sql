-- cms_posts — 관리자가 직접 작성한 글 (CMS spec §5.1).
--
-- daily_letters 를 재사용하지 않는 이유:
--   article_id FK(원본 기사 필수) / UNIQUE(date, editor_id)(하루 1건) / mbti_group NOT NULL
--   세 제약이 모두 수동 글과 충돌한다. UNIQUE 는 Editor Pick 의 중복 삽입 방지 장치라
--   풀 수 없다.
--
-- 적용 (idempotent — 재실행 안전):
--   cd service/backend && python3 v2/scripts/apply_cms_posts_schema.py

CREATE TABLE IF NOT EXISTS cms_posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT UNIQUE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'published', 'archived')),
    channels        TEXT[] NOT NULL DEFAULT '{}',
    publish_date    DATE NOT NULL,
    mbti_group      CHAR(2) CHECK (mbti_group IS NULL
                                   OR mbti_group IN ('NT', 'NF', 'ST', 'SF')),
    editor_id       TEXT,
    headline        TEXT NOT NULL,
    subtitle        TEXT,
    closing_line    TEXT,
    body_inline     JSONB NOT NULL DEFAULT '{}'::jsonb,
    cover_image_url TEXT,
    created_by      TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cms_posts_pub
    ON cms_posts (publish_date DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cms_posts_channels
    ON cms_posts USING GIN (channels);

CREATE INDEX IF NOT EXISTS idx_cms_posts_status
    ON cms_posts (status) WHERE deleted_at IS NULL;
