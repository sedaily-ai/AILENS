-- ============================================================================
-- v1.42 (2026-10-09) — 레터 주제 사전·태그
--   설계 문서: docs/architecture/lens-erd-src/19-독자관심-구독-설계.md (Phase 0)
-- ⚠️ 실행 주체: 마스터 계정(lens_admin). 멱등: IF NOT EXISTS.
-- ============================================================================
BEGIN;

-- 통제된 주제 사전. 자유 입력 태그는 "금리/기준금리/금리인상"처럼 갈라져 집계·추천이 망가지므로, 편집팀이 관리하는 사전 + 별칭으로 정규화한다.
CREATE TABLE IF NOT EXISTS topics (
    id            SMALLSERIAL  PRIMARY KEY,
    slug          VARCHAR(64)  NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
    name          VARCHAR(64)  NOT NULL UNIQUE,
    kind          VARCHAR(16)  NOT NULL DEFAULT 'topic' CHECK (kind IN ('topic', 'company', 'person', 'place')),
    category_slug VARCHAR(32),
    aliases       TEXT[]       NOT NULL DEFAULT '{}',
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE topics IS '레터에 붙이는 주제 사전(통제 어휘). 독자의 관심 설정·구독·추천이 모두 이 목록을 기준으로 한다';
COMMENT ON COLUMN topics.kind IS 'topic 개념(금리·환율) / company 기업 / person 인물 / place 장소';
COMMENT ON COLUMN topics.category_slug IS '대표 사이트 분류(markets·property·…). 없어도 된다. 앱이 SITE_CATEGORIES 로 검증';
COMMENT ON COLUMN topics.aliases IS '같은 주제로 보는 다른 표기(예: 기준금리·금리인상). 템플릿 JSON 의 태그를 이 별칭으로 사전 항목에 맞춘다';
CREATE INDEX IF NOT EXISTS topics_aliases_gin ON topics USING GIN (aliases);

CREATE TABLE IF NOT EXISTS issue_letter_topics (
    letter_id   BIGINT   NOT NULL REFERENCES issue_letters(id) ON DELETE CASCADE,
    topic_id    SMALLINT NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
    is_primary  BOOLEAN  NOT NULL DEFAULT FALSE,
    PRIMARY KEY (letter_id, topic_id)
);
COMMENT ON TABLE issue_letter_topics IS '레터의 주제 태그. 주 주제 1~2개 + 보조 주제. 독자의 관심과 겹치는 정도를 세는 근거';
CREATE INDEX IF NOT EXISTS issue_letter_topics_topic_idx ON issue_letter_topics (topic_id, letter_id);

GRANT SELECT ON topics TO lens_service_app;
GRANT SELECT, INSERT, UPDATE ON topics TO lens_service_app;   -- 관리자 화면이 사전을 편집한다(삭제는 is_active=false)
GRANT USAGE, SELECT ON SEQUENCE topics_id_seq TO lens_service_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON issue_letter_topics TO lens_service_app;
COMMIT;


-- 롤백(데이터 입력 전): DROP TABLE issue_letter_topics, topics;
