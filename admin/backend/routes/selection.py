"""선정 실험실 — mustknow_auto "일반" 카테고리 선정 결과를 날짜별로
모아 적절/애매/부적절로 채점하는 화면(2026-09-28 신설). repo.selection_repo가
lens-cms-api 내부 API를 부른다 — SQL은 그쪽에 있다."""
from __future__ import annotations

from repo import selection_repo
from shared import response

_VALID_VERDICTS = {"ok", "unclear", "bad", None}


def handle_list_dates(body: dict, path_params: dict, query_params: dict) -> dict:
    category = query_params.get("category", "general")
    limit = int(query_params.get("limit") or 30)
    return response.ok({"dates": selection_repo.list_dates(category, limit)})


def handle_get_day(body: dict, path_params: dict, query_params: dict) -> dict:
    run_date = query_params.get("date")
    if not run_date:
        return response.err("date is required", 400)
    category = query_params.get("category", "general")
    return response.ok(selection_repo.get_day(run_date, category))


def handle_score(body: dict, path_params: dict, query_params: dict) -> dict:
    verdict = body.get("verdict")
    if verdict not in _VALID_VERDICTS:
        return response.err(f"invalid verdict: {verdict}", 400)
    try:
        article = selection_repo.score_article(
            int(path_params["id"]), verdict, body.get("note"), scored_by="admin",
        )
    except ValueError as e:
        return response.err(str(e), 400)
    if not article:
        return response.err("article not found", 404)
    return response.ok({"article": article})
