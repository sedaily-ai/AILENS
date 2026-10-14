-- 가져오기 UUID의 재생 요청도 입력에 묶고, 거부 항목의 명시 재시도를 허용한다.
-- 운영 미적용. v1.48~53 이후 적용한다.
BEGIN;
ALTER TABLE user_lens_imports DROP CONSTRAINT IF EXISTS user_lens_imports_user_id_snapshot_hash_key;
CREATE INDEX IF NOT EXISTS lens_imports_snapshot_idx
 ON user_lens_imports(user_id,snapshot_hash,imported_at DESC,import_id DESC);
COMMIT;
