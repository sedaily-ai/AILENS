"""날짜별 로컬 레터 폴백.

daily_letters 에 없는 날짜를 보강하며, 프런트의 LOCAL_LETTERS_BY_DATE 와 동일한 내용을 미러링해
이메일 내용이 사이트의 '오늘의 한 통'과 일치하도록 한다.
`local_letters/{YYYY-MM-DD}.json`(today_letters 응답 shape)을 읽어 해당 날짜 레터 1편을 반환한다.
기존 JSON 은 4그룹(NT/NF/ST/SF) 레터를 담을 수 있으므로 첫 번째만 사용한다.
신규 날짜 레터는 letters[0] 하나만 있는 형식으로 추가한다.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_DIR = os.path.join(os.path.dirname(__file__), "local_letters")


def load_local_letters(date_str: str) -> Optional[Dict[str, Any]]:
    """해당 날짜 로컬 레터 1편. 없으면 None."""
    path = os.path.join(_DIR, f"{date_str}.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        letters = data.get("letters") or []
        if letters:
            logger.info('{"event":"local_letters_loaded","date":"%s"}', date_str)
            return letters[0]
    except Exception as e:  # 손상 JSON 등 — 폴백 체인 계속
        logger.warning('{"event":"local_letters_error","date":"%s","err":"%s"}',
                        date_str, type(e).__name__)
    return None
