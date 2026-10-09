-- ============================================================================
-- v1.43 (2026-10-09) — 독자 관심·관심 묶음 (초안, 미적용)
--   설계 문서: docs/architecture/lens-erd-src/19-독자관심-구독-설계.md (Phase 1)
-- ⚠️ 실행 주체: 마스터 계정(lens_admin). 멱등: IF NOT EXISTS. 선행: v1.42
-- ============================================================================
BEGIN;

-- 관심 묶음 프리셋: 기획서의 8개 페르소나를 "가상 인물"이 아니라 "관심 묶음"으로 옮긴 것. 독자 화면에는 묶음 이름만 나간다(예: 주식·ETF·금리·환율).
CREATE TABLE IF NOT EXISTS interest_bundles (
    id          SMALLSERIAL  PRIMARY KEY,
    slug        VARCHAR(64)  NOT NULL UNIQUE,
    name        VARCHAR(64)  NOT NULL,
    description TEXT,
    sort_order  SMALLINT     NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);
COMMENT ON TABLE interest_bundles IS '독자가 한 번에 고르는 관심 묶음 프리셋. 선택하면 아래 주제·분류가 관심으로 채워지고 이후 독자가 개별 조정할 수 있다';

CREATE TABLE IF NOT EXISTS interest_bundle_items (
    bundle_id     SMALLINT    NOT NULL REFERENCES interest_bundles(id) ON DELETE CASCADE,
    interest_type VARCHAR(16) NOT NULL CHECK (interest_type IN ('category', 'topic')),
    interest_key  VARCHAR(64) NOT NULL,
    PRIMARY KEY (bundle_id, interest_type, interest_key)
);
COMMENT ON COLUMN interest_bundle_items.interest_key IS 'interest_type 이 category 면 사이트 분류 slug, topic 이면 topics.slug';

-- 익명 독자의 관심. 식별자는 투표와 같은 기기 식별자(localStorage UUID)를 "관심용 네임스페이스"로 따로 해시한 값이라 투표 기록과 연결되지 않는다.
CREATE TABLE IF NOT EXISTS reader_interests (
    reader_hash   CHAR(64)    NOT NULL,
    interest_type VARCHAR(16) NOT NULL CHECK (interest_type IN ('category', 'topic')),
    interest_key  VARCHAR(64) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (reader_hash, interest_type, interest_key)
);
COMMENT ON TABLE reader_interests IS '익명 독자(기기)의 관심 분야·주제. 개인 식별 정보는 없고, 이 기기의 목록 정렬과 추천 이유에만 쓴다. 계정이 생기면 계정으로 옮긴다';
CREATE INDEX IF NOT EXISTS reader_interests_key_idx ON reader_interests (interest_type, interest_key);

GRANT SELECT ON interest_bundles, interest_bundle_items TO lens_service_app;
GRANT INSERT, UPDATE, DELETE ON interest_bundles, interest_bundle_items TO lens_service_app;
GRANT USAGE, SELECT ON SEQUENCE interest_bundles_id_seq TO lens_service_app;
GRANT SELECT, INSERT, DELETE ON reader_interests TO lens_service_app;   -- 관심 설정은 통째로 교체(삭제 후 삽입)
COMMIT;


-- 롤백(데이터 입력 전): DROP TABLE reader_interests, interest_bundle_items, interest_bundles;
