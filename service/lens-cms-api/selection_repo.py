"""선정 실험실(selection lab) — mustknow_auto "일반" 카테고리 선정 결과를
날짜별로 모아 적절/애매/부적절로 채점하는 admin 화면의 백엔드.

테이블(selection_runs, selection_articles)은 이 코드가 아니라 1회성
마이그레이션으로 만들어져 있다(docs/architecture/db-changelog/postgres/
v1.35-선정실험실-테이블-신설.md 참고) — lens_service_app 역할엔 DDL
권한이 없다(prompt_lab_repo.py와 동일 원칙).

회차(run) 1개 = pipelines/mustknow_auto/run.py 1회 호출. 하루에 여러 번
돌아(_GENERAL_DAILY_CAP=20에 도달할 때까지) 회차가 여러 개 쌓이므로,
날짜 조회(get_day)는 그 날짜의 모든 회차를 합쳐서 반환한다.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from db import get_cursor

_VALID_VERDICTS = ("ok", "unclear", "bad")


def create_run(
    run_date: str,
    category: str,
    today_context: Optional[str],
    candidates_total: int,
    excluded_count: int,
    excluded_reasons: List[str],
    selected: List[Dict[str, Any]],
) -> Dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO selection_runs
                (run_date, category, today_context, candidates_total,
                 excluded_count, excluded_reasons, created_at)
            VALUES (%s,%s,%s,%s,%s,%s, now())
            RETURNING id
            """,
            (run_date, category, today_context, candidates_total,
             excluded_count, json.dumps(excluded_reasons or [])),
        )
        run_id = cur.fetchone()["id"]
        for article in selected:
            cur.execute(
                """
                INSERT INTO selection_articles
                    (run_id, article_key, title, category, reason, created_at)
                VALUES (%s,%s,%s,%s,%s, now())
                """,
                (run_id, article.get("key"), article.get("title"),
                 article.get("category"), article.get("reason")),
            )
    return {"run_id": run_id}


def _run_to_dict(r: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": r["id"],
        "run_date": r["run_date"].isoformat() if r.get("run_date") else None,
        "category": r["category"],
        "today_context": r.get("today_context"),
        "candidates_total": r.get("candidates_total"),
        "excluded_count": r.get("excluded_count"),
        "excluded_reasons": r.get("excluded_reasons") or [],
        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
    }


def _article_to_dict(a: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": a["id"],
        "run_id": a["run_id"],
        "key": a.get("article_key"),
        "title": a.get("title"),
        "category": a.get("category"),
        "reason": a.get("reason"),
        "verdict": a.get("verdict"),
        "note": a.get("note"),
        "scored_by": a.get("scored_by"),
        "scored_at": a["scored_at"].isoformat() if a.get("scored_at") else None,
    }


def list_dates(category: str = "general", limit: int = 30) -> List[str]:
    """날짜 탭 채우기용 — 실제로 회차가 있었던 날짜만 반환한다(프론트
    하드코딩 방지, 2026-09-28 사용자 지적)."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT DISTINCT run_date FROM selection_runs WHERE category=%s "
            "ORDER BY run_date DESC LIMIT %s",
            (category, limit),
        )
        return [r["run_date"].isoformat() for r in cur.fetchall()]


def get_day(run_date: str, category: str = "general") -> Dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM selection_runs WHERE run_date=%s AND category=%s "
            "ORDER BY created_at",
            (run_date, category),
        )
        runs = [_run_to_dict(r) for r in cur.fetchall()]
        if not runs:
            return {"run_date": run_date, "category": category, "runs": [], "articles": []}

        run_ids = [r["id"] for r in runs]
        cur.execute(
            "SELECT * FROM selection_articles WHERE run_id = ANY(%s) ORDER BY id",
            (run_ids,),
        )
        articles = [_article_to_dict(a) for a in cur.fetchall()]
    return {"run_date": run_date, "category": category, "runs": runs, "articles": articles}


def score_article(
    article_id: int, verdict: Optional[str], note: Optional[str], scored_by: str
) -> Optional[Dict[str, Any]]:
    if verdict is not None and verdict not in _VALID_VERDICTS:
        raise ValueError(f"invalid verdict: {verdict}")
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE selection_articles
            SET verdict=%s, note=%s, scored_by=%s,
                scored_at = CASE WHEN %s::text IS NULL THEN NULL ELSE now() END
            WHERE id=%s
            RETURNING *
            """,
            (verdict, note, scored_by, verdict, article_id),
        )
        row = cur.fetchone()
        return _article_to_dict(row) if row else None
