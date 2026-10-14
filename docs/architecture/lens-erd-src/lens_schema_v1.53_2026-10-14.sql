-- 계정 팔로우·명시적 브라우저 북마크 가져오기. 운영 미적용, v1.48~52 이후.
BEGIN;
CREATE TABLE IF NOT EXISTS user_followed_editors (
 user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 editor_id BIGINT NOT NULL REFERENCES letter_editors(id) ON DELETE CASCADE,
 followed_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,editor_id)
);
CREATE TABLE IF NOT EXISTS user_lens_imports (
 user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 import_id UUID NOT NULL, snapshot_hash VARCHAR(64) NOT NULL,
 result JSONB NOT NULL, imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,import_id), UNIQUE(user_id,snapshot_hash)
);
CREATE INDEX IF NOT EXISTS completions_owner_content_idx ON user_content_completions(user_id,content_key);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='lens_service_app') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON user_followed_editors TO lens_service_app;
  GRANT SELECT,INSERT ON user_lens_imports TO lens_service_app;
 END IF;
END $$;
COMMIT;
