"""이슈 레터(모아쓰기 레터) — issue_letters 계열 7개 테이블.

설계: docs/architecture/lens-erd-src/17-이슈레터-설계.md, 변경 이력: db-changelog/postgres/v1.37-이슈레터-신설.md.
테이블은 이 코드가 아니라 마스터 계정으로 만든다(lens_service_app 에는 DDL 권한이 없다).

규칙(Q1~Q8 결정 — docs/product/모아쓰기레터/README.md)
  - 본문 인라인 링크는 전부 "쓰인 기사"(sources)에 있어야 하고, 서로 다른 자사 기사 링크가 3개 이상이어야 발행된다.
  - 자사 기사 출처는 articles 를 참조해 제목·URL 을 DB 에서 읽는다(지어낸 출처 방지). 외부 기사는 승인자가 있어야 한다.
  - 발행은 편집장(role=admin)만, 작성자 본인은 승인할 수 없다.
  - 투표는 레터당 한 사람 한 표. 식별자는 서버 솔트를 섞은 SHA-256 해시만 저장한다.
검증 함수(validate_letter_payload / publish_problems / voter_hash)는 DB 없이 단위 테스트할 수 있게 issue_letters_rules.py 의 순수 함수로 둔다.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from db import get_cursor
import editors_repo
import topics_repo
from issue_letters_rules import (  # noqa: F401  (일부는 다른 모듈·테스트가 이 모듈에서 가져다 쓴다)
    MAX_TOPICS,
    PRIMARY_TOPICS,
    SITE_CATEGORIES,
    STATUSES,
    _normalize_sections,
    normalize_url,
    publish_problems,
    validate_letter_payload,
    voter_hash,
)
from letter_errors import LetterError  # noqa: F401


# ── DB: 읽기 ─────────────────────────────────────────────────────────────

# 출처의 제목·주소는 항상 DB 에서 읽는다(지어낸 출처 방지). 보관 기사(빅카인즈)가 정식 경로이고, articles 참조는 부캉이 이전(v1.41 정리) 전까지의 전환용이다.
_SOURCE_SQL = """
    SELECT s.position, s.article_no, s.archive_id, s.axes, s.approved_by,
           COALESCE(e.title, a.title, s.external_title) AS title,
           CASE WHEN s.external_url IS NOT NULL THEN s.external_outlet ELSE '서울경제' END AS outlet,
           COALESCE(e.source_url, a.source_url, s.external_url) AS url
    FROM issue_letter_sources s
    LEFT JOIN articles a ON a.article_no = s.article_no
    LEFT JOIN external_archives e ON e.provider = s.archive_provider AND e.external_id = s.archive_id
    WHERE s.letter_id = %s ORDER BY s.position
"""


def _iso(v: Any) -> Optional[str]:
    return v.isoformat() if v is not None else None


def _load_children(cur, letter_id: int) -> Dict[str, Any]:
    cur.execute("SELECT category_slug, is_primary FROM issue_letter_categories "
                "WHERE letter_id = %s ORDER BY is_primary DESC, category_slug", (letter_id,))
    cats = cur.fetchall()
    cur.execute("SELECT t.slug, t.name, t.kind, lt.is_primary FROM issue_letter_topics lt JOIN topics t ON t.id = lt.topic_id "
                "WHERE lt.letter_id = %s ORDER BY lt.is_primary DESC, t.name", (letter_id,))
    topics = [{"slug": r["slug"], "name": r["name"], "kind": r["kind"], "is_primary": r["is_primary"]} for r in cur.fetchall()]
    cur.execute("SELECT axis, axis_label, heading, key_line, paragraphs FROM issue_letter_sections "
                "WHERE letter_id = %s ORDER BY position", (letter_id,))
    sections = cur.fetchall()
    cur.execute(_SOURCE_SQL, (letter_id,))
    sources = []
    for r in cur.fetchall():
        own = r["article_no"] is not None or r["archive_id"] is not None  # 서울경제 기사(보관 기사 또는 전환기 articles)
        sources.append({"article_no": r["article_no"], "archive_id": r["archive_id"], "title": r["title"], "outlet": r["outlet"],
                        "url": normalize_url(r["url"]) if r["url"] and own else r["url"],
                        "axes": list(r["axes"] or []), "approved_by": r["approved_by"], "external": not own})
    cur.execute("SELECT kind, question FROM issue_letter_polls WHERE letter_id = %s", (letter_id,))
    poll = cur.fetchone()
    if poll:
        cur.execute("SELECT key, label, hint FROM issue_letter_poll_options WHERE letter_id = %s ORDER BY position", (letter_id,))
        poll = {"kind": poll["kind"], "question": poll["question"], "options": cur.fetchall()}
    names = [SITE_CATEGORIES.get(c["category_slug"], c["category_slug"]) for c in cats]
    editors = editors_repo.letter_editor_slugs(cur, [letter_id]).get(letter_id, [])
    return {"editors": editors, "categories": [c["category_slug"] for c in cats], "category_names": names,
            "primary_category": next((SITE_CATEGORIES.get(c["category_slug"]) for c in cats if c["is_primary"]), None),
            "sections": sections, "sources": sources, "poll": poll, "topics": topics}


def _letter_row_to_dict(row: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": row["id"], "slug": row["slug"], "issue_no": row["issue_no"], "title": row["title"], "deck": row["deck"],
            "summary": list(row["summary"] or []), "editor_note": row["editor_note"], "read_minutes": row["read_minutes"],
            "status": row["status"], "author_no": row["author_no"], "reviewer_no": row["reviewer_no"],
            "reviewed_at": _iso(row["reviewed_at"]), "published_at": _iso(row["published_at"]),
            "created_at": _iso(row["created_at"]), "updated_at": _iso(row["updated_at"])}


def list_published(category: Optional[str] = None, limit: int = 20, before: Optional[str] = None) -> List[Dict[str, Any]]:
    """발행본 목록(최신순). category 는 분류 slug — 주·보조 모두 매칭. before 는 published_at ISO(다음 페이지)."""
    limit = max(1, min(int(limit), 50))
    sql = "SELECT l.* FROM issue_letters l WHERE l.status = 'published' AND l.deleted_at IS NULL"
    params: List[Any] = []
    if category:
        sql += " AND EXISTS (SELECT 1 FROM issue_letter_categories lc WHERE lc.letter_id = l.id AND lc.category_slug = %s)"
        params.append(category)
    if before:
        sql += " AND l.published_at < %s"
        params.append(before)
    sql += " ORDER BY l.published_at DESC LIMIT %s"
    params.append(limit)
    with get_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
        out = []
        for row in rows:
            child = _load_children(cur, row["id"])
            card = _letter_row_to_dict(row)
            for k in ("editor_note", "author_no", "reviewer_no", "reviewed_at", "status", "created_at", "updated_at"):
                card.pop(k, None)
            card.update(categories=child["category_names"], primary_category=child["primary_category"],
                        axes=sorted({a for s in child["sections"] for a in [s["axis"]]}),
                        source_count=len(child["sources"]), topics=[t["name"] for t in child["topics"]][:4], editors=child["editors"])
            out.append(card)
        return out


def get_published(slug: str) -> Optional[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM issue_letters WHERE slug = %s AND status = 'published' AND deleted_at IS NULL", (slug,))
        row = cur.fetchone()
        if not row:
            return None
        letter = _letter_row_to_dict(row)
        for k in ("author_no", "reviewer_no", "reviewed_at"):
            letter.pop(k, None)
        letter.update(_load_children(cur, row["id"]))
        return letter


def get_admin(letter_id: int) -> Optional[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM issue_letters WHERE id = %s AND deleted_at IS NULL", (letter_id,))
        row = cur.fetchone()
        if not row:
            return None
        letter = _letter_row_to_dict(row)
        letter.update(_load_children(cur, row["id"]))
        return letter


def list_admin(status: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    if status and status not in STATUSES:
        raise LetterError("status 값이 올바르지 않습니다")
    sql = "SELECT * FROM issue_letters WHERE deleted_at IS NULL"
    params: List[Any] = []
    if status:
        sql += " AND status = %s"
        params.append(status)
    sql += " ORDER BY updated_at DESC LIMIT %s"
    params.append(max(1, min(int(limit), 200)))
    with get_cursor() as cur:
        cur.execute(sql, params)
        return [_letter_row_to_dict(r) for r in cur.fetchall()]


ARCHIVE_PROVIDER = "bigkinds"
MAX_ARCHIVE_BATCH = 30


def save_archives(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """편집자가 빅카인즈 검색 결과에서 고른 서울경제 기사를 보관한다(external_archives, 같은 기사는 갱신).
    보관된 기사만 레터 출처가 될 수 있다. 입력은 타임머신 검색 응답의 기사 항목(news_id, title, original_link, published_at, byline, content)."""
    if not isinstance(items, list) or not items:
        raise LetterError("보관할 기사가 없습니다")
    if len(items) > MAX_ARCHIVE_BATCH:
        raise LetterError(f"한 번에 {MAX_ARCHIVE_BATCH}건까지만 담을 수 있습니다")
    rows = []
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            raise LetterError(f"articles[{i}] 형식이 올바르지 않습니다")
        news_id = str(it.get("news_id") or "").strip()
        title = str(it.get("title") or "").strip()
        link = str(it.get("original_link") or it.get("source_url") or "").strip()
        published = str(it.get("published_at") or "").strip()
        if not news_id or len(news_id) > 128:
            raise LetterError(f"articles[{i}].news_id 가 올바르지 않습니다")
        if not title or len(title) > 500:
            raise LetterError(f"articles[{i}].title 은 1~500자여야 합니다")
        if not re.match(r"^https?://", link):
            raise LetterError(f"articles[{i}]: 원문 링크가 없어 출처로 쓸 수 없는 기사입니다")
        if not re.match(r"^\d{4}-\d{2}-\d{2}", published):
            raise LetterError(f"articles[{i}].published_at 은 YYYY-MM-DD 형식이어야 합니다")
        rows.append((ARCHIVE_PROVIDER, news_id, published[:10], title, "서울경제",
                     (str(it.get("byline") or "")[:64] or None), (str(it.get("content") or "")[:400] or None), link))
    out = []
    with get_cursor() as cur:
        for r in rows:
            cur.execute(
                "INSERT INTO external_archives (provider, external_id, published_at, title, press, reporter_name, summary, source_url) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT (provider, external_id) DO UPDATE SET title=EXCLUDED.title, summary=EXCLUDED.summary, "
                "source_url=EXCLUDED.source_url, fetched_at=now() RETURNING external_id, title, source_url",
                r)
            row = cur.fetchone()
            out.append({"external_id": row["external_id"], "title": row["title"], "url": normalize_url(row["source_url"])})
    return out


# ── DB: 쓰기 ─────────────────────────────────────────────────────────────

def _resolve_source(cur, url: str, idx: int) -> Dict[str, Optional[str]]:
    """출처 주소를 "후보로 담은 서울경제 기사"로 해석한다. 쿼리 꼬리표(?ref=)는 무시한다.
    1순위 보관 기사(빅카인즈 검색에서 편집자가 담은 것), 2순위 전환기 한정 articles(부캉이 이전 전까지). 둘 다 없으면 거부."""
    base = normalize_url(url)
    cur.execute("SELECT provider, external_id FROM external_archives WHERE url_key = %s LIMIT 2", (base,))
    rows = cur.fetchall()
    if len(rows) == 1:
        return {"archive_provider": rows[0]["provider"], "archive_id": rows[0]["external_id"], "article_no": None}
    if len(rows) > 1:
        raise LetterError(f"sources[{idx}]: 같은 주소의 보관 기사가 둘 이상입니다: {base}")
    cur.execute("SELECT article_no FROM articles WHERE source_url = %s OR source_url LIKE %s LIMIT 2", (base, base + "?%"))
    rows = cur.fetchall()
    if len(rows) == 1:
        return {"archive_provider": None, "archive_id": None, "article_no": rows[0]["article_no"]}
    raise LetterError(
        f"sources[{idx}]: 이 주소는 후보로 담은 서울경제 기사가 아닙니다. 관리자 화면의 '출처 후보 기사 검색'에서 기사를 찾아 담은 뒤 사용하세요: {base}")


def _replace_topics(cur, letter_id: int, tags: List[str]) -> List[Dict[str, Any]]:
    """레터의 주제 태그를 사전 항목으로 해석해 통째로 교체한다. 앞의 PRIMARY_TOPICS 개가 주 주제."""
    resolved = topics_repo.resolve_tags(cur, tags)
    cur.execute("DELETE FROM issue_letter_topics WHERE letter_id = %s", (letter_id,))
    for i, t in enumerate(resolved):
        cur.execute("INSERT INTO issue_letter_topics (letter_id, topic_id, is_primary) VALUES (%s,%s,%s)", (letter_id, t["id"], i < PRIMARY_TOPICS))
    return resolved


def _replace_children(cur, letter_id: int, v: Dict[str, Any]) -> None:
    import json
    if v.get("topics") is not None:  # 입력에 topics 가 있을 때만 바꾼다(없으면 기존 태그 유지)
        _replace_topics(cur, letter_id, v["topics"])
    if v.get("editors") is not None:  # 입력에 editors 가 있을 때만 바꾼다(없으면 기존 작성 에디터 유지)
        ids = editors_repo._resolve(cur, v["editors"])
        cur.execute("DELETE FROM issue_letter_editors WHERE letter_id = %s", (letter_id,))
        for pos, eid in enumerate(ids):
            cur.execute("INSERT INTO issue_letter_editors (letter_id, editor_id, position) VALUES (%s,%s,%s)", (letter_id, eid, pos))
    cur.execute("DELETE FROM issue_letter_categories WHERE letter_id = %s", (letter_id,))
    for i, slug in enumerate(v["categories"]):
        cur.execute("INSERT INTO issue_letter_categories (letter_id, category_slug, is_primary) VALUES (%s,%s,%s)",
                    (letter_id, slug, i == 0))
    cur.execute("DELETE FROM issue_letter_sections WHERE letter_id = %s", (letter_id,))
    for i, s in enumerate(v["sections"]):
        cur.execute(
            "INSERT INTO issue_letter_sections (letter_id, position, axis, axis_label, heading, key_line, paragraphs) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb)",
            (letter_id, i, s["axis"], s["axis_label"], s["heading"], s["key_line"], json.dumps(s["paragraphs"], ensure_ascii=False)))
    cur.execute("DELETE FROM issue_letter_sources WHERE letter_id = %s", (letter_id,))
    seen = set()
    for i, s in enumerate(v["sources"]):
        r = _resolve_source(cur, s["url"], i)
        key = (r["archive_provider"], r["archive_id"], r["article_no"])
        if key in seen:
            raise LetterError(f"sources[{i}]: 같은 기사가 두 번 들어 있습니다(주소는 달라도 같은 기사)")
        seen.add(key)
        cur.execute(
            "INSERT INTO issue_letter_sources (letter_id, position, article_no, archive_provider, archive_id, axes) VALUES (%s,%s,%s,%s,%s,%s)",
            (letter_id, i, r["article_no"], r["archive_provider"], r["archive_id"], s["axes"]))
    cur.execute("DELETE FROM issue_letter_polls WHERE letter_id = %s", (letter_id,))
    if v["poll"]:
        cur.execute("INSERT INTO issue_letter_polls (letter_id, kind, question) VALUES (%s,%s,%s)",
                    (letter_id, v["poll"]["kind"], v["poll"]["question"]))
        for i, o in enumerate(v["poll"]["options"]):
            cur.execute("INSERT INTO issue_letter_poll_options (letter_id, key, position, label, hint) VALUES (%s,%s,%s,%s,%s)",
                        (letter_id, o["key"], i, o["label"], o["hint"]))


def create(data: Dict[str, Any], author_no: Optional[str]) -> Dict[str, Any]:
    v = validate_letter_payload(data)
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM issue_letters WHERE slug = %s", (v["slug"],))
        if cur.fetchone():
            raise LetterError("이미 있는 slug 입니다", 409)
        cur.execute(
            "INSERT INTO issue_letters (slug, title, deck, summary, editor_note, read_minutes, author_no) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id",
            (v["slug"], v["title"], v["deck"], v["summary"], v["editor_note"], v["read_minutes"], author_no))
        letter_id = cur.fetchone()["id"]
        _replace_children(cur, letter_id, v)
    return get_admin(letter_id)  # type: ignore[return-value]


def update(letter_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """초안·검수 중에만 수정한다. 발행·내림 상태는 고치지 않는다(slug 도 불변)."""
    v = validate_letter_payload(data)
    with get_cursor() as cur:
        cur.execute("SELECT status, slug FROM issue_letters WHERE id = %s AND deleted_at IS NULL FOR UPDATE", (letter_id,))
        row = cur.fetchone()
        if not row:
            return None
        if row["status"] not in ("draft", "in_review"):
            raise LetterError("발행·내림 상태의 레터는 수정할 수 없습니다", 409)
        if v["slug"] != row["slug"]:
            raise LetterError("slug 는 바꿀 수 없습니다", 400)
        cur.execute(
            "UPDATE issue_letters SET title=%s, deck=%s, summary=%s, editor_note=%s, read_minutes=%s, updated_at=now() WHERE id=%s",
            (v["title"], v["deck"], v["summary"], v["editor_note"], v["read_minutes"], letter_id))
        _replace_children(cur, letter_id, v)
    return get_admin(letter_id)


def relayout(letter_id: int, raw_sections: Any) -> Optional[Dict[str, Any]]:
    """발행된 레터의 본문 구성(섹션·문단·시각 블록)만 바꾼다. 제목·요약·한마디·투표·출처는 그대로 둔다.
    섹션 수와 축 순서는 같아야 하고, 바뀐 본문이 발행 규칙(publish_problems)을 모두 통과해야 한다. 시각 블록 도입 때 기존 레터의 구성을 다시 짜기 위한 경로다."""
    import json
    sections = _normalize_sections(raw_sections)
    current = get_admin(letter_id)
    if not current:
        return None
    if [s["axis"] for s in sections] != [s["axis"] for s in current["sections"]]:
        raise LetterError("섹션 수와 축 순서는 기존과 같아야 합니다", 400)
    candidate = {**current, "sections": [{"axis": s["axis"], "heading": s["heading"], "key_line": s["key_line"], "paragraphs": s["paragraphs"]} for s in sections]}
    # 제목·부제는 이 작업이 바꾸지 않으므로(이미 발행된 문구) 본문 구성에 관한 규칙만 본다.
    problems = [p for p in publish_problems(candidate) if not p.startswith(("제목", "부제"))]
    if problems:
        raise LetterError("; ".join(problems), 400)
    with get_cursor() as cur:
        cur.execute("DELETE FROM issue_letter_sections WHERE letter_id = %s", (letter_id,))
        for i, s in enumerate(sections):
            cur.execute(
                "INSERT INTO issue_letter_sections (letter_id, position, axis, axis_label, heading, key_line, paragraphs) VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb)",
                (letter_id, i, s["axis"], s["axis_label"], s["heading"], s["key_line"], json.dumps(s["paragraphs"], ensure_ascii=False)))
        cur.execute("UPDATE issue_letters SET updated_at = now() WHERE id = %s", (letter_id,))
    return get_admin(letter_id)


def set_topics(letter_id: int, tags: Any) -> List[Dict[str, Any]]:
    """주제 태그만 교체한다. 본문을 바꾸지 않는 메타데이터라 발행된 레터에도 허용한다(태그 체계 개선·소급 적용용)."""
    if not isinstance(tags, list) or any(not isinstance(t, str) or not t.strip() for t in tags) or len(tags) > MAX_TOPICS:
        raise LetterError(f"topics 는 주제 사전의 이름·별칭 문자열 배열(최대 {MAX_TOPICS}개)이어야 합니다")
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM issue_letters WHERE id = %s AND deleted_at IS NULL", (letter_id,))
        if not cur.fetchone():
            raise LetterError("레터를 찾을 수 없습니다", 404)
        resolved = _replace_topics(cur, letter_id, list(dict.fromkeys(t.strip() for t in tags)))
        cur.execute("UPDATE issue_letters SET updated_at = now() WHERE id = %s", (letter_id,))
    return [{"slug": t["slug"], "name": t["name"], "kind": t["kind"]} for t in resolved]


def submit(letter_id: int) -> Dict[str, Any]:
    with get_cursor() as cur:
        cur.execute("UPDATE issue_letters SET status='in_review', updated_at=now() "
                    "WHERE id=%s AND status='draft' AND deleted_at IS NULL RETURNING id", (letter_id,))
        if not cur.fetchone():
            raise LetterError("초안 상태의 레터만 검수 요청할 수 있습니다", 409)
    return get_admin(letter_id)  # type: ignore[return-value]


def publish(letter_id: int, actor_no: str, actor_role: str) -> Dict[str, Any]:
    """검수 중 → 발행. 편집장(admin)만, 작성자 본인 불가. 발행 규칙 위반 시 사유 목록을 담아 거부한다."""
    if actor_role != "admin":
        raise LetterError("발행 승인은 편집장(admin)만 할 수 있습니다", 403)
    letter = get_admin(letter_id)
    if not letter:
        raise LetterError("레터를 찾을 수 없습니다", 404)
    if letter["status"] != "in_review":
        raise LetterError("검수 중인 레터만 발행할 수 있습니다", 409)
    if letter["author_no"] and letter["author_no"] == actor_no:
        raise LetterError("작성자 본인은 승인할 수 없습니다", 403)
    problems = publish_problems(letter)
    if problems:
        raise LetterError("발행 규칙을 충족하지 못했습니다: " + " / ".join(problems), 422)
    with get_cursor() as cur:
        cur.execute("LOCK TABLE issue_letters IN SHARE ROW EXCLUSIVE MODE")
        cur.execute("SELECT COALESCE(MAX(issue_no), 0) + 1 AS n FROM issue_letters")
        n = cur.fetchone()["n"]
        cur.execute(
            "UPDATE issue_letters SET status='published', issue_no=%s, reviewer_no=%s, reviewed_at=now(), "
            "published_at=now(), updated_at=now() WHERE id=%s AND status='in_review' RETURNING id", (n, actor_no, letter_id))
        if not cur.fetchone():
            raise LetterError("다른 요청이 먼저 상태를 바꿨습니다", 409)
    return get_admin(letter_id)  # type: ignore[return-value]


def archive(letter_id: int) -> Dict[str, Any]:
    with get_cursor() as cur:
        cur.execute("UPDATE issue_letters SET status='archived', updated_at=now() "
                    "WHERE id=%s AND status='published' AND deleted_at IS NULL RETURNING id", (letter_id,))
        if not cur.fetchone():
            raise LetterError("발행된 레터만 내릴 수 있습니다", 409)
    return get_admin(letter_id)  # type: ignore[return-value]


# ── DB: 투표 ─────────────────────────────────────────────────────────────

def _tally(cur, letter_id: int) -> Dict[str, int]:
    cur.execute("SELECT o.key, COUNT(v.voter_hash) AS n FROM issue_letter_poll_options o "
                "LEFT JOIN issue_letter_votes v ON v.letter_id = o.letter_id AND v.option_key = o.key "
                "WHERE o.letter_id = %s GROUP BY o.key, o.position ORDER BY o.position", (letter_id,))
    return {r["key"]: int(r["n"]) for r in cur.fetchall()}


def _poll_letter_id(cur, slug: str) -> Optional[int]:
    cur.execute("SELECT l.id FROM issue_letters l JOIN issue_letter_polls p ON p.letter_id = l.id "
                "WHERE l.slug = %s AND l.status = 'published' AND l.deleted_at IS NULL", (slug,))
    row = cur.fetchone()
    return row["id"] if row else None


def vote(slug: str, raw_voter_id: str, option_key: str) -> Tuple[Dict[str, Any], bool]:
    """투표하거나 이미 한 투표의 보기를 바꾼다(한 기기 한 표, v1.47 부터 변경 허용). (결과, 이전과 달라졌는가) 를 돌려준다."""
    h = voter_hash(raw_voter_id)
    with get_cursor() as cur:
        letter_id = _poll_letter_id(cur, slug)
        if letter_id is None:
            raise LetterError("투표할 수 있는 레터가 아닙니다", 404)
        cur.execute("SELECT 1 FROM issue_letter_poll_options WHERE letter_id=%s AND key=%s", (letter_id, option_key))
        if not cur.fetchone():
            raise LetterError("없는 선택지입니다")
        cur.execute("SELECT option_key FROM issue_letter_votes WHERE letter_id=%s AND voter_hash=%s", (letter_id, h))
        before = cur.fetchone()
        cur.execute("INSERT INTO issue_letter_votes (letter_id, voter_hash, option_key) VALUES (%s,%s,%s) "
                    "ON CONFLICT (letter_id, voter_hash) DO UPDATE SET option_key = EXCLUDED.option_key, voted_at = now() "
                    "WHERE issue_letter_votes.option_key <> EXCLUDED.option_key RETURNING option_key", (letter_id, h, option_key))
        cur.fetchone()
        changed = before is None or before["option_key"] != option_key
        return {"my_choice": option_key, "counts": _tally(cur, letter_id)}, changed


def my_vote(slug: str, raw_voter_id: str) -> Dict[str, Any]:
    """내 투표 여부. 투표한 사람에게만 집계를 보여준다."""
    h = voter_hash(raw_voter_id)
    with get_cursor() as cur:
        letter_id = _poll_letter_id(cur, slug)
        if letter_id is None:
            raise LetterError("투표할 수 있는 레터가 아닙니다", 404)
        cur.execute("SELECT option_key FROM issue_letter_votes WHERE letter_id=%s AND voter_hash=%s", (letter_id, h))
        row = cur.fetchone()
        if not row:
            return {"my_choice": None, "counts": None}
        return {"my_choice": row["option_key"], "counts": _tally(cur, letter_id)}
