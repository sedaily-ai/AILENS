-- ============================================================================
-- v1.45 (2026-10-11) — 레터 에디터(작성자) · 레터↔에디터 · 구독↔에디터
--   목적: "구독한 에디터가 쓴 글이 올라오면 그 구독자에게 보낸다"를 정확히 구현. 에디터는 프론트 상수였고 레터와는 주제 겹침으로만 연결돼 있었다.
--   설계: docs/product/모아쓰기레터/에디터_개인화_기획.md
-- ⚠️ 실행 주체: 마스터 계정(lens_admin). 멱등: IF NOT EXISTS. 선행: v1.37(issue_letters), v1.44(letter_subscriptions)
-- ============================================================================
BEGIN;

-- 레터 에디터(AI 에디터). 이름·역할·소개는 관리자 화면에서 고치고, 코드에는 두지 않는다.
CREATE TABLE IF NOT EXISTS letter_editors (
    id          SMALLSERIAL  PRIMARY KEY,
    slug        VARCHAR(32)  NOT NULL UNIQUE,
    name        VARCHAR(32)  NOT NULL,
    role        VARCHAR(64)  NOT NULL,
    nickname    VARCHAR(32),
    mbti        VARCHAR(8),
    persona_group VARCHAR(2) CHECK (persona_group IN ('NT', 'NF', 'ST', 'SF')),
    intro       TEXT         NOT NULL,
    pitch       TEXT,
    topic_names TEXT[]       NOT NULL DEFAULT '{}',
    image_url   TEXT,
    voice_url   TEXT,
    sort_order  SMALLINT     NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN letter_editors.topic_names IS '담당 분야(주제 사전의 이름). 레터 생성 프롬프트가 레터 주제와 겹치는 에디터를 고르는 근거이고, 에디터 화면의 "담당 분야"에 표시된다';
COMMENT ON TABLE letter_editors IS '레터를 쓰는 AI 에디터. 레터 본문은 모두 같은 중립 편집 원칙을 따르고 에디터는 맡은 관심 영역만 다르다';

-- 레터 ↔ 에디터(작성자). 한 레터에 여러 에디터가 함께 쓸 수 있다. 구독자는 구독한 에디터 중 하나라도 쓴 레터면 받는다.
CREATE TABLE IF NOT EXISTS issue_letter_editors (
    letter_id  BIGINT   NOT NULL REFERENCES issue_letters(id) ON DELETE CASCADE,
    editor_id  SMALLINT NOT NULL REFERENCES letter_editors(id) ON DELETE RESTRICT,
    position   SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (letter_id, editor_id)
);
CREATE INDEX IF NOT EXISTS issue_letter_editors_editor_idx ON issue_letter_editors (editor_id);

-- 구독 ↔ 에디터(구독한 에디터)
CREATE TABLE IF NOT EXISTS letter_subscription_editors (
    subscription_id BIGINT   NOT NULL REFERENCES letter_subscriptions(id) ON DELETE CASCADE,
    editor_id       SMALLINT NOT NULL REFERENCES letter_editors(id) ON DELETE CASCADE,
    PRIMARY KEY (subscription_id, editor_id)
);
CREATE INDEX IF NOT EXISTS letter_subscription_editors_editor_idx ON letter_subscription_editors (editor_id);

GRANT SELECT ON letter_editors TO lens_service_app;
GRANT INSERT, UPDATE ON letter_editors TO lens_service_app;
GRANT USAGE, SELECT ON SEQUENCE letter_editors_id_seq TO lens_service_app;
GRANT SELECT, INSERT, DELETE ON issue_letter_editors, letter_subscription_editors TO lens_service_app;
COMMIT;

-- 롤백(데이터 입력 전, 역순): DROP TABLE letter_subscription_editors, issue_letter_editors, letter_editors;
