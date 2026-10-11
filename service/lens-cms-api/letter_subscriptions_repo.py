"""레터 이메일 구독(가입→이메일 확인→수신거부)과 다이제스트 발송. 설계: docs/architecture/lens-erd-src/19-독자관심-구독-설계.md (Phase 2).

- 이중 확인: 가입하면 pending, 메일의 링크를 열어야 active. 확인 전에는 아무것도 보내지 않는다.
- 응답으로 주소의 가입 여부를 알려 주지 않는다(이미 가입·수신거부 목록이어도 같은 응답).
- 다이제스트: 구독자 관심과 겹치는 최근 레터 중 아직 보내지 않은 것 상위 3편. 겹치는 레터가 없으면 보내지 않는다.
- (회차, 구독) 유일 제약과 회차 (종류, 날짜, 시각) 유일 제약으로 재실행해도 같은 메일이 두 번 나가지 않는다.
"""
from __future__ import annotations

import datetime as dt
import logging
import os
import re
import secrets
from typing import Any, Dict, List, Optional, Tuple

import editors_repo
import interests_repo
import issue_letters_repo
import letter_mail
from db import get_cursor
from letter_errors import LetterError

log = logging.getLogger("letter_subscriptions")

CONSENT_VERSION = "2026-10-10"
FREQUENCIES = ("daily", "weekly")  # DB 는 instant 도 허용하지만 아직 열지 않는다
CONFIRM_TTL = dt.timedelta(hours=48)
RESEND_COOLDOWN = dt.timedelta(minutes=10)
DIGEST_LIMIT = 1  # 한 통에 레터 한 편(본문 전체)을 보낸다. 겹치는 레터가 여럿이어도 한 번에 한 편씩, 다음 발송에 다음 편
DIGEST_WINDOW_DAYS = 14
EMAIL_RE = re.compile(r"^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]{2,}$")
KST = dt.timezone(dt.timedelta(hours=9))


def normalize_email(raw: Any) -> str:
    email = str(raw or "").strip().lower()
    if not email or len(email) > 254 or not EMAIL_RE.match(email):
        raise LetterError("이메일 주소를 확인해 주세요")
    return email


def validate_preferences(frequency: Any, send_hour: Any) -> Tuple[str, int]:
    freq = str(frequency or "daily")
    if freq not in FREQUENCIES:
        raise LetterError("받는 주기는 매일 또는 매주만 고를 수 있어요")
    try:
        hour = int(8 if send_hour is None else send_hour)
    except (TypeError, ValueError):
        raise LetterError("받는 시각이 올바르지 않아요")
    if not 8 <= hour <= 20:
        raise LetterError("받는 시각은 8시~20시 사이에서 고를 수 있어요")
    return freq, hour


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    return f"{local[:2]}***@{domain}"


def new_token() -> str:
    return secrets.token_urlsafe(32)


# ── 가입·확인·수신거부 ────────────────────────────────────────────────────────

def subscribe(email: Any, interests: Any, frequency: Any, send_hour: Any, consent: Any, device_id_hash: Optional[str] = None,
              now: Optional[dt.datetime] = None, editors: Any = None) -> Dict[str, str]:
    if consent is not True:
        raise LetterError("메일 수신에 동의해 주세요")
    addr = normalize_email(email)
    freq, hour = validate_preferences(frequency, send_hour)
    pairs = interests_repo.validate_interest_items(interests if interests is not None else [])
    editor_slugs = editors if editors is not None else []
    if not pairs and not editor_slugs:
        raise LetterError("에디터나 관심 주제를 하나 이상 골라 주세요")
    if not letter_mail.mail_available():
        raise LetterError("지금은 메일 신청을 받지 않고 있어요", 503)
    now = now or dt.datetime.now(dt.timezone.utc)
    to_send: Optional[str] = None
    with get_cursor() as cur:
        missing = interests_repo._known_keys(cur, pairs)
        if missing:
            raise LetterError(f"주제 사전에 없는 관심입니다: {', '.join(missing)}")
        cur.execute("SELECT 1 FROM email_suppressions WHERE email_norm = %s", (addr,))
        if cur.fetchone():
            return {"status": "pending"}  # 반송·신고 주소 — 알리지 않고 보내지 않는다
        cur.execute("SELECT id, status, created_at, confirm_token FROM letter_subscriptions WHERE email_norm = %s AND status IN ('pending','active')", (addr,))
        cur_row = cur.fetchone()
        if cur_row and cur_row["status"] == "active":
            return {"status": "pending"}
        if cur_row:  # 확인 대기 중 — 같은 주소로 너무 자주 메일을 보내지 않는다
            sub_id = cur_row["id"]
            if now - cur_row["created_at"] >= RESEND_COOLDOWN:
                to_send = new_token()
                cur.execute("UPDATE letter_subscriptions SET confirm_token=%s, created_at=%s, frequency=%s, send_hour=%s, consent_at=%s, consent_version=%s, reader_hash=%s WHERE id=%s",
                            (to_send, now, freq, hour, now, CONSENT_VERSION, device_id_hash, sub_id))
            cur.execute("DELETE FROM letter_subscription_interests WHERE subscription_id = %s", (sub_id,))
        else:
            to_send = new_token()
            cur.execute("INSERT INTO letter_subscriptions (email, status, frequency, send_hour, consent_at, consent_version, confirm_token, unsubscribe_token, reader_hash, created_at) "
                        "VALUES (%s,'pending',%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                        (addr, freq, hour, now, CONSENT_VERSION, to_send, new_token(), device_id_hash, now))
            sub_id = cur.fetchone()["id"]
        for t, k in pairs:
            cur.execute("INSERT INTO letter_subscription_interests (subscription_id, interest_type, interest_key) VALUES (%s,%s,%s)", (sub_id, t, k))
        if editor_slugs:
            editors_repo.set_subscription_editors(cur, sub_id, editor_slugs)
    if to_send:
        subject, html_body, text_body = letter_mail.render_confirm(to_send)
        try:
            letter_mail.send_mail(addr, subject, html_body, text_body)
        except Exception:
            log.exception("confirm mail failed")
            raise LetterError("확인 메일을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요", 502)
    return {"status": "pending"}


def confirm(token: Any, now: Optional[dt.datetime] = None) -> Dict[str, str]:
    token = str(token or "").strip()
    if not token or len(token) > 64:
        raise LetterError("확인 링크가 올바르지 않아요", 404)
    now = now or dt.datetime.now(dt.timezone.utc)
    with get_cursor() as cur:
        cur.execute("SELECT id, status, created_at FROM letter_subscriptions WHERE confirm_token = %s", (token,))
        row = cur.fetchone()
        if not row or row["status"] in ("unsubscribed", "suppressed"):
            raise LetterError("확인 링크가 올바르지 않아요", 404)
        if row["status"] == "active":
            return {"status": "active"}
        if now - row["created_at"] > CONFIRM_TTL:
            raise LetterError("확인 링크의 유효 시간이 지났어요. 다시 신청해 주세요", 410)
        cur.execute("UPDATE letter_subscriptions SET status='active', confirmed_at=%s WHERE id=%s", (now, row["id"]))
    return {"status": "active"}


def unsubscribe(token: Any, now: Optional[dt.datetime] = None) -> Dict[str, str]:
    token = str(token or "").strip()
    if not token or len(token) > 64:
        raise LetterError("수신거부 링크가 올바르지 않아요", 404)
    now = now or dt.datetime.now(dt.timezone.utc)
    with get_cursor() as cur:
        cur.execute("SELECT id, status FROM letter_subscriptions WHERE unsubscribe_token = %s", (token,))
        row = cur.fetchone()
        if not row:
            raise LetterError("수신거부 링크가 올바르지 않아요", 404)
        if row["status"] in ("pending", "active"):
            cur.execute("UPDATE letter_subscriptions SET status='unsubscribed', cancelled_at=%s WHERE id=%s", (now, row["id"]))
    return {"status": "unsubscribed"}


def add_suppression(email: Any, reason: str) -> Dict[str, str]:
    """반송·신고·수동 제외. 이후 발송에서 빠지고, 있던 구독은 suppressed 로 바꾼다."""
    addr = normalize_email(email)
    if reason not in ("bounce", "complaint", "manual"):
        raise LetterError("reason 은 bounce/complaint/manual 중 하나여야 합니다")
    with get_cursor() as cur:
        cur.execute("INSERT INTO email_suppressions (email_norm, reason) VALUES (%s,%s) ON CONFLICT (email_norm) DO NOTHING", (addr, reason))
        cur.execute("UPDATE letter_subscriptions SET status='suppressed', cancelled_at=now() WHERE email_norm=%s AND status IN ('pending','active')", (addr,))
    return {"email": mask_email(addr), "reason": reason}


# ── 다이제스트 ────────────────────────────────────────────────────────────────

def pick_digest(interests: set, candidates: List[Dict[str, Any]], already_sent: set, now: dt.datetime, limit: int = DIGEST_LIMIT) -> List[Dict[str, Any]]:
    """관심과 겹치고 아직 이 구독자에게 보내지 않은 레터를 점수순으로 최대 limit 편. 겹치는 것이 없으면 빈 목록."""
    scored = []
    for l in candidates:
        if l["id"] in already_sent:
            continue
        score, reasons = interests_repo.score_letter(interests, l, now)
        if score <= 0:
            continue
        by_topic = any(("topic", t["slug"]) in interests for t in l["topics"])
        scored.append((score, l["published_dt"], {"id": l["id"], "slug": l["slug"], "issue_no": l["issue_no"], "title": l["title"], "deck": l["deck"],
                                                  "reason_text": interests_repo.reason_text(reasons, by_topic)}))
    scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return [s[2] for s in scored[:limit]]


def run_send(kind: str, send_date: dt.date, send_hour: int, dry_run: bool = True, now: Optional[dt.datetime] = None) -> Dict[str, Any]:
    """해당 시각에 받기로 한 활성 구독자에게 다이제스트를 보낸다. dry_run 이면 DB 에 쓰지도, 메일을 보내지도 않고 대상과 담길 레터만 돌려준다.
    weekly 는 월요일에만 대상이 된다. 실제 발송은 8~20시(KST) 사이에서만 허용한다."""
    if kind not in FREQUENCIES:
        raise LetterError("kind 는 daily 또는 weekly 여야 합니다")
    if not 8 <= int(send_hour) <= 20:
        raise LetterError("발송 시각은 8~20시여야 합니다")
    now = now or dt.datetime.now(dt.timezone.utc)
    if kind == "weekly" and send_date.weekday() != 0:
        return {"skipped": "weekly 는 월요일에만 발송합니다", "targets": []}
    if not dry_run and not 8 <= now.astimezone(KST).hour <= 20:
        raise LetterError("야간(21시~8시)에는 발송할 수 없습니다")
    if not dry_run and not letter_mail.mail_enabled():
        raise LetterError("메일 발송 설정(LETTER_MAIL_ENABLED·LETTER_MAIL_FROM)이 꺼져 있어 실제 발송을 할 수 없습니다. dry_run 으로 확인하세요", 409)
    out: List[Dict[str, Any]] = []
    with get_cursor() as cur:
        cur.execute("SELECT id, email, email_norm, unsubscribe_token FROM letter_subscriptions WHERE status='active' AND frequency=%s AND send_hour=%s ORDER BY id", (kind, send_hour))
        subs = cur.fetchall()
        candidates = interests_repo._load_candidates(cur, 80) if subs else []
        cutoff = now - dt.timedelta(days=DIGEST_WINDOW_DAYS)
        candidates = [c for c in candidates if c["published_dt"] >= cutoff]
        cur.execute("SELECT email_norm FROM email_suppressions")
        suppressed = {r["email_norm"] for r in cur.fetchall()}
        plan = []
        for s in subs:
            if s["email_norm"] in suppressed:
                continue
            cur.execute("SELECT interest_type, interest_key FROM letter_subscription_interests WHERE subscription_id=%s", (s["id"],))
            interests = {(r["interest_type"], r["interest_key"]) for r in cur.fetchall()}
            cur.execute("SELECT il.letter_id FROM letter_send_item_letters il JOIN letter_send_items i ON i.id = il.item_id WHERE i.subscription_id=%s AND i.status IN ('sent','queued')", (s["id"],))
            sent = {r["letter_id"] for r in cur.fetchall()}
            letters = pick_digest(interests, candidates, sent, now)
            if letters:
                plan.append((s, letters))
        for s, letters in plan:
            out.append({"email": mask_email(s["email_norm"]), "letters": [l["title"] for l in letters]})
        if dry_run or not plan:
            return {"dry_run": dry_run, "targets": out, "subscribers": len(subs)}
        cur.execute("INSERT INTO letter_sends (kind, send_date, send_hour, target_count) VALUES (%s,%s,%s,%s) ON CONFLICT (kind, send_date, send_hour) DO UPDATE SET target_count = EXCLUDED.target_count RETURNING id",
                    (kind, send_date, send_hour, len(plan)))
        send_id = cur.fetchone()["id"]
        queued = []
        for s, letters in plan:
            cur.execute("INSERT INTO letter_send_items (send_id, subscription_id, email) VALUES (%s,%s,%s) ON CONFLICT (send_id, subscription_id) DO NOTHING RETURNING id", (send_id, s["id"], s["email_norm"]))
            row = cur.fetchone()
            if not row:  # 같은 회차에 이미 처리한 구독 — 다시 보내지 않는다
                continue
            for pos, l in enumerate(letters, 1):
                cur.execute("INSERT INTO letter_send_item_letters (item_id, letter_id, position) VALUES (%s,%s,%s)", (row["id"], l["id"], pos))
            queued.append((row["id"], s, letters))
    results = {"sent": 0, "failed": 0}
    full_cache: Dict[str, Optional[Dict[str, Any]]] = {}
    for item_id, s, letters in queued:
        slug = letters[0]["slug"]
        if slug not in full_cache:
            full_cache[slug] = issue_letters_repo.get_published(slug)
        full = full_cache[slug]
        if not full:  # 그새 내려간 레터 — 보내지 않고 실패로 남긴다
            with get_cursor() as cur:
                cur.execute("UPDATE letter_send_items SET status='failed', error='letter not published' WHERE id=%s", (item_id,))
            results["failed"] += 1
            continue
        subject, html_body, text_body = letter_mail.render_letter(full, letters[0]["reason_text"], s["unsubscribe_token"])
        try:
            mid = letter_mail.send_mail(s["email_norm"], subject, html_body, text_body, letter_mail.unsubscribe_url(s["unsubscribe_token"]))
            status, err = "sent", None
            results["sent"] += 1
        except Exception as e:  # 한 명의 실패가 나머지를 막지 않는다
            mid, status, err = None, "failed", str(e)[:500]
            results["failed"] += 1
            log.exception("digest send failed item=%s", item_id)
        with get_cursor() as cur:
            cur.execute("UPDATE letter_send_items SET status=%s, message_id=%s, error=%s, sent_at=now() WHERE id=%s", (status, mid, err, item_id))
    with get_cursor() as cur:
        cur.execute("UPDATE letter_sends SET finished_at=now() WHERE id=%s", (send_id,))
    return {"dry_run": False, "send_id": send_id, "targets": out, "mail_enabled": letter_mail.mail_enabled(), **results}


# ── 발행 즉시 발송 ─────────────────────────────────────────────────────────────
# 레터가 발행되면 그 레터와 관심이 겹치는 활성 구독자에게 바로 한 통씩 보낸다("올라올 때마다").
#  · 구독자마다 이 레터를 이미 받았으면 건너뛴다(letter_send_item_letters 로 확인) → 재실행해도 중복 없음
#  · 횟수 제한은 두지 않는다(구독한 에디터의 글이 올라오면 그때마다 보낸다)
#  · 야간(21시~8시)에는 보내지 않는다. 야간에 발행되면 다음날 8시 이후 run_pending_instant 가 보낸다
#  · LETTER_AUTO_SEND=1 이고 메일 설정이 켜져 있을 때만 실제로 보낸다(아니면 대상만 계산하는 드라이런)
def _auto_send_enabled() -> bool:
    return os.environ.get("LETTER_AUTO_SEND") == "1" and letter_mail.mail_enabled()


def send_for_letter(letter_id: int, dry_run: Optional[bool] = None, now: Optional[dt.datetime] = None) -> Dict[str, Any]:
    """발행된 레터 하나를, 그 레터를 쓴 에디터를 구독한 활성 구독자에게 보낸다(구독한 에디터 중 하나라도 쓴 글이면 한 통).
    dry_run 이 None 이면 자동 발송 설정(_auto_send_enabled)을 따른다. 횟수 제한은 없고, 같은 레터를 같은 구독자에게 두 번 보내지 않는다."""
    now = now or dt.datetime.now(dt.timezone.utc)
    dry = (not _auto_send_enabled()) if dry_run is None else dry_run
    kst_now = now.astimezone(KST)
    if not dry and not 8 <= kst_now.hour <= 20:
        return {"skipped": "야간에는 보내지 않아요. 다음날 8시 이후에 보내요", "targets": []}
    with get_cursor() as cur:
        cur.execute("SELECT slug, title FROM issue_letters WHERE id=%s AND status='published' AND deleted_at IS NULL", (letter_id,))
        letter_row = cur.fetchone()
        if not letter_row:
            raise LetterError("발행된 레터가 아닙니다", 404)
        # 이 레터를 쓴 에디터를 구독한 활성 구독자. 수신 제외 주소와 이미 이 레터를 받은 구독자는 뺀다.
        cur.execute(
            "SELECT DISTINCT s.id, s.email_norm, s.unsubscribe_token, "
            "       (SELECT string_agg(e.name, '·' ORDER BY le.position) FROM issue_letter_editors le JOIN letter_editors e ON e.id = le.editor_id "
            "         WHERE le.letter_id = %s AND le.editor_id IN (SELECT editor_id FROM letter_subscription_editors WHERE subscription_id = s.id)) AS editor_names "
            "FROM letter_subscriptions s "
            "JOIN letter_subscription_editors se ON se.subscription_id = s.id "
            "JOIN issue_letter_editors le2 ON le2.editor_id = se.editor_id AND le2.letter_id = %s "
            "WHERE s.status = 'active' "
            "  AND NOT EXISTS (SELECT 1 FROM email_suppressions x WHERE x.email_norm = s.email_norm) "
            "  AND NOT EXISTS (SELECT 1 FROM letter_send_item_letters il JOIN letter_send_items i ON i.id = il.item_id "
            "                   WHERE i.subscription_id = s.id AND il.letter_id = %s AND i.status IN ('sent','queued')) "
            "ORDER BY s.id", (letter_id, letter_id, letter_id))
        subs = cur.fetchall()
        targets = [{"email": mask_email(s["email_norm"]), "letter": letter_row["title"], "editors": s["editor_names"]} for s in subs]
        if dry or not subs:
            return {"dry_run": dry, "targets": targets, "subscribers": len(subs)}
        cur.execute("INSERT INTO letter_sends (kind, send_date, send_hour, target_count) VALUES ('instant', %s, %s, %s) "
                    "ON CONFLICT (kind, send_date, send_hour) DO UPDATE SET target_count = letter_sends.target_count + EXCLUDED.target_count RETURNING id",
                    (kst_now.date(), kst_now.hour, len(subs)))
        send_id = cur.fetchone()["id"]
        queued = []
        for sub in subs:
            cur.execute("INSERT INTO letter_send_items (send_id, subscription_id, email) VALUES (%s,%s,%s) ON CONFLICT (send_id, subscription_id) DO NOTHING RETURNING id", (send_id, sub["id"], sub["email_norm"]))
            row = cur.fetchone()
            if not row:
                continue
            cur.execute("INSERT INTO letter_send_item_letters (item_id, letter_id, position) VALUES (%s,%s,1)", (row["id"], letter_id))
            queued.append((row["id"], sub))
    full = issue_letters_repo.get_published(letter_row["slug"])
    results = {"sent": 0, "failed": 0}
    for item_id, sub in queued:
        try:
            if not full:
                raise RuntimeError("letter not published")
            reason = f"구독하신 {sub['editor_names']} 에디터의 새 레터예요" if sub["editor_names"] else ""
            subject, html_body, text_body = letter_mail.render_letter(full, reason, sub["unsubscribe_token"])
            mid = letter_mail.send_mail(sub["email_norm"], subject, html_body, text_body, letter_mail.unsubscribe_url(sub["unsubscribe_token"]))
            status, err = "sent", None
            results["sent"] += 1
        except Exception as e:  # 한 명의 실패가 나머지를 막지 않는다
            mid, status, err = None, "failed", str(e)[:500]
            results["failed"] += 1
            log.exception("instant send failed item=%s", item_id)
        with get_cursor() as cur:
            cur.execute("UPDATE letter_send_items SET status=%s, message_id=%s, error=%s, sent_at=now() WHERE id=%s", (status, mid, err, item_id))
    with get_cursor() as cur:
        cur.execute("UPDATE letter_sends SET finished_at=now() WHERE id=%s", (send_id,))
    return {"dry_run": False, "send_id": send_id, "targets": targets, **results}


def run_pending_instant(now: Optional[dt.datetime] = None) -> Dict[str, Any]:
    """야간에 발행돼 보내지 못한 최근 레터(24시간 이내)를 아침에 보낸다. 크론(또는 수동)으로 8시 이후 호출한다."""
    now = now or dt.datetime.now(dt.timezone.utc)
    with get_cursor() as cur:
        cur.execute("SELECT id FROM issue_letters WHERE status='published' AND deleted_at IS NULL AND published_at >= %s ORDER BY published_at", (now - dt.timedelta(hours=24),))
        ids = [r["id"] for r in cur.fetchall()]
    return {"letters": [{"id": i, **send_for_letter(i, now=now)} for i in ids]}


# ── 테스트 메일(샘플 한 통) ──────────────────────────────────────────────────
# 구독 신청 전에 "메일이 실제로 오는지" 확인하게 하는 기능이라 구독자가 아닌 주소로도 나간다. 남용을 막으려고
#  · 같은 주소는 10분에 1회, 하루 3회까지
#  · 반송·신고(수신 제외) 주소에는 보내지 않는다
#  · 본문 맨 위에 "테스트 메일"을 표시하고 수신거부 링크를 넣지 않는다(구독이 아니므로 이후 메일이 가지 않는다는 문구를 넣는다)
# 제한은 프로세스 메모리로 센다(서버 워커 2개라 정확히 지켜지지는 않는다 — 정식 단계에서 테이블이나 Redis 로 옮긴다).
TEST_COOLDOWN = dt.timedelta(minutes=10)
TEST_DAILY_MAX = 3
_test_log: Dict[str, List[dt.datetime]] = {}


def preview_mail() -> Dict[str, str]:
    """"이렇게 와요" 미리보기: 가장 최근 레터로 만든 실제 메일 본문(HTML)을 돌려준다. 메일은 보내지 않는다."""
    with get_cursor() as cur:
        cur.execute("SELECT slug FROM issue_letters WHERE status='published' AND deleted_at IS NULL ORDER BY published_at DESC, id DESC LIMIT 1")
        row = cur.fetchone()
    letter = issue_letters_repo.get_published(row["slug"]) if row else None
    if not letter:
        raise LetterError("보여 드릴 레터가 아직 없어요", 404)
    subject, html_body, _ = letter_mail.render_letter(letter, "", "", test=True)
    return {"subject": subject, "html": html_body}


def send_test_mail(email: Any, now: Optional[dt.datetime] = None) -> Dict[str, str]:
    addr = normalize_email(email)
    if not letter_mail.mail_available():
        raise LetterError("지금은 테스트 메일을 보내지 않고 있어요", 503)
    now = now or dt.datetime.now(dt.timezone.utc)
    recent = [t for t in _test_log.get(addr, []) if now - t < dt.timedelta(days=1)]
    if recent and now - recent[-1] < TEST_COOLDOWN:
        raise LetterError("테스트 메일은 10분에 한 번만 받을 수 있어요. 잠시 뒤에 다시 눌러 주세요", 429)
    if len(recent) >= TEST_DAILY_MAX:
        raise LetterError("오늘은 테스트 메일을 더 받을 수 없어요", 429)
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM email_suppressions WHERE email_norm = %s", (addr,))
        if cur.fetchone():
            return {"status": "sent"}  # 제외 주소는 알리지 않고 보내지도 않는다
        cur.execute("SELECT slug FROM issue_letters WHERE status='published' AND deleted_at IS NULL ORDER BY published_at DESC, id DESC LIMIT 1")
        row = cur.fetchone()
    if not row:
        raise LetterError("보낼 레터가 아직 없어요", 404)
    letter = issue_letters_repo.get_published(row["slug"])
    if not letter:
        raise LetterError("보낼 레터가 아직 없어요", 404)
    subject, html_body, text_body = letter_mail.render_letter(letter, "", "", test=True)
    _test_log[addr] = recent + [now]
    try:
        letter_mail.send_mail(addr, subject, html_body, text_body)
    except Exception:
        log.exception("test mail failed")
        _test_log[addr] = recent  # 실패는 횟수에서 뺀다
        raise LetterError("테스트 메일을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요", 502)
    return {"status": "sent"}
