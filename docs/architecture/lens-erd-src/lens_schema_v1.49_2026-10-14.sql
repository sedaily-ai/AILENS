-- 이용 신호 전용. 완료/리워드 테이블 아님. 운영 미적용.
BEGIN;
CREATE TABLE IF NOT EXISTS user_content_views (
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_key VARCHAR(96) NOT NULL CHECK (content_key ~ '^(publication|issue_letter):[1-9][0-9]*$'),
    last_seen_at TIMESTAMPTZ NOT NULL,
    origin VARCHAR(16) NOT NULL DEFAULT 'observed' CHECK (origin='observed'),
    PRIMARY KEY(user_id,content_key)
);
CREATE INDEX IF NOT EXISTS user_content_views_owner_seen_idx ON user_content_views(user_id,last_seen_at DESC);
CREATE TABLE IF NOT EXISTS user_content_sessions (
    id UUID PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_key VARCHAR(96) NOT NULL CHECK (content_key ~ '^(publication|issue_letter):[1-9][0-9]*$'),
    format VARCHAR(16) NOT NULL CHECK (format IN ('letter','webtoon','podcast','video')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    last_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_seq>=0),
    visible_ms BIGINT NOT NULL DEFAULT 0 CHECK (visible_ms>=0),
    rule_version VARCHAR(32) NOT NULL DEFAULT 'visible-v1'
);
CREATE INDEX IF NOT EXISTS user_content_sessions_owner_started_idx ON user_content_sessions(user_id,started_at DESC);
CREATE TABLE IF NOT EXISTS user_content_events (
    event_id UUID PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES user_content_sessions(id) ON DELETE CASCADE,
    session_seq INTEGER NOT NULL CHECK (session_seq>0),
    payload_hash CHAR(64) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    result JSONB NOT NULL,
    UNIQUE(session_id,session_seq)
);
CREATE INDEX IF NOT EXISTS user_content_events_owner_received_idx ON user_content_events(user_id,received_at DESC);
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lens_service_app') THEN
        GRANT SELECT,INSERT,UPDATE,DELETE ON user_content_views,user_content_sessions,user_content_events TO lens_service_app;
    END IF;
END $$;
COMMIT;
