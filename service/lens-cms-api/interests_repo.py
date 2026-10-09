"""독자 관심(관심 묶음·기기별 관심 설정)과 "내 관심사" 레터 추천. 설계: docs/architecture/lens-erd-src/19-독자관심-구독-설계.md (Phase 1).

- 계정 없이 시작한다. 독자는 기기 식별자(투표와 같은 값, 브라우저에 저장된 UUID)로 구분하고, 관심용으로는 네임스페이스를 달리해 해시해서
  투표 기록과 서로 이어지지 않게 한다. 저장하는 것은 해시와 관심 키(분류·주제 slug)뿐이다.
- 추천은 단순 겹침 점수라 왜 이 순서인지 설명할 수 있다. 이유 문구는 레터에 실제로 붙은 주제·분류 이름만 쓴다(해석·권유 없음).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import os
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from db import get_cursor
from letter_errors import LetterError
from topics_repo import CATEGORY_SLUGS

SITE_CATEGORY_NAMES = {
    "markets": "시그널", "property": "부동산", "economy": "경제", "finance": "금융", "industry": "산업",
    "politics": "정치", "national": "사회", "international": "국제", "culture": "문화",
}
INTEREST_TYPES = ("category", "topic")
MAX_INTERESTS = 40
MAX_REASONS = 3
FEED_CANDIDATES = 60   # 최근 발행 레터 중 점수를 매길 후보 수
FEED_LIMIT = 10
HALF_LIFE_DAYS = 30.0
TOPIC_POINTS, TOPIC_PRIMARY_BONUS, CATEGORY_PRIMARY_POINTS, CATEGORY_POINTS = 3, 1, 2, 1


def reader_hash(raw_id: str, salt: Optional[str] = None) -> str:
    """관심 설정용 독자 해시. 투표(`voter_hash`)와 네임스페이스가 달라 같은 기기 값이어도 서로 다른 해시가 나온다."""
    salt = os.environ.get("VOTE_HASH_SALT", "") if salt is None else salt
    if not salt:
        raise LetterError("독자 해시 솔트가 설정되지 않았습니다", 500)
    raw = str(raw_id or "").strip()
    if not raw or len(raw) > 128:
        raise LetterError("기기 식별자가 올바르지 않습니다")
    return hashlib.sha256(f"interest:{salt}:{raw}".encode("utf-8")).hexdigest()


# ── 순수 함수: 입력 검증·점수 ────────────────────────────────────────────────

def validate_interest_items(items: Any) -> List[Tuple[str, str]]:
    """[{type, key}] → [(type, key)]. 중복 제거, 개수·형식 검증. 키가 사전·분류에 실제 있는지는 저장할 때 DB 로 확인한다."""
    if not isinstance(items, list):
        raise LetterError("interests 는 {type, key} 배열이어야 합니다")
    out: List[Tuple[str, str]] = []
    for i, it in enumerate(items):
        if not isinstance(it, dict) or it.get("type") not in INTEREST_TYPES or not isinstance(it.get("key"), str) or not it["key"].strip():
            raise LetterError(f"interests[{i}] 는 type(category/topic)과 key 가 필요합니다")
        pair = (it["type"], it["key"].strip())
        if len(pair[1]) > 64:
            raise LetterError(f"interests[{i}].key 가 너무 깁니다")
        if pair[0] == "category" and pair[1] not in CATEGORY_SLUGS:
            raise LetterError(f"알 수 없는 분류입니다: {pair[1]}")
        if pair not in out:
            out.append(pair)
    if len(out) > MAX_INTERESTS:
        raise LetterError(f"관심은 최대 {MAX_INTERESTS}개까지 고를 수 있습니다")
    return out


def score_letter(interests: Set[Tuple[str, str]], letter: Dict[str, Any], now: dt.datetime) -> Tuple[float, List[str]]:
    """점수 = (주제 겹침 3점, 레터의 주 주제면 +1) + (분류 겹침: 레터의 주 분류 2점, 보조 1점), 여기에 최신성 감쇠 0.5^(경과일/30).
    이유 = 겹친 주제 이름(주 주제 먼저, 최대 3개). 주제가 겹치지 않고 분류만 겹치면 겹친 분류 이름."""
    topic_hits: List[Tuple[bool, str]] = []
    points = 0
    for t in letter.get("topics", []):
        if ("topic", t["slug"]) in interests:
            points += TOPIC_POINTS + (TOPIC_PRIMARY_BONUS if t["is_primary"] else 0)
            topic_hits.append((t["is_primary"], t["name"]))
    category_hits: List[str] = []
    for c in letter.get("category_keys", []):
        if ("category", c["slug"]) in interests:
            points += CATEGORY_PRIMARY_POINTS if c["is_primary"] else CATEGORY_POINTS
            category_hits.append(SITE_CATEGORY_NAMES.get(c["slug"], c["slug"]))
    if points == 0:
        return 0.0, []
    age_days = max(0.0, (now - letter["published_dt"]).total_seconds() / 86400.0)
    score = round(points * (0.5 ** (age_days / HALF_LIFE_DAYS)), 4)
    topic_hits.sort(key=lambda h: not h[0])  # 주 주제 먼저(안정 정렬이라 같은 그룹은 원래 순서)
    reasons = [name for _, name in topic_hits][:MAX_REASONS] or category_hits[:MAX_REASONS]
    return score, reasons


def reason_text(reasons: List[str], by_topic: bool) -> str:
    """독자에게 보일 이유 문장(사실형). 레터에 실제로 붙은 주제·분류 이름만 쓴다."""
    names = "·".join(f"'{r}'" for r in reasons)
    return f"관심 주제 {names}를 다뤘어요" if by_topic else f"관심 분야 {names}의 레터예요"


# ── DB ──────────────────────────────────────────────────────────────────────

def _bundle_rows(cur) -> List[Dict[str, Any]]:
    cur.execute("SELECT id, slug, name, description, sort_order FROM interest_bundles WHERE is_active ORDER BY sort_order, id")
    bundles = cur.fetchall()
    ids = [b["id"] for b in bundles]
    items: Dict[int, List[Dict[str, str]]] = {i: [] for i in ids}
    if ids:
        cur.execute("SELECT bundle_id, interest_type, interest_key FROM interest_bundle_items WHERE bundle_id = ANY(%s) "
                    "ORDER BY interest_type, interest_key", (ids,))
        for r in cur.fetchall():
            items[r["bundle_id"]].append({"type": r["interest_type"], "key": r["interest_key"]})
    return [{"slug": b["slug"], "name": b["name"], "description": b["description"], "sort_order": b["sort_order"], "items": items[b["id"]]} for b in bundles]


def list_bundles() -> List[Dict[str, Any]]:
    with get_cursor() as cur:
        return _bundle_rows(cur)


def _known_keys(cur, pairs: Iterable[Tuple[str, str]]) -> List[str]:
    """사전에 없는 주제 키 목록(분류는 이미 형식 검증됨)."""
    topic_keys = sorted({k for t, k in pairs if t == "topic"})
    if not topic_keys:
        return []
    cur.execute("SELECT slug FROM topics WHERE is_active AND slug = ANY(%s)", (topic_keys,))
    have = {r["slug"] for r in cur.fetchall()}
    return [k for k in topic_keys if k not in have]


def upsert_bundles(items: Any) -> Dict[str, int]:
    """관심 묶음을 slug 기준으로 저장한다(관리자). 묶음의 항목은 통째로 교체한다."""
    if not isinstance(items, list) or not items or len(items) > 30:
        raise LetterError("저장할 묶음이 없거나 너무 많습니다(최대 30)")
    clean = []
    for i, b in enumerate(items):
        if not isinstance(b, dict) or not str(b.get("slug") or "").strip() or not str(b.get("name") or "").strip():
            raise LetterError(f"bundles[{i}] 는 slug·name 이 필요합니다")
        pairs = validate_interest_items(b.get("items"))
        if not pairs:
            raise LetterError(f"bundles[{i}] 에 항목이 없습니다")
        clean.append({"slug": str(b["slug"]).strip(), "name": str(b["name"]).strip()[:64], "description": (b.get("description") or None),
                      "sort_order": int(b.get("sort_order") or 0), "pairs": pairs})
    with get_cursor() as cur:
        for b in clean:
            missing = _known_keys(cur, b["pairs"])
            if missing:
                raise LetterError(f"묶음 '{b['name']}' 의 주제가 사전에 없습니다: {', '.join(missing)}")
            cur.execute(
                "INSERT INTO interest_bundles (slug, name, description, sort_order) VALUES (%s,%s,%s,%s) "
                "ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, sort_order=EXCLUDED.sort_order, is_active=TRUE "
                "RETURNING id", (b["slug"], b["name"], b["description"], b["sort_order"]))
            bid = cur.fetchone()["id"]
            cur.execute("DELETE FROM interest_bundle_items WHERE bundle_id = %s", (bid,))
            for t, k in b["pairs"]:
                cur.execute("INSERT INTO interest_bundle_items (bundle_id, interest_type, interest_key) VALUES (%s,%s,%s)", (bid, t, k))
    return {"saved": len(clean)}


def get_interests(rh: str) -> List[Dict[str, str]]:
    with get_cursor() as cur:
        cur.execute("SELECT interest_type, interest_key FROM reader_interests WHERE reader_hash = %s ORDER BY interest_type, interest_key", (rh,))
        return [{"type": r["interest_type"], "key": r["interest_key"]} for r in cur.fetchall()]


def set_interests(rh: str, items: Any) -> List[Dict[str, str]]:
    """이 기기의 관심을 통째로 교체한다(빈 배열이면 관심을 모두 지운다)."""
    pairs = validate_interest_items(items)
    with get_cursor() as cur:
        missing = _known_keys(cur, pairs)
        if missing:
            raise LetterError(f"주제 사전에 없는 관심입니다: {', '.join(missing)}")
        cur.execute("DELETE FROM reader_interests WHERE reader_hash = %s", (rh,))
        for t, k in pairs:
            cur.execute("INSERT INTO reader_interests (reader_hash, interest_type, interest_key) VALUES (%s,%s,%s)", (rh, t, k))
    return [{"type": t, "key": k} for t, k in pairs]


def _load_candidates(cur, limit: int) -> List[Dict[str, Any]]:
    """최근 발행 레터와 점수·카드에 필요한 키를 한꺼번에(질의 5번) 읽는다."""
    cur.execute("SELECT id, slug, issue_no, title, deck, read_minutes, published_at FROM issue_letters "
                "WHERE status = 'published' AND deleted_at IS NULL ORDER BY published_at DESC LIMIT %s", (limit,))
    rows = cur.fetchall()
    if not rows:
        return []
    ids = [r["id"] for r in rows]
    letters = {r["id"]: {"id": r["id"], "slug": r["slug"], "issue_no": r["issue_no"], "title": r["title"], "deck": r["deck"],
                         "read_minutes": r["read_minutes"], "published_dt": r["published_at"], "topics": [], "category_keys": [],
                         "axes": [], "source_count": 0} for r in rows}
    cur.execute("SELECT lt.letter_id, t.slug, t.name, lt.is_primary FROM issue_letter_topics lt JOIN topics t ON t.id = lt.topic_id "
                "WHERE lt.letter_id = ANY(%s) ORDER BY lt.is_primary DESC, t.name", (ids,))
    for r in cur.fetchall():
        letters[r["letter_id"]]["topics"].append({"slug": r["slug"], "name": r["name"], "is_primary": r["is_primary"]})
    cur.execute("SELECT letter_id, category_slug, is_primary FROM issue_letter_categories WHERE letter_id = ANY(%s) ORDER BY is_primary DESC", (ids,))
    for r in cur.fetchall():
        letters[r["letter_id"]]["category_keys"].append({"slug": r["category_slug"], "is_primary": r["is_primary"]})
    cur.execute("SELECT letter_id, axis FROM issue_letter_sections WHERE letter_id = ANY(%s)", (ids,))
    for r in cur.fetchall():
        if r["axis"] not in letters[r["letter_id"]]["axes"]:
            letters[r["letter_id"]]["axes"].append(r["axis"])
    cur.execute("SELECT letter_id, count(*) AS n FROM issue_letter_sources WHERE letter_id = ANY(%s) GROUP BY letter_id", (ids,))
    for r in cur.fetchall():
        letters[r["letter_id"]]["source_count"] = int(r["n"])
    return [letters[i] for i in ids]


def feed_for_reader(rh: str, limit: int = FEED_LIMIT, now: Optional[dt.datetime] = None) -> Dict[str, Any]:
    """독자의 관심과 겹치는 레터를 점수순으로 돌려준다. 관심이 없으면 빈 목록(화면은 기본 최신순을 그대로 보여 준다)."""
    now = now or dt.datetime.now(dt.timezone.utc)
    with get_cursor() as cur:
        cur.execute("SELECT interest_type, interest_key FROM reader_interests WHERE reader_hash = %s", (rh,))
        interests = {(r["interest_type"], r["interest_key"]) for r in cur.fetchall()}
        if not interests:
            return {"has_interests": False, "letters": []}
        candidates = _load_candidates(cur, FEED_CANDIDATES)
        cat_labels = {c["slug"]: SITE_CATEGORY_NAMES.get(c["slug"], c["slug"]) for l in candidates for c in l["category_keys"]}
    scored = []
    for l in candidates:
        score, reasons = score_letter(interests, l, now)
        if score <= 0:
            continue
        by_topic = any(("topic", t["slug"]) in interests for t in l["topics"])
        scored.append((score, l["published_dt"], {
            "slug": l["slug"], "issue_no": l["issue_no"], "title": l["title"], "deck": l["deck"], "read_minutes": l["read_minutes"],
            "categories": [cat_labels[c["slug"]] for c in l["category_keys"]], "axes": sorted(l["axes"]), "source_count": l["source_count"],
            "published_at": l["published_dt"].isoformat(), "topics": [t["name"] for t in l["topics"]][:4],
            "score": score, "reasons": reasons, "reason_text": reason_text(reasons, by_topic)}))
    scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return {"has_interests": True, "letters": [s[2] for s in scored[:max(1, min(int(limit), 30))]]}
