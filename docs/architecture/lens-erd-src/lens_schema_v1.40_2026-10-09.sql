-- ============================================================================
-- v1.40 (2026-10-09) — 이슈 레터 출처를 빅카인즈 보관 기사(external_archives)로 연결
--   배경: 우리 기사 DB(articles)는 2026-02-02부터 약 2만 건, 하루 50건 저장 상한과 3월 공백이 있어 과거·누락 기사를 찾을 수 없다.
--   서울경제 기사는 빅카인즈 검색(1990~, provider=서울경제)으로 찾고, 편집자가 고른 기사를 external_archives 에 보관해 레터 출처가 가리킨다.
--   설계: docs/architecture/lens-erd-src/18-레터출처-빅카인즈-설계.md
-- 2단계 전환: 이 파일은 "추가"만 한다(articles 참조 칸은 그대로). 부캉이의 출처 4건을 옮긴 뒤 v1.41에서 articles·외부 URL 칸을 정리한다.
-- ⚠️ 실행 주체: 마스터 계정(lens_admin). 멱등: IF NOT EXISTS.
-- ============================================================================
BEGIN;

-- 1. external_archives: 주소 조회용 키(쿼리 꼬리표 ?ref= 제거)와 앱 권한
ALTER TABLE external_archives ADD COLUMN IF NOT EXISTS url_key TEXT
    GENERATED ALWAYS AS (split_part(source_url, '?', 1)) STORED;
CREATE INDEX IF NOT EXISTS external_archives_url_key_idx ON external_archives (url_key);
COMMENT ON COLUMN external_archives.url_key IS '원문 주소에서 쿼리(?ref=…)를 뗀 값. 레터 JSON 의 출처 주소를 보관 기사와 대조하는 키';
GRANT SELECT, INSERT, UPDATE ON external_archives TO lens_service_app;

-- 2. issue_letter_sources: 보관 기사 참조 추가
ALTER TABLE issue_letter_sources ADD COLUMN IF NOT EXISTS archive_provider VARCHAR(32);
ALTER TABLE issue_letter_sources ADD COLUMN IF NOT EXISTS archive_id VARCHAR(128);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issue_letter_sources_archive_fkey') THEN
        ALTER TABLE issue_letter_sources
            ADD CONSTRAINT issue_letter_sources_archive_fkey
            FOREIGN KEY (archive_provider, archive_id) REFERENCES external_archives(provider, external_id) ON DELETE RESTRICT;
    END IF;
END $$;
COMMENT ON COLUMN issue_letter_sources.archive_provider IS '보관 기사 제공사(bigkinds). archive_id 와 함께 external_archives 를 가리킨다';
COMMENT ON COLUMN issue_letter_sources.archive_id IS '보관 기사 번호(빅카인즈 news_id)';

-- 3. 출처 종류 제약: 기존(articles 또는 외부URL) 또는 새(보관 기사) 중 정확히 하나. 정리는 v1.41.
ALTER TABLE issue_letter_sources DROP CONSTRAINT IF EXISTS issue_letter_sources_kind_chk;
ALTER TABLE issue_letter_sources ADD CONSTRAINT issue_letter_sources_kind_chk CHECK (
    (CASE WHEN article_no IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN archive_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN external_url IS NOT NULL THEN 1 ELSE 0 END) = 1
    AND (archive_id IS NULL) = (archive_provider IS NULL)
    AND (external_url IS NULL OR (external_title IS NOT NULL AND external_outlet IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS issue_letter_sources_archive_idx ON issue_letter_sources (archive_provider, archive_id) WHERE archive_id IS NOT NULL;

COMMIT;

-- 검증: \d issue_letter_sources / SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='external_archives';
-- 롤백(데이터 이전 전): ALTER TABLE issue_letter_sources DROP COLUMN archive_id, DROP COLUMN archive_provider; (제약은 v1.37 정의로 복원)
