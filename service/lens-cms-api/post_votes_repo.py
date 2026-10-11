"""1기사 레터 투표 — 본문의 "투표" 칸 보기(o1~o9)에 독자가 한 번 투표한다(DDL v1.46 post_votes).
식별자는 모아쓰기 레터 투표와 같은 서버 솔트 해시(issue_letters_repo.voter_hash)를 쓴다. 문구는 저장하지 않고 번호만 저장한다."""
import re
from typing import Any, Dict, Tuple

from db import get_cursor
from issue_letters_repo import voter_hash
from letter_errors import LetterError

_KEY_RE = re.compile(r"^o[1-9]$")


def _published(cur, slug: str) -> bool:
    cur.execute("SELECT 1 FROM publications WHERE slug = %s AND status = 'published' AND deleted_at IS NULL", (slug,))
    return cur.fetchone() is not None


def _tally(cur, slug: str) -> Dict[str, int]:
    cur.execute("SELECT option_key, COUNT(*) AS n FROM post_votes WHERE slug = %s GROUP BY option_key", (slug,))
    return {r["option_key"]: int(r["n"]) for r in cur.fetchall()}


def vote(slug: str, raw_voter_id: str, option_key: str) -> Tuple[Dict[str, Any], bool]:
    """투표하거나 이미 한 투표의 보기를 바꾼다(한 기기 한 표). (결과, 이전과 달라졌는가) 를 돌려준다."""
    if not _KEY_RE.match(option_key or ""):
        raise LetterError("올바르지 않은 선택지입니다")
    h = voter_hash(raw_voter_id)
    with get_cursor() as cur:
        if not _published(cur, slug):
            raise LetterError("투표할 수 있는 글이 아닙니다", 404)
        cur.execute("SELECT option_key FROM post_votes WHERE slug = %s AND voter_hash = %s", (slug, h))
        before = cur.fetchone()
        cur.execute("INSERT INTO post_votes (slug, voter_hash, option_key) VALUES (%s,%s,%s) "
                    "ON CONFLICT (slug, voter_hash) DO UPDATE SET option_key = EXCLUDED.option_key, voted_at = now() "
                    "WHERE post_votes.option_key <> EXCLUDED.option_key RETURNING option_key", (slug, h, option_key))
        cur.fetchone()
        changed = before is None or before["option_key"] != option_key
        return {"my_choice": option_key, "counts": _tally(cur, slug)}, changed


def my_vote(slug: str, raw_voter_id: str) -> Dict[str, Any]:
    """내 투표 여부. 투표한 사람에게만 집계를 보여준다."""
    h = voter_hash(raw_voter_id)
    with get_cursor() as cur:
        if not _published(cur, slug):
            raise LetterError("투표할 수 있는 글이 아닙니다", 404)
        cur.execute("SELECT option_key FROM post_votes WHERE slug = %s AND voter_hash = %s", (slug, h))
        row = cur.fetchone()
        if not row:
            return {"my_choice": None, "counts": None}
        return {"my_choice": row["option_key"], "counts": _tally(cur, slug)}
