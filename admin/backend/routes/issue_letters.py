"""이슈 레터(모아쓰기 레터) 관리 라우트 — 검증과 HTTP 매핑만, 저장·규칙은 lens-cms-api(repo/issue_letters_repo.py).

화면 흐름: 템플릿 v2 가 만든 저장용 JSON 을 붙여넣어 초안 저장 → 발행 전 문제 확인 → 검수 요청 → 발행(→ 내림).
서버가 거부하면(입력 오류 400, 상태 충돌 409, 발행 규칙 위반 422) 사유 문장을 그대로 화면에 전달한다.
옛 /admin/letters(AI 레터 편집, 폐기 후보)와는 별개 기능이다.
"""
from __future__ import annotations

import logging

from repo import issue_letters_repo as repo
from shared import audit, response

logger = logging.getLogger(__name__)


def _id(path_params: dict) -> int | None:
    try:
        return int((path_params or {}).get("id", ""))
    except (TypeError, ValueError):
        return None


def _pass(status: int, payload: dict, ok_status: int = 200) -> dict:
    """서버 응답을 그대로 전달한다. 실패 사유(detail)는 관리자 화면이 읽는 error 문장으로 옮긴다."""
    if status in (200, 201):
        return response.ok(payload, ok_status)
    if status == 404:
        return response.err("issue letter not found", 404)
    detail = payload.get("detail")
    if isinstance(detail, list):  # FastAPI 형식 검증 오류
        detail = "; ".join(str(d.get("msg", d)) if isinstance(d, dict) else str(d) for d in detail)
    return response.err(str(detail or f"upstream error {status}"), status if status in (400, 403, 409, 422) else 502)


def handle_archives(body: dict, path_params: dict, query_params: dict) -> dict:
    """출처 후보 보관 — 편집자가 빅카인즈 검색 결과(타임머신 응답의 기사 항목)에서 고른 기사를 저장한다."""
    articles = (body or {}).get("articles")
    if not isinstance(articles, list) or not articles:
        return response.err("보관할 기사가 없습니다", 400)
    status, payload = repo.save_archives(articles)
    if status == 200:
        audit.log("issue-letter-archive-sources", {"count": len(payload.get("archived") or [])})
    return _pass(status, payload)


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    q = query_params or {}
    try:
        limit = max(1, min(int(q.get("limit", 50)), 200))
    except (TypeError, ValueError):
        limit = 50
    return _pass(*repo.list_letters(q.get("status") or None, limit))


def handle_get(body: dict, path_params: dict, query_params: dict) -> dict:
    letter_id = _id(path_params)
    if letter_id is None:
        return response.err("invalid id", 400)
    return _pass(*repo.get_letter(letter_id))


def handle_create(body: dict, path_params: dict, query_params: dict) -> dict:
    if not isinstance(body, dict) or not body:
        return response.err("저장용 JSON 이 비어 있습니다", 400)
    status, payload = repo.create_letter(body)
    if status == 200:
        letter = payload.get("letter") or {}
        audit.log("issue-letter-create", {"id": letter.get("id"), "slug": letter.get("slug")})
    return _pass(status, payload, 201)


def handle_update(body: dict, path_params: dict, query_params: dict) -> dict:
    letter_id = _id(path_params)
    if letter_id is None:
        return response.err("invalid id", 400)
    if not isinstance(body, dict) or not body:
        return response.err("저장용 JSON 이 비어 있습니다", 400)
    status, payload = repo.update_letter(letter_id, body)
    if status == 200:
        audit.log("issue-letter-update", {"id": letter_id})
    return _pass(status, payload)


def _transition(path_params: dict, call, action: str) -> dict:
    letter_id = _id(path_params)
    if letter_id is None:
        return response.err("invalid id", 400)
    status, payload = call(letter_id)
    if status == 200:
        logger.info("issue letter %s -> %s", letter_id, action)
        audit.log(f"issue-letter-{action}", {"id": letter_id})
    return _pass(status, payload)


def handle_submit(body: dict, path_params: dict, query_params: dict) -> dict:
    return _transition(path_params, repo.submit_letter, "submit")


def handle_publish(body: dict, path_params: dict, query_params: dict) -> dict:
    return _transition(path_params, repo.publish_letter, "publish")


def handle_archive(body: dict, path_params: dict, query_params: dict) -> dict:
    return _transition(path_params, repo.archive_letter, "archive")
