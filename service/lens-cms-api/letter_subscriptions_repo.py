"""레터 이메일 구독(가입→이메일 확인→수신거부)과 다이제스트 발송. 설계: docs/architecture/lens-erd-src/19-독자관심-구독-설계.md (Phase 2).

- 이중 확인: 가입하면 pending, 메일의 링크를 열어야 active. 확인 전에는 아무것도 보내지 않는다.
- 응답으로 주소의 가입 여부를 알려 주지 않는다(이미 가입·수신거부 목록이어도 같은 응답).
- 다이제스트: 구독자 관심과 겹치는 최근 레터 중 아직 보내지 않은 것 상위 3편. 겹치는 레터가 없으면 보내지 않는다.
- (회차, 구독) 유일 제약과 회차 (종류, 날짜, 시각) 유일 제약으로 재실행해도 같은 메일이 두 번 나가지 않는다.
"""
from __future__ import annotations

import datetime as dt
import logging
import re
import secrets
from typing import Any, Dict, List, Optional, Tuple

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
              now: Optional[dt.datetime] = None) -> Dict[str, str]:
    if consent is not True:
        raise LetterError("메일 수신에 동의해 주세요")
    addr = normalize_email(email)
    freq, hour = validate_preferences(frequency, send_hour)
    pairs = interests_repo.validate_interest_items(interests)
    if not pairs:
        raise LetterError("관심 분야나 주제를 하나 이상 골라 주세요")
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
