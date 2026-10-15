-- v1.55 (2026-10-15) 온보딩 "하루의 틈" 선택 집계. 결과 화면 "다른 분들은 어떻게 볼까요" 분포를 예시 수치 대신 실제 선택으로 보여 준다.
-- 기기당 한 줄(voter_hash 기본키)이고 다시 답하면 덮어쓴다 — 같은 사람이 여러 번 해도 분포가 부풀지 않는다.
-- voter_hash 는 투표·관심과 네임스페이스가 다른 서버 솔트 해시(onboarding:)라 다른 기능의 기록과 이어지지 않는다.
-- 적용: 마스터 계정으로(lens_service_app 에는 DDL 권한 없음). 운영 미적용.
CREATE TABLE IF NOT EXISTS onboarding_choices (
    voter_hash  CHAR(64)    PRIMARY KEY,
    moment_id   VARCHAR(16) NOT NULL CHECK (moment_id IN ('lunch', 'commute-home', 'walk', 'bed')),
    glance_id   VARCHAR(8)  NOT NULL CHECK (glance_id IN ('text', 'comic', 'sound', 'video')),
    chosen_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE onboarding_choices IS '온보딩 상황(moment)·눈이 먼저 가는 곳(glance) 선택. 기기당 최신 1건, voter_hash 는 서버 솔트 해시(개인 식별 불가).';
CREATE INDEX IF NOT EXISTS onboarding_choices_pair_idx ON onboarding_choices (moment_id, glance_id);
GRANT SELECT, INSERT, UPDATE ON onboarding_choices TO lens_service_app;
