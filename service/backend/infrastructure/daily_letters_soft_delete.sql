-- daily_letters 소프트 삭제 (CMS 3단계).
-- nullable 추가라 기존 행·파이프라인 INSERT 에 영향 없다.
--
-- 하드 삭제를 쓰지 않는 이유: 파이프라인 산출물과 Bedrock 토큰 기록(bedrock_usage)까지
-- 사라진다. "삭제 = 화면에서 내리는 것" 원칙을 cms_posts 와 동일하게 유지한다.
--
-- 적용: cd service/backend && python3 v2/scripts/apply_letters_soft_delete.py

ALTER TABLE daily_letters ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_daily_letters_live
    ON daily_letters (letter_date DESC) WHERE deleted_at IS NULL;
