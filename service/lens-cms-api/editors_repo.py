"""레터 에디터(작성자): 사전 관리, 레터 작성 에디터 지정, 구독한 에디터 저장. 설계: docs/product/모아쓰기레터/에디터_개인화_기획.md

- 에디터는 관리자가 정한다(`PUT /admin/letter-editors`). 레터는 작성 에디터를 1명 이상 지정한다(발행 규칙은 아님 — 지정 없으면 구독자 발송 대상이 없을 뿐).
- 구독자는 구독한 에디터 중 하나라도 쓴 레터가 올라오면 한 통을 받는다.
"""
from __future__ import annotations

from typing import Any, Dict, List

from db import get_cursor
from letter_errors import LetterError

SLUG_RE_CHARS = set("abcdefghijklmnopqrstuvwxyz0123456789-")
GROUPS = ("NT", "NF", "ST", "SF")


def _clean_slug(v: Any) -> str:
    slug = str(v or "").strip().lower()
    if not slug or len(slug) > 32 or any(c not in SLUG_RE_CHARS for c in slug):
        raise LetterError("에디터 slug 는 영문 소문자·숫자·하이픈 32자 이하여야 합니다")
    return slug


def validate_editor(item: Any, i: int = 0) -> Dict[str, Any]:
    if not isinstance(item, dict):
        raise LetterError(f"editors[{i}] 는 객체여야 합니다")
    name = str(item.get("name") or "").strip()
    role = str(item.get("role") or "").strip()
    intro = str(item.get("intro") or "").strip()
    if not name or len(name) > 32:
        raise LetterError(f"editors[{i}].name 은 1~32자여야 합니다")
    if not role or len(role) > 64:
        raise LetterError(f"editors[{i}].role 은 1~64자여야 합니다")
    if not intro or len(intro) > 1000:
        raise LetterError(f"editors[{i}].intro 는 1~1000자여야 합니다")
    group = item.get("persona_group")
    if group is not None and group not in GROUPS:
        raise LetterError(f"editors[{i}].persona_group 은 {', '.join(GROUPS)} 중 하나여야 합니다")
    for k in ("image_url", "voice_url"):
        v = item.get(k)
        if v is not None and (not str(v).startswith("/") or len(str(v)) > 300):
            raise LetterError(f"editors[{i}].{k} 는 사이트 안 경로(/로 시작)여야 합니다")
    topic_names = item.get("topic_names", [])
    if not isinstance(topic_names, list) or len(topic_names) > 20 or any(not isinstance(t, str) or not t.strip() or len(t) > 32 for t in topic_names):
        raise LetterError(f"editors[{i}].topic_names 는 32자 이하 문자열 20개 이하의 배열이어야 합니다")
    return {"slug": _clean_slug(item.get("slug")), "topic_names": [t.strip() for t in dict.fromkeys(topic_names)], "name": name, "role": role, "nickname": (str(item.get("nickname") or "").strip() or None),
            "mbti": (str(item.get("mbti") or "").strip().upper() or None), "persona_group": group, "intro": intro,
            "pitch": (str(item.get("pitch") or "").strip() or None), "image_url": item.get("image_url"), "voice_url": item.get("voice_url"),
            "sort_order": int(item.get("sort_order") or 0), "is_active": bool(item.get("is_active", True))}


def list_editors(include_inactive: bool = False) -> List[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute("SELECT id, slug, name, role, nickname, mbti, persona_group, intro, pitch, topic_names, image_url, voice_url, sort_order, is_active FROM letter_editors "
                    + ("" if include_inactive else "WHERE is_active ") + "ORDER BY sort_order, id")
        return [dict(r) for r in cur.fetchall()]


def upsert_editors(items: Any) -> Dict[str, int]:
    if not isinstance(items, list) or not items or len(items) > 50:
        raise LetterError("editors 는 1~50개의 배열이어야 합니다")
    rows = [validate_editor(it, i) for i, it in enumerate(items)]
    if len({r["slug"] for r in rows}) != len(rows):
        raise LetterError("editors 에 같은 slug 가 있습니다")
    with get_cursor() as cur:
        for r in rows:
            cur.execute(
                "INSERT INTO letter_editors (slug, name, role, nickname, mbti, persona_group, intro, pitch, topic_names, image_url, voice_url, sort_order, is_active) "
                "VALUES (%(slug)s,%(name)s,%(role)s,%(nickname)s,%(mbti)s,%(persona_group)s,%(intro)s,%(pitch)s,%(topic_names)s,%(image_url)s,%(voice_url)s,%(sort_order)s,%(is_active)s) "
                "ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, role=EXCLUDED.role, nickname=EXCLUDED.nickname, mbti=EXCLUDED.mbti, "
                "persona_group=EXCLUDED.persona_group, intro=EXCLUDED.intro, pitch=EXCLUDED.pitch, topic_names=EXCLUDED.topic_names, image_url=EXCLUDED.image_url, voice_url=EXCLUDED.voice_url, "
                "sort_order=EXCLUDED.sort_order, is_active=EXCLUDED.is_active, updated_at=now()", r)
    return {"saved": len(rows)}


def _resolve(cur, slugs: Any) -> List[int]:
    if not isinstance(slugs, list) or len(slugs) > 8:
        raise LetterError("editors 는 8명 이하의 slug 배열이어야 합니다")
    cleaned = []
    for s in slugs:
        slug = _clean_slug(s)
        if slug not in cleaned:
            cleaned.append(slug)
    if not cleaned:
        return []
    cur.execute("SELECT id, slug FROM letter_editors WHERE slug = ANY(%s) AND is_active", (cleaned,))
    by = {r["slug"]: r["id"] for r in cur.fetchall()}
    missing = [s for s in cleaned if s not in by]
    if missing:
        raise LetterError(f"없는 에디터입니다: {', '.join(missing)}")
    return [by[s] for s in cleaned]


def set_letter_editors(letter_id: int, slugs: Any) -> List[str]:
    """레터의 작성 에디터를 통째로 교체한다(빈 배열이면 지정 해제)."""
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM issue_letters WHERE id=%s AND deleted_at IS NULL", (letter_id,))
        if not cur.fetchone():
            raise LetterError("레터를 찾을 수 없습니다", 404)
        ids = _resolve(cur, slugs)
        cur.execute("DELETE FROM issue_letter_editors WHERE letter_id=%s", (letter_id,))
        for pos, eid in enumerate(ids):
            cur.execute("INSERT INTO issue_letter_editors (letter_id, editor_id, position) VALUES (%s,%s,%s)", (letter_id, eid, pos))
        cur.execute("SELECT e.slug FROM issue_letter_editors le JOIN letter_editors e ON e.id=le.editor_id WHERE le.letter_id=%s ORDER BY le.position", (letter_id,))
        return [r["slug"] for r in cur.fetchall()]


def letter_editor_slugs(cur, letter_ids: List[int]) -> Dict[int, List[str]]:
    if not letter_ids:
        return {}
    cur.execute("SELECT le.letter_id, e.slug FROM issue_letter_editors le JOIN letter_editors e ON e.id=le.editor_id WHERE le.letter_id = ANY(%s) ORDER BY le.letter_id, le.position", (letter_ids,))
    out: Dict[int, List[str]] = {}
    for r in cur.fetchall():
        out.setdefault(r["letter_id"], []).append(r["slug"])
    return out


def set_subscription_editors(cur, subscription_id: int, slugs: Any) -> List[str]:
    """구독한 에디터를 통째로 교체한다(구독 신청 트랜잭션 안에서 호출)."""
    ids = _resolve(cur, slugs)
    cur.execute("DELETE FROM letter_subscription_editors WHERE subscription_id=%s", (subscription_id,))
    for eid in ids:
        cur.execute("INSERT INTO letter_subscription_editors (subscription_id, editor_id) VALUES (%s,%s)", (subscription_id, eid))
    return [s for s in dict.fromkeys(str(x).strip().lower() for x in slugs)]


def backfill_from_topics(dry_run: bool = True) -> List[Dict[str, Any]]:
    """작성 에디터가 없는 발행 레터에, 레터 주제와 에디터 담당 분야(pitch 가 아니라 주제 slug 목록)가 겹치는 에디터를 지정한다. 지금은 사전에 담당 분야 테이블이 없어
    스크립트(seed_editors.py)가 주제 이름 겹침을 계산해 set_letter_editors 로 넣는다 — 이 함수는 지정 현황 조회용이다."""
    with get_cursor() as cur:
        cur.execute("SELECT l.id, l.slug, l.title FROM issue_letters l WHERE l.status='published' AND l.deleted_at IS NULL "
                    "AND NOT EXISTS (SELECT 1 FROM issue_letter_editors le WHERE le.letter_id=l.id) ORDER BY l.id")
        return [dict(r) for r in cur.fetchall()]
