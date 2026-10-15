-- 알림 발송 전 후속 관계 잠금. 운영 미적용, v1.48~54 이후 마이그레이션 역할로 적용.
-- FOR SHARE에는 UPDATE 권한이 필요하므로 조회 전용 앱 역할에 쓰기 권한 대신 잠금 함수만 제공한다.
BEGIN;
CREATE OR REPLACE FUNCTION public.lock_notification_followup_sources(source_keys TEXT[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    PERFORM 1 FROM public.content_followup_links f
    WHERE f.source_content_key = ANY(source_keys)
    ORDER BY f.source_content_key, f.target_content_key
    FOR SHARE OF f;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_notification_followup_sources(TEXT[]) FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lens_service_app') THEN
        GRANT EXECUTE ON FUNCTION public.lock_notification_followup_sources(TEXT[]) TO lens_service_app;
    END IF;
END $$;
COMMIT;
