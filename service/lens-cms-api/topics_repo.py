"""주제 사전(topics) — 레터에 붙이는 통제된 태그 어휘. 설계: docs/architecture/lens-erd-src/19-독자관심-구독-설계.md (Phase 0).

자유 입력 태그는 "금리/기준금리/금리인상"처럼 갈라져 집계·추천이 망가지므로, 편집팀이 관리하는 사전 + 별칭으로 정규화한다.
레터의 태그는 사전의 slug·이름·별칭 어느 것으로 적어도 되고(공백·대소문자 무시) 저장 때 사전 항목으로 해석한다. 사전에 없으면 거부한다.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional

from db import get_cursor
from letter_errors import LetterError

KINDS = ("topic", "company", "person", "place")
CATEGORY_SLUGS = ("markets", "property", "economy", "finance", "industry", "politics", "national", "international", "culture")
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")
MAX_BATCH = 200
MAX_ALIASES = 12


def norm(text: Any) -> str:
    """비교용 정규화: 모든 공백 제거 + 소문자."""
    return re.sub(r"\s+", "", str(text or "")).lower()


def validate_item(item: Any, idx: int = 0) -> Dict[str, Any]:
    if not isinstance(item, dict):
        raise LetterError(f"topics[{idx}] 형식이 올바르지 않습니다")
    slug = str(item.get("slug") or "").strip()
    name = str(item.get("name") or "").strip()
    kind = item.get("kind") or "topic"
    cat = item.get("category_slug") or None
    aliases = item.get("aliases") or []
    if not _SLUG_RE.match(slug):
        raise LetterError(f"topics[{idx}].slug 는 영문 소문자·숫자·하이픈(2~64자)이어야 합니다: {slug!r}")
    if not name or len(name) > 64:
        raise LetterError(f"topics[{idx}].name 은 1~64자여야 합니다")
    if kind not in KINDS:
        raise LetterError(f"topics[{idx}].kind 는 {'/'.join(KINDS)} 중 하나여야 합니다")
    if cat is not None and cat not in CATEGORY_SLUGS:
        raise LetterError(f"topics[{idx}].category_slug 는 사이트 분류 slug 여야 합니다: {cat!r}")
    if not isinstance(aliases, list) or len(aliases) > MAX_ALIASES or any(not isinstance(a, str) or not a.strip() or len(a) > 64 for a in aliases):
        raise LetterError(f"topics[{idx}].aliases 는 64자 이하 문자열 배열(최대 {MAX_ALIASES})이어야 합니다")
    return {"slug": slug, "name": name, "kind": kind, "category_slug": cat,
            "aliases": list(dict.fromkeys(a.strip() for a in aliases)), "is_active": bool(item.get("is_active", True))}


def find_conflicts(items: Iterable[Dict[str, Any]], existing: Iterable[Dict[str, Any]]) -> List[str]:
    """이름·별칭이 서로 다른 항목에서 겹치면 어느 쪽으로 해석할지 알 수 없다 — 겹침 목록을 돌려준다.
    existing 중 items 와 slug 가 같은 것은 덮어써지므로 제외하고 비교한다."""
    incoming = list(items)
    replaced = {i["slug"] for i in incoming}
    owner: Dict[str, str] = {}
    problems: List[str] = []
    for t in [e for e in existing if e["slug"] not in replaced] + incoming:
        for key in [t["slug"], t["name"], *t.get("aliases", [])]:
            n = norm(key)
            if n in owner and owner[n] != t["slug"]:
                problems.append(f"'{key}' 가 {owner[n]} 와 {t['slug']} 에서 겹칩니다")
            else:
                owner[n] = t["slug"]
    return problems


def list_topics(active_only: bool = True) -> List[Dict[str, Any]]:
    sql = "SELECT id, slug, name, kind, category_slug, aliases, is_active FROM topics"
    if active_only:
        sql += " WHERE is_active"
    sql += " ORDER BY category_slug NULLS LAST, name"
    with get_cursor() as cur:
        cur.execute(sql)
        return [{"id": r["id"], "slug": r["slug"], "name": r["name"], "kind": r["kind"], "category_slug": r["category_slug"],
                 "aliases": list(r["aliases"] or []), "is_active": r["is_active"]} for r in cur.fetchall()]


def upsert_topics(items: Any) -> Dict[str, int]:
    """사전 항목을 slug 기준으로 추가·갱신한다(삭제는 is_active=false). 이름·별칭 충돌이 있으면 전부 거부한다."""
    if not isinstance(items, list) or not items:
        raise LetterError("저장할 주제가 없습니다")
    if len(items) > MAX_BATCH:
        raise LetterError(f"한 번에 {MAX_BATCH}개까지만 저장할 수 있습니다")
    clean = [validate_item(it, i) for i, it in enumerate(items)]
    if len({c["slug"] for c in clean}) != len(clean):
        raise LetterError("같은 slug 가 두 번 들어 있습니다")
    with get_cursor() as cur:
        cur.execute("SELECT slug, name, aliases FROM topics")
        existing = [{"slug": r["slug"], "name": r["name"], "aliases": list(r["aliases"] or [])} for r in cur.fetchall()]
        problems = find_conflicts(clean, existing)
        if problems:
            raise LetterError("주제 이름·별칭이 겹칩니다: " + " / ".join(problems[:8]), 409)
        for c in clean:
            cur.execute(
                "INSERT INTO topics (slug, name, kind, category_slug, aliases, is_active) VALUES (%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, kind=EXCLUDED.kind, category_slug=EXCLUDED.category_slug, "
                "aliases=EXCLUDED.aliases, is_active=EXCLUDED.is_active",
                (c["slug"], c["name"], c["kind"], c["category_slug"], c["aliases"], c["is_active"]))
    return {"saved": len(clean)}


def build_lookup(rows: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """정규화한 slug·이름·별칭 → 사전 항목. 활성 항목만 넘겨야 한다."""
    lookup: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        for key in [r["slug"], r["name"], *(r.get("aliases") or [])]:
            lookup[norm(key)] = r
    return lookup


def resolve_tags(cur, tags: List[str]) -> List[Dict[str, Any]]:
    """레터의 태그(slug·이름·별칭)를 사전 항목으로 해석한다. 순서를 지키고 중복은 한 번만 넣는다. 사전에 없으면 목록과 함께 거부."""
    cur.execute("SELECT id, slug, name, kind, aliases FROM topics WHERE is_active")
    lookup = build_lookup(cur.fetchall())
    resolved: List[Dict[str, Any]] = []
    unknown: List[str] = []
    seen = set()
    for tag in tags:
        hit: Optional[Dict[str, Any]] = lookup.get(norm(tag))
        if hit is None:
            unknown.append(tag)
        elif hit["slug"] not in seen:
            seen.add(hit["slug"])
            resolved.append({"id": hit["id"], "slug": hit["slug"], "name": hit["name"], "kind": hit["kind"]})
    if unknown:
        raise LetterError(f"주제 사전에 없는 태그입니다: {', '.join(unknown)} — 사전의 이름·별칭으로 쓰거나 사전에 먼저 추가하세요")
    return resolved
