"""오늘의 질문 날짜별 생성 캐시(daily_questions) — PostgreSQL 상시 서버(lens-cms-api) 경유 클라이언트 (v1.36).

옛 DynamoDB personal 테이블의 user_id='__questions__' / sk='DATE#YYYYMMDD' 항목을 대체한다. 호출부(handlers/user/question.py)는
QUESTIONS_BACKEND=pg 일 때만 이 모듈을 쓴다(기본 ddb → 검증 후 pg).
Lambda 실행 역할에 SSM 권한을 추가할 수 없어 토큰은 환경변수(LENS_CMS_API_TOKEN)로 주입한다(articles.py와 같은 이유).
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import List, Optional

from config.constants import LENS_CMS_API_DEFAULT_URL

_API_URL = os.environ.get("LENS_CMS_API_URL", LENS_CMS_API_DEFAULT_URL)
_TIMEOUT_SECONDS = 8
_TOKEN = os.environ.get("LENS_CMS_API_TOKEN", "")


def _iso_date(date_str: str) -> str:
    """호출부의 YYYYMMDD 를 서버 형식(YYYY-MM-DD)으로 바꾼다."""
    if len(date_str) == 8 and date_str.isdigit():
        return f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}"
    return date_str


def _request(method: str, path: str, body: Optional[dict] = None) -> dict:
    req = urllib.request.Request(
        f"{_API_URL}{path}",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None,
        headers={"Content-Type": "application/json", "X-Internal-Token": _TOKEN},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
        return json.loads(res.read())


def get_questions(date_str: str) -> Optional[List]:
    try:
        resp = _request("GET", f"/internal/daily-questions/{_iso_date(date_str)}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    return resp["daily_questions"]["questions"]


def save_questions(date_str: str, questions: List, model: Optional[str] = None, generated_at: Optional[str] = None) -> None:
    _request("PUT", f"/internal/daily-questions/{_iso_date(date_str)}", {"questions": questions, "model": model, "generated_at": generated_at})
