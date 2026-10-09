-- ============================================================================
-- v1.44 (2026-10-09) — 이메일 구독·발송
--   설계 문서: docs/architecture/lens-erd-src/19-독자관심-구독-설계.md (Phase 2)
-- ⚠️ 실행 주체: 마스터 계정(lens_admin). 멱등: IF NOT EXISTS. 선행: v1.42·v1.43 불필요(독립), issue_letters 필요
-- ============================================================================
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


-- 롤백(데이터 입력 전, 역순): DROP TABLE email_suppressions, letter_send_item_letters, letter_send_items, letter_sends, letter_subscription_interests, letter_subscriptions;
