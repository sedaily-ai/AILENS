"""용어 퀴즈 CRUD — posts.py와 같은 구조(검증 + HTTP 매핑만, 저장은 quiz_repo).

필드는 term(정답 용어)/explain(설명)/options(오답 3개)/publish_date(발행일).
options는 처음엔 안 두고 홈 화면에서 다른 용어 풀 중에 그때그때 오답을
뽑게 했는데, 무관한 용어가 섞여서 학습 효과가 떨어진다는 지적으로
관리자가 직접 쓰게 바꿨다(2026-08-09, "보기는 어떻게 넣는거죠" 리포트).
발행(publish) 시점엔 실제로 홈 화면에 나갈 수 있는 최소 조건(오답 3개)을
갖췄는지 확인한다 — 초안 상태에선 비어 있어도 저장은 가능하다.
"""
from __future__ import annotations

import logging

from repo import quiz_repo
from shared import audit, notify, response

logger = logging.getLogger(__name__)

# JWT는 handler.py가 이미 검증했다. 단일 관리자 계정이라 작성자는 고정값.
_ACTOR = "admin"


def _validate(body: dict, *, require_all: bool) -> str | None:
    if require_all:
        if not (body.get("term") or "").strip():
            return "term is required"
        if not (body.get("explain") or "").strip():
            return "explain is required"
    options = body.get("options")
    if options is not None:
        if not isinstance(options, list) or not all(isinstance(o, str) for o in options):
            return "options must be a list of strings"
    return None


def handle_create(body: dict, path_params: dict, query_params: dict) -> dict:
    err = _validate(body, require_all=True)
    if err:
        return response.err(err, 400)
    quiz = quiz_repo.create(body, created_by=_ACTOR)
    logger.info(f"quiz created: {quiz['id']} term={quiz['term']}")
    audit.log("quiz-create", {"id": quiz["id"], "term": quiz["term"]})
    notify.notify_content_changed()
    return response.ok({"quiz": quiz}, 201)


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    q = query_params or {}
    try:
        limit = max(1, min(int(q.get("limit", 50)), 200))
    except (TypeError, ValueError):
        limit = 50
    found = quiz_repo.list_quiz(q.get("status"), limit)
    return response.ok({"quiz": found, "count": len(found)})


def handle_get(body: dict, path_params: dict, query_params: dict) -> dict:
    quiz = quiz_repo.get((path_params or {}).get("id", ""))
    if not quiz:
        return response.err("quiz not found", 404)
    return response.ok({"quiz": quiz})


def handle_update(body: dict, path_params: dict, query_params: dict) -> dict:
    err = _validate(body, require_all=False)
    if err:
        return response.err(err, 400)
    quiz = quiz_repo.update((path_params or {}).get("id", ""), body)
    if not quiz:
        return response.err("quiz not found", 404)
    audit.log("quiz-update", {"id": quiz["id"]})
    notify.notify_content_changed()
    return response.ok({"quiz": quiz})


def _set_status(path_params: dict, status: str, action: str) -> dict:
    quiz = quiz_repo.set_status((path_params or {}).get("id", ""), status)
    if not quiz:
        return response.err("quiz not found", 404)
    logger.info(f"quiz {quiz['id']} -> {status}")
    audit.log(action, {"id": quiz["id"], "term": quiz["term"]})
    notify.notify_content_changed()
    return response.ok({"quiz": quiz})


def handle_publish(body: dict, path_params: dict, query_params: dict) -> dict:
    existing = quiz_repo.get((path_params or {}).get("id", ""))
    if not existing:
        return response.err("quiz not found", 404)
    valid_options = [o for o in (existing.get("options") or []) if (o or "").strip()]
    if len(valid_options) < 3:
        return response.err("발행하려면 오답 3개를 모두 채워야 합니다", 400)
    return _set_status(path_params, "published", "quiz-publish")


def handle_unpublish(body: dict, path_params: dict, query_params: dict) -> dict:
    return _set_status(path_params, "draft", "quiz-unpublish")


def handle_delete(body: dict, path_params: dict, query_params: dict) -> dict:
    quiz_id = (path_params or {}).get("id", "")
    if not quiz_repo.soft_delete(quiz_id):
        return response.err("quiz not found", 404)
    audit.log("quiz-delete", {"id": quiz_id})
    notify.notify_content_changed()
    return response.ok({"ok": True})
