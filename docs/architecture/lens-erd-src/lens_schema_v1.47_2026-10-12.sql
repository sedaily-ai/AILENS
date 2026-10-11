-- v1.47 (2026-10-12) 투표 다시 선택. 한 기기 한 표는 그대로 두고, 이미 한 투표의 보기를 바꿀 수 있게 UPDATE 권한을 준다.
-- (v1.37 은 "투표는 바꾸지도 지우지도 않는다"로 SELECT, INSERT 만 허용했다 — 사용자 결정으로 변경 허용, 삭제는 여전히 불가.)
-- 적용: 마스터 계정으로(lens_service_app 에는 DDL 권한 없음). 서버 배포는 이 적용 뒤에 한다(ON CONFLICT DO UPDATE 는 UPDATE 권한이 있어야 동작).
GRANT UPDATE ON post_votes TO lens_service_app;
GRANT UPDATE ON issue_letter_votes TO lens_service_app;
