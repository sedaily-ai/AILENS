-- 개인화 Web Push. 운영 미적용. v1.48/49/50 이후 적용.
BEGIN;
CREATE TABLE IF NOT EXISTS user_notification_preferences (
 user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 preferences JSONB NOT NULL, revision BIGINT NOT NULL CHECK(revision>0), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_notification_consents (
 user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 channel VARCHAR(16) NOT NULL DEFAULT 'web_push' CHECK(channel='web_push'), granted BOOLEAN NOT NULL DEFAULT false,
 policy_version VARCHAR(64) NOT NULL, agreed_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(NOT granted OR agreed_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS user_notification_consent_events (
 id BIGSERIAL PRIMARY KEY,user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 granted BOOLEAN NOT NULL, policy_version VARCHAR(64) NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_push_subscriptions (
 id UUID PRIMARY KEY,user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 endpoint_hash CHAR(64) NOT NULL UNIQUE, subscription_encrypted TEXT NOT NULL,encryption_key_version VARCHAR(64) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT true, simulated BOOLEAN NOT NULL DEFAULT false,
 expires_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS push_owner_active_idx ON user_push_subscriptions(user_id,active);
CREATE TABLE IF NOT EXISTS user_notification_deliveries (
 id UUID PRIMARY KEY,user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 schedule_date DATE NOT NULL,schedule_timezone VARCHAR(64) NOT NULL,mode VARCHAR(16) NOT NULL CHECK(mode IN ('dry_run','live')),
 status VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','done','canceled','unknown','failed')),
 payload JSONB NOT NULL,preferences_revision BIGINT NOT NULL,consent_version VARCHAR(64) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),sent_at TIMESTAMPTZ,simulated_at TIMESTAMPTZ,
 UNIQUE(user_id,schedule_date,mode)
);
CREATE TABLE IF NOT EXISTS user_notification_delivery_targets (
 delivery_id UUID NOT NULL REFERENCES user_notification_deliveries(id) ON DELETE CASCADE,
 subscription_id UUID NOT NULL REFERENCES user_push_subscriptions(id) ON DELETE CASCADE,
 status VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','accepted','simulated','gone','canceled','retry','unknown','failed')),
 attempt_count INTEGER NOT NULL DEFAULT 0,lease_token UUID,lease_until TIMESTAMPTZ,next_attempt_at TIMESTAMPTZ,
 last_error_code VARCHAR(64),processed_at TIMESTAMPTZ,PRIMARY KEY(delivery_id,subscription_id)
);
CREATE INDEX IF NOT EXISTS push_target_due_idx ON user_notification_delivery_targets(status,next_attempt_at,lease_until);
CREATE INDEX IF NOT EXISTS push_deliveries_owner_created_idx ON user_notification_deliveries(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS content_followup_links (
 source_content_key VARCHAR(96) NOT NULL CHECK(source_content_key ~ '^(publication|issue_letter):[1-9][0-9]*$'),
 target_content_key VARCHAR(96) NOT NULL CHECK(target_content_key ~ '^(publication|issue_letter):[1-9][0-9]*$'),
 editor_approved BOOLEAN NOT NULL DEFAULT false,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(source_content_key,target_content_key),CHECK(source_content_key<>target_content_key)
);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='lens_service_app') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON user_notification_preferences,user_notification_consents,user_notification_consent_events,user_push_subscriptions,user_notification_deliveries,user_notification_delivery_targets TO lens_service_app;
  GRANT USAGE,SELECT ON SEQUENCE user_notification_consent_events_id_seq TO lens_service_app;
  GRANT SELECT ON content_followup_links TO lens_service_app;
 END IF;
END $$;
COMMIT;
