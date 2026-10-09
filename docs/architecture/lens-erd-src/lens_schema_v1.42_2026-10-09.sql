-- ============================================================================
-- v1.42 (2026-10-09) — 독자 관심·구독 (초안, 미적용)
--   설계 문서: docs/architecture/lens-erd-src/19-독자관심-구독-설계.md
--   레터가 수백 편 쌓이고 독자가 늘어난 상태를 기준으로 한 구조다. 한 번에 다 만들지 않고 단계(Phase 0~3)로 나눠 적용한다.
--   Phase 0 (레터 주제 태그): topics, issue_letter_topics
--   Phase 1 (독자 관심): interest_bundles(+topics/categories), reader_interests
--   Phase 2 (이메일 구독·발송): letter_subscriptions(+interests), letter_sends, letter_send_items(+letters), email_suppressions
-- ⚠️ 실행 주체: 마스터 계정(lens_admin). 멱등: IF NOT EXISTS. 단계별로 나눠 적용할 수 있게 구역을 분리했다.
-- ============================================================================

-- ────────────────────────── Phase 0 — 레터 주제 태그 ──────────────────────────
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

-- ────────────────────────── Phase 1 — 독자 관심 ──────────────────────────
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

-- ────────────────────────── Phase 2 — 이메일 구독·발송 ──────────────────────────
BEGIN;

-- 기존 subscriptions 는 "지면(section) 1면 뉴스레터"에 묶여 있어(newsletter_id NOT NULL) 레터 구독과 섞지 않는다. 기존 구독자는 새 동의를 받아 옮긴다.
CREATE TABLE IF NOT EXISTS letter_subscriptions (
    id                 BIGSERIAL    PRIMARY KEY,
    email              VARCHAR(255) NOT NULL,
    email_norm         VARCHAR(255) GENERATED ALWAYS AS (lower(btrim(email))) STORED,
    status             VARCHAR(16)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'unsubscribed', 'suppressed')),
    frequency          VARCHAR(16)  NOT NULL DEFAULT 'daily' CHECK (frequency IN ('instant', 'daily', 'weekly')),
    send_hour          SMALLINT     NOT NULL DEFAULT 8 CHECK (send_hour BETWEEN 8 AND 20),
    consent_at         TIMESTAMPTZ  NOT NULL,
    consent_version    VARCHAR(32)  NOT NULL,
    confirm_token      VARCHAR(64)  NOT NULL UNIQUE,
    unsubscribe_token  VARCHAR(64)  NOT NULL UNIQUE,
    reader_hash        CHAR(64),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    confirmed_at       TIMESTAMPTZ,
    cancelled_at       TIMESTAMPTZ
);
COMMENT ON TABLE letter_subscriptions IS '레터 이메일 구독. 가입(pending) → 이메일 확인(active) 이중 확인. 광고성 정보 전송 동의 시각·약관 버전을 보관한다';
COMMENT ON COLUMN letter_subscriptions.send_hour IS '발송 시각(시, KST). 야간(21시~8시) 발송 제한을 CHECK 로 강제한다(8~20)';
COMMENT ON COLUMN letter_subscriptions.reader_hash IS '같은 기기의 익명 관심 설정과 잇는 값(선택). 이메일과 관심 설정을 따로 보관한다';
CREATE UNIQUE INDEX IF NOT EXISTS letter_subscriptions_email_uq ON letter_subscriptions (email_norm) WHERE status IN ('pending', 'active');
CREATE INDEX IF NOT EXISTS letter_subscriptions_due_idx ON letter_subscriptions (frequency, send_hour) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS letter_subscription_interests (
    subscription_id BIGINT      NOT NULL REFERENCES letter_subscriptions(id) ON DELETE CASCADE,
    interest_type   VARCHAR(16) NOT NULL CHECK (interest_type IN ('category', 'topic')),
    interest_key    VARCHAR(64) NOT NULL,
    PRIMARY KEY (subscription_id, interest_type, interest_key)
);
CREATE INDEX IF NOT EXISTS letter_subscription_interests_key_idx ON letter_subscription_interests (interest_type, interest_key);

-- 발송 회차와 수신자별 결과. (회차, 구독) 유일 제약으로 같은 메일을 두 번 보내지 않는다(멱등).
CREATE TABLE IF NOT EXISTS letter_sends (
    id            BIGSERIAL   PRIMARY KEY,
    kind          VARCHAR(16) NOT NULL CHECK (kind IN ('instant', 'daily', 'weekly', 'manual')),
    send_date     DATE        NOT NULL,
    send_hour     SMALLINT    NOT NULL CHECK (send_hour BETWEEN 8 AND 20),
    target_count  INTEGER     NOT NULL DEFAULT 0,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ,
    UNIQUE (kind, send_date, send_hour)
);
CREATE TABLE IF NOT EXISTS letter_send_items (
    id              BIGSERIAL   PRIMARY KEY,
    send_id         BIGINT      NOT NULL REFERENCES letter_sends(id) ON DELETE CASCADE,
    subscription_id BIGINT      REFERENCES letter_subscriptions(id) ON DELETE SET NULL,
    email           VARCHAR(255) NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'bounced', 'complained')),
    message_id      VARCHAR(128),
    error           TEXT,
    sent_at         TIMESTAMPTZ,
    opened_at       TIMESTAMPTZ,
    UNIQUE (send_id, subscription_id)
);
CREATE TABLE IF NOT EXISTS letter_send_item_letters (
    item_id   BIGINT   NOT NULL REFERENCES letter_send_items(id) ON DELETE CASCADE,
    letter_id BIGINT   NOT NULL REFERENCES issue_letters(id) ON DELETE RESTRICT,
    position  SMALLINT NOT NULL,
    PRIMARY KEY (item_id, letter_id)
);
COMMENT ON TABLE letter_send_item_letters IS '한 통의 메일(다이제스트)에 어떤 레터가 어떤 순서로 들어갔는지. 클릭·오픈을 레터별로 분석하는 근거';

-- 반송·수신 거부 신고로 더는 보내면 안 되는 주소(구독이 지워져도 남는다)
CREATE TABLE IF NOT EXISTS email_suppressions (
    email_norm VARCHAR(255) PRIMARY KEY,
    reason     VARCHAR(16)  NOT NULL CHECK (reason IN ('bounce', 'complaint', 'manual')),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON letter_subscriptions TO lens_service_app;
GRANT USAGE, SELECT ON SEQUENCE letter_subscriptions_id_seq TO lens_service_app;
GRANT SELECT, INSERT, DELETE ON letter_subscription_interests TO lens_service_app;
GRANT SELECT, INSERT, UPDATE ON letter_sends, letter_send_items TO lens_service_app;
GRANT SELECT, INSERT ON letter_send_item_letters TO lens_service_app;
GRANT USAGE, SELECT ON SEQUENCE letter_sends_id_seq, letter_send_items_id_seq TO lens_service_app;
GRANT SELECT, INSERT ON email_suppressions TO lens_service_app;
COMMIT;

-- 롤백(데이터 입력 전, 역순): DROP TABLE email_suppressions, letter_send_item_letters, letter_send_items, letter_sends,
--   letter_subscription_interests, letter_subscriptions, reader_interests, interest_bundle_items, interest_bundles,
--   issue_letter_topics, topics;
