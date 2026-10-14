-- 나의 LENS 계정 관심·레터 북마크. 운영 미적용: 로컬 검증 후 별도 마이그레이션.
BEGIN;
CREATE TABLE IF NOT EXISTS user_lens_preferences (
    user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    interests JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(interests) = 'array' AND jsonb_array_length(interests) <= 40),
    minutes SMALLINT NOT NULL DEFAULT 0 CHECK (minutes IN (0,5,10)),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_letter_bookmarks (
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issue_letter_id BIGINT NOT NULL REFERENCES issue_letters(id) ON DELETE CASCADE,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
    PRIMARY KEY (user_id, issue_letter_id)
);
CREATE INDEX IF NOT EXISTS user_letter_bookmarks_owner_saved_idx
    ON user_letter_bookmarks (user_id, saved_at DESC, issue_letter_id DESC);
-- soft-deleted/unpublished 레터는 원래 저장 행을 보존해 사용자가 해제 가능.
-- hard delete는 원문 없는 고아 북마크를 남기지 않는다.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lens_service_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON user_lens_preferences, user_letter_bookmarks TO lens_service_app;
    END IF;
END $$;
COMMIT;
