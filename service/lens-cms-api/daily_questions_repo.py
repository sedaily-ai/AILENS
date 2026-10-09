"""홈 "오늘의 질문" 날짜별 생성 캐시 — daily_questions 테이블.

옛 DynamoDB sedaily-mbti-personal-dev 의 user_id='__questions__' / sk='DATE#YYYYMMDD' 항목을 대체한다(설계: docs/architecture/
lens-erd-src/16-ddb-잔여-이관-설계.md, v1.36). 테이블은 마스터 계정으로 만든다(lens_service_app 에는 DDL 권한이 없다).

첫 요청이 LLM 으로 질문을 만들어 저장하고 이후는 읽기만 한다. 동시에 두 요청이 만들면 먼저 저장된 쪽이 이긴다(ON CONFLICT DO NOTHING) —
나중 요청은 저장된 값을 돌려받아 같은 날 같은 질문이 보장된다.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from db import get_cursor

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_MAX_QUESTIONS = 50


def _check_date(date: str) -> None:
    if not _DATE_RE.match(date or ""):
        raise ValueError("날짜는 YYYY-MM-DD 형식")


def _row_to_dict(r: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "date": r["question_date"].isoformat(),
        "questions": r["questions"],
        "question_count": r["question_count"],
        "model": r.get("model"),
        "generated_at": r["generated_at"].isoformat() if r.get("generated_at") else None,
    }


def get_questions(date: str) -> Optional[Dict[str, Any]]:
    _check_date(date)
    with get_cursor() as cur:
        cur.execute(
            "SELECT question_date, questions, question_count, model, generated_at FROM daily_questions WHERE question_date = %s",
            (date,),
        )
        row = cur.fetchone()
    return _row_to_dict(row) if row else None


def save_questions(date: str, questions: List[Any], model: Optional[str] = None, generated_at: Optional[str] = None) -> Dict[str, Any]:
    """저장하고 실제로 저장된 값을 돌려준다(이미 있으면 기존 값)."""
    _check_date(date)
    if not isinstance(questions, list) or not questions or len(questions) > _MAX_QUESTIONS:
        raise ValueError(f"questions는 1~{_MAX_QUESTIONS}개 배열")
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO daily_questions (question_date, questions, question_count, model, generated_at)
            VALUES (%s, %s, %s, %s, COALESCE(%s::timestamptz, now()))
            ON CONFLICT (question_date) DO NOTHING
            """,
            (date, json.dumps(questions, ensure_ascii=False), len(questions), model, generated_at),
        )
    saved = get_questions(date)
    assert saved is not None
    return saved
