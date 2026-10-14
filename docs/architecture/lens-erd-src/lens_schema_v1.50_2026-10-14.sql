-- completion-v1: 완료/스탬프/배지 원장. 운영 미적용. v1.48/49 이후 적용.
BEGIN;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC CHECK(duration_seconds>0 AND duration_seconds<=86400);
ALTER TABLE user_content_sessions ADD COLUMN IF NOT EXISTS completion_rules JSONB NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS active_ms BIGINT NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS scroll_ratio NUMERIC NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS viewed_panel_ids JSONB NOT NULL DEFAULT '[]',
 ADD COLUMN IF NOT EXISTS consumed_ranges JSONB NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS content_reward_groups (
 content_key VARCHAR(96) PRIMARY KEY CHECK(content_key ~ '^(publication|issue_letter):[1-9][0-9]*$'),
 group_key VARCHAR(96) CHECK(group_key IS NULL OR group_key ~ '^[a-z][a-z0-9_]*:[A-Za-z0-9-]+$'), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE content_reward_groups IS '편집 확인한 동일 이슈 매핑. 명시적 NULL은 보상 대기. publication 기본 그룹은 자체 ID, 이슈 레터 기본은 대기';
CREATE TABLE IF NOT EXISTS user_content_completions (
 session_id UUID PRIMARY KEY REFERENCES user_content_sessions(id) ON DELETE CASCADE,
 user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 content_key VARCHAR(96) NOT NULL, group_key VARCHAR(96), format VARCHAR(16) NOT NULL,
 primary_category VARCHAR(32), completed_at TIMESTAMPTZ NOT NULL, completed_day DATE NOT NULL,
 rule_version VARCHAR(32) NOT NULL, first_completion BOOLEAN NOT NULL DEFAULT false,
 qualifying_revisit BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS completions_owner_day_idx ON user_content_completions(user_id,completed_day);
CREATE INDEX IF NOT EXISTS completions_owner_group_idx ON user_content_completions(user_id,group_key,completed_at);
CREATE TABLE IF NOT EXISTS user_content_first_completions (
 user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE, group_key VARCHAR(96) NOT NULL,
 session_id UUID NOT NULL REFERENCES user_content_completions(session_id), completed_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(user_id,group_key)
);
CREATE TABLE IF NOT EXISTS user_daily_stamps (
 user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE, stamp_day DATE NOT NULL,
 awarded_at TIMESTAMPTZ NOT NULL, source_session_id UUID NOT NULL REFERENCES user_content_completions(session_id),
 PRIMARY KEY(user_id,stamp_day)
);
CREATE TABLE IF NOT EXISTS user_weekly_badges (
 user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE, week_start DATE NOT NULL,
 badge_id VARCHAR(32) NOT NULL CHECK(badge_id IN ('steady_week','discovery_week','revisit_week')),
 earned_at TIMESTAMPTZ NOT NULL, rule_version VARCHAR(32) NOT NULL,
 PRIMARY KEY(user_id,week_start,badge_id)
);
CREATE TABLE IF NOT EXISTS content_completion_coverage (
 singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton), started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO content_completion_coverage(singleton) VALUES(true) ON CONFLICT DO NOTHING;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='lens_service_app') THEN
  GRANT SELECT ON content_reward_groups,content_completion_coverage TO lens_service_app;
  GRANT SELECT,INSERT,UPDATE,DELETE ON user_content_completions,user_content_first_completions,user_daily_stamps,user_weekly_badges TO lens_service_app;
 END IF;
END $$;
COMMIT;
