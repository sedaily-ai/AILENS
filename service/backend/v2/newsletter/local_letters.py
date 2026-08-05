"""날짜별 로컬 레터 폴백.

pgvector daily_letters 미적재분 보강. 프런트의
`features/news-feed/data/letters20260518.ts` (LOCAL_LETTERS_BY_DATE) 와
동일 내용을 백엔드 패키지에 미러링 — 이메일 발송 내용이 사이트의
'오늘의 한 통'과 1:1 일치하도록.

`local_letters/{YYYY-MM-DD}.json` (today_letters 응답 shape) 을 읽어
{group: letter} 맵으로 반환한다. 새 날짜 레터는 같은 형식 JSON 추가.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_DIR = os.path.join(os.path.dirname(__file__), "local_letters")


def load_local_letters(date_str: str) -> Optional[Dict[str, Dict[str, Any]]]:
    """해당 날짜 로컬 레터 {group: letter} 맵. 없으면 None."""
    path = os.path.join(_DIR, f"{date_str}.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        letters = data.get("letters") or []
        by = {l["mbti_group"]: l for l in letters if l.get("mbti_group")}
        if by:
            logger.info('{"event":"local_letters_loaded","date":"%s","groups":%d}',
                        date_str, len(by))
            return by
    except Exception as e:  # 손상 JSON 등 — 폴백 체인 계속
        logger.warning('{"event":"local_letters_error","date":"%s","err":"%s"}',
                        date_str, type(e).__name__)
    return None
