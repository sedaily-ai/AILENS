-- v1.57 (2026-10-20) 나의 LENS '저장한 기사'. 기사(publications)를 계정에 저장하고 내 서랍에서 다시 본다.
-- 레터 북마크(v1.48 user_letter_bookmarks)와 같은 모양이다. 플레이어별 로컬 북마크(브라우저 저장)는 같은 날 제거했고, 그 값은 옮기지 않는다.
-- 비공개·삭제된 기사도 저장 행은 보존해 사용자가 해제할 수 있다(hard delete만 cascade).
-- 적용: 마스터 계정으로(lens_service_app 에는 DDL 권한 없음). scripts/account_schema.py apply → check 순서로 적용하고, psql로 직접 적용했어도 check는 꼭 실행한다. 운영 미적용.
-- 다시 적용해도 된다(IF NOT EXISTS·조건부 GRANT).
BEGIN;
-- psql 직접 적용 때도 users·publications 잠금을 오래 기다리며 쓰기를 막지 않게 한다(account_schema.py 연결 설정과 같은 값).
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS user_article_bookmarks (
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    publication_id BIGINT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, publication_id)
);
COMMENT ON TABLE user_article_bookmarks IS '나의 LENS 저장한 기사. 계정당 기사 1건 1행, 최신 저장순 목록.';
CREATE INDEX IF NOT EXISTS user_article_bookmarks_owner_saved_idx
    ON user_article_bookmarks (user_id, saved_at DESC, publication_id DESC);
-- 기사를 실제로 지울 때(ON DELETE CASCADE) 표 전체를 훑지 않게 한다.
CREATE INDEX IF NOT EXISTS user_article_bookmarks_publication_idx
    ON user_article_bookmarks (publication_id);
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lens_service_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON user_article_bookmarks TO lens_service_app;
    ELSE
        RAISE WARNING 'lens_service_app 역할이 없어 user_article_bookmarks 권한을 주지 않았어요. 서비스 역할을 만든 뒤 이 파일을 다시 적용하세요.';
    END IF;
END $$;
COMMIT;
