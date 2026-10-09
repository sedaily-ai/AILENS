-- ============================================================================
-- v1.39 (2026-10-09) — 이슈 레터의 편집자 FK 제거(작성자·승인자는 문자열 식별자)
--   배경: v1.37 은 issue_letters.author_no/reviewer_no, issue_letter_sources.approved_by 를 editors(employee_no) FK 로 걸었다.
--   그러나 관리자 서비스는 개인 계정 없이 공유 비밀번호 하나로 로그인하고(JWT sub = "admin"), editors 테이블은 비어 있으며
--   어디에서도 쓰이지 않는다(2026-10-09 확인). 그래서 어떤 승인자 값을 넣어도 FK 위반이 나서 발행할 수 없었다.
--   개인 로그인이 생기면 같은 칸에 개인 식별자를 넣는다(컬럼 길이·의미는 그대로).
-- ⚠️ 실행 주체: 마스터 계정(lens_admin). 멱등: IF EXISTS.
-- ============================================================================
BEGIN;

ALTER TABLE issue_letters DROP CONSTRAINT IF EXISTS issue_letters_author_no_fkey;
ALTER TABLE issue_letters DROP CONSTRAINT IF EXISTS issue_letters_reviewer_no_fkey;
ALTER TABLE issue_letter_sources DROP CONSTRAINT IF EXISTS issue_letter_sources_approved_by_fkey;

COMMENT ON COLUMN issue_letters.author_no IS '작성자 식별자(문자열). 지금은 공유 관리자 계정이라 "admin" 또는 NULL(자동 입력). 개인 로그인 도입 후 개인 식별자';
COMMENT ON COLUMN issue_letters.reviewer_no IS '검수·발행 승인자 식별자(문자열). 지금은 "admin". 앱이 role=admin 이고 작성자와 다른지 확인한다';
COMMENT ON COLUMN issue_letter_sources.approved_by IS '외부 기사 인용 승인자 식별자(문자열)';

COMMIT;

-- 검증: SELECT conname FROM pg_constraint WHERE conrelid IN ('issue_letters'::regclass,'issue_letter_sources'::regclass) AND contype='f';
--   → issue_letters 에는 FK 없음, issue_letter_sources 에는 letter_id/article_no FK 만 남아야 한다.
-- 롤백: v1.37 의 FK 정의를 다시 추가한다(editors 가 채워진 뒤에만 의미가 있다).
