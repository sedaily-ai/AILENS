-- ============================================================================
-- v1.38 (2026-10-09) — issue_letter_categories 를 사이트 분류 slug 기준으로 교체
--   배경: v1.37 은 분류를 categories(id) FK 로 걸었으나 categories 는 옛 7분류(증시·부동산·산업·금융·정책·국제·재테크·문화)다.
--   사이트가 실제로 쓰는 9분류(시그널·부동산·경제·금융·산업·정치·사회·국제·문화, 코드 shared/constants/econCategories.ts)의
--   '사회'·'시그널' 등을 저장할 수 없다. 분류의 정본은 사이트 코드이므로 slug 문자열로 저장하고 앱이 검증한다.
--   설계 문서: docs/architecture/lens-erd-src/17-이슈레터-설계.md
-- ⚠️ 실행 주체: 마스터 계정(lens_admin). 테이블이 비어 있을 때만 적용된다(데이터가 있으면 중단).
-- ============================================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM issue_letter_categories) THEN
        RAISE EXCEPTION 'issue_letter_categories 에 데이터가 있어 교체를 중단합니다';
    END IF;
END $$;

DROP TABLE IF EXISTS issue_letter_categories;

CREATE TABLE issue_letter_categories (
    letter_id      BIGINT       NOT NULL REFERENCES issue_letters(id) ON DELETE CASCADE,
    category_slug  VARCHAR(32)  NOT NULL CHECK (category_slug ~ '^[a-z][a-z0-9-]{1,31}$'),
    is_primary     BOOLEAN      NOT NULL DEFAULT FALSE,
    PRIMARY KEY (letter_id, category_slug)
);
COMMENT ON TABLE issue_letter_categories IS '레터의 분류. 주 분류 1개 + 보조 N개. 필터는 둘 다 매칭';
COMMENT ON COLUMN issue_letter_categories.category_slug IS '사이트 분류 slug(markets·property·economy·finance·industry·politics·national·international·culture). 허용 목록은 앱(issue_letters_repo.SITE_CATEGORIES)이 검증한다 — categories 테이블은 옛 7분류라 쓰지 않는다';
CREATE UNIQUE INDEX issue_letter_categories_primary_uq ON issue_letter_categories (letter_id) WHERE is_primary;
CREATE INDEX issue_letter_categories_slug_idx ON issue_letter_categories (category_slug, letter_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON issue_letter_categories TO lens_service_app;

COMMIT;

-- 검증
--   \d issue_letter_categories
--   SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='lens_service_app' AND table_name='issue_letter_categories' ORDER BY 1;
-- 롤백: v1.37 의 issue_letter_categories 정의로 되돌린다(데이터 입력 전에만).
