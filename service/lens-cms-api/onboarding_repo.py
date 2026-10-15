"""온보딩 "하루의 틈" 선택 집계(DDL v1.55 onboarding_choices).

결과 화면 분포 카드의 정본. 기기당 최신 선택 1건만 세고, 표본이 MIN_SAMPLE 미만이면 수치를 내보내지 않는다(몇 명뿐인 비율이 전체처럼 보이지 않게).
식별자는 투표·관심과 같은 기기 값(X-Voter-Id)을 온보딩 전용 네임스페이스로 해시한다.
"""
import hashlib
import os
from typing import Any, Dict, Optional

from db import get_cursor
from letter_errors import LetterError

MOMENTS = ("lunch", "commute-home", "walk", "bed")
GLANCES = ("text", "comic", "sound", "video")
MIN_SAMPLE = 50


def chooser_hash(raw_id: str, salt: Optional[str] = None) -> str:
    salt = os.environ.get("VOTE_HASH_SALT", "") if salt is None else salt
    if not salt:
        raise LetterError("온보딩 해시 솔트가 설정되지 않았습니다", 500)
    raw = str(raw_id or "").strip()
    if not raw or len(raw) > 128:
        raise LetterError("기기 식별자가 올바르지 않습니다")
    return hashlib.sha256(f"onboarding:{salt}:{raw}".encode("utf-8")).hexdigest()


def _distribution(cur) -> Dict[str, Any]:
    cur.execute("SELECT moment_id, glance_id, COUNT(*) AS n FROM onboarding_choices GROUP BY moment_id, glance_id")
    counts = {m: {g: 0 for g in GLANCES} for m in MOMENTS}
    for r in cur.fetchall():
        if r["moment_id"] in counts and r["glance_id"] in counts[r["moment_id"]]:
            counts[r["moment_id"]][r["glance_id"]] = int(r["n"])
    total = sum(sum(row.values()) for row in counts.values())
    ready = total >= MIN_SAMPLE
    return {"total": total, "ready": ready, "min_sample": MIN_SAMPLE, "counts": counts if ready else None}


def distribution() -> Dict[str, Any]:
    with get_cursor() as cur:
        return _distribution(cur)


def record(raw_voter_id: str, moment_id: str, glance_id: str) -> Dict[str, Any]:
    """이 기기의 선택을 저장(다시 답하면 덮어씀)하고 저장 후 분포를 돌려준다."""
    if moment_id not in MOMENTS or glance_id not in GLANCES:
        raise LetterError("올바르지 않은 선택입니다")
    h = chooser_hash(raw_voter_id)
    with get_cursor() as cur:
        cur.execute("INSERT INTO onboarding_choices (voter_hash, moment_id, glance_id) VALUES (%s,%s,%s) "
                    "ON CONFLICT (voter_hash) DO UPDATE SET moment_id = EXCLUDED.moment_id, glance_id = EXCLUDED.glance_id, "
                    "chosen_at = now()", (h, moment_id, glance_id))
        return _distribution(cur)
