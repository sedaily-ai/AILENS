-- 대시보드 리뷰 보완: 한정 worker batch가 같은 계정만 검사하지 않도록 회전 시각 기록.
-- 운영 미적용. v1.48/49/50/51 이후 적용한다. 기존 설정 revision/updated_at은 바꾸지 않는다.
BEGIN;
ALTER TABLE user_notification_preferences ADD COLUMN IF NOT EXISTS scan_checked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS notification_scan_rotation_idx ON user_notification_preferences(scan_checked_at NULLS FIRST,user_id);
COMMIT;
