-- v1.46 (2026-10-12) 1기사 레터 투표. 레터 본문 안의 "투표" 칸(보기 ①~⑨)에 독자가 한 번 투표하고 집계를 본다.
-- 모아쓰기 레터 투표(issue_letter_votes)와 별개: 1기사 글은 본문이 텍스트라 투표 정의 테이블이 없고,
-- 보기는 화면이 본문에서 읽어 번호(o1~o9)로 저장한다. 중복 투표는 (slug, voter_hash) 기본키로 막는다.
-- 적용: 마스터 계정으로(lens_service_app 에는 DDL 권한 없음).
CREATE TABLE IF NOT EXISTS post_votes (
    slug        VARCHAR(255) NOT NULL REFERENCES publications(slug) ON DELETE CASCADE,
    voter_hash  CHAR(64)     NOT NULL,
    option_key  VARCHAR(4)   NOT NULL CHECK (option_key ~ '^o[1-9]$'),
    voted_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (slug, voter_hash)
);
COMMENT ON TABLE post_votes IS '1기사 레터 투표. voter_hash 는 서버 솔트 해시(개인 식별 불가). 보기 번호만 저장하고 문구는 본문이 정본.';
CREATE INDEX IF NOT EXISTS post_votes_slug_idx ON post_votes (slug, option_key);
GRANT SELECT, INSERT ON post_votes TO lens_service_app;
