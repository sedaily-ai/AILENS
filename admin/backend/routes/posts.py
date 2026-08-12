"""CMS posts CRUD (CMS spec §5.1).

SQL 은 repo.posts_repo 가 전담한다. 여기서는 검증과 HTTP 매핑만 한다.

2026-08: MBTI 페르소나 개념 폐기로 mbti_group 필드 자체를 posts_repo 에서
제거했다(더 이상 저장/반환하지 않는다) — 이 라우트 계층도 그 값을 검증하거나
분기하지 않는다.
"""
from __future__ import annotations

import logging

from repo import posts_repo
from shared import audit, notify, response

logger = logging.getLogger(__name__)

_VALID_CHANNELS = {"letters", "paper", "feed", "trend_card", "webtoon", "video", "lens"}
# JWT 는 handler.py 가 이미 검증했다. 단일 관리자 계정이라 작성자는 고정값.
_ACTOR = "admin"


def _validate(body: dict, *, require_all: bool) -> str | None:
    """문제가 있으면 메시지를, 없으면 None 을 반환."""
    if require_all:
        if not (body.get("headline") or "").strip():
            return "headline is required"
        if not (body.get("publish_date") or "").strip():
            return "publish_date is required (YYYY-MM-DD)"

    channels = body.get("channels")
    if channels is not None:
        if not isinstance(channels, list):
            return "channels must be a list"
        bad = [c for c in channels if c not in _VALID_CHANNELS]
        if bad:
            return f"unknown channel: {', '.join(map(str, bad))}"

    return None


def handle_create(body: dict, path_params: dict, query_params: dict) -> dict:
    err = _validate(body, require_all=True)
    if err:
        return response.err(err, 400)
    post = posts_repo.create(body, created_by=_ACTOR)
    logger.info(f"cms post created: {post['id']} slug={post['slug']}")
    audit.log("post-create", {"id": post["id"], "slug": post["slug"]})
    notify.notify_content_changed()
    return response.ok({"post": post}, 201)


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    q = query_params or {}
    try:
        limit = max(1, min(int(q.get("limit", 50)), 200))
    except (TypeError, ValueError):
        limit = 50
    found = posts_repo.list_posts(q.get("status"), q.get("channel"), limit, q.get("date"))
    return response.ok({"posts": found, "count": len(found)})


def handle_get(body: dict, path_params: dict, query_params: dict) -> dict:
    post = posts_repo.get((path_params or {}).get("id", ""))
    if not post:
        return response.err("post not found", 404)
    return response.ok({"post": post})


def handle_update(body: dict, path_params: dict, query_params: dict) -> dict:
    err = _validate(body, require_all=False)
    if err:
        return response.err(err, 400)
    post = posts_repo.update((path_params or {}).get("id", ""), body)
    if not post:
        return response.err("post not found", 404)
    audit.log("post-update", {"id": post["id"]})
    notify.notify_content_changed()
    return response.ok({"post": post})


def _set_status(path_params: dict, status: str, action: str) -> dict:
    post = posts_repo.set_status((path_params or {}).get("id", ""), status)
    if not post:
        return response.err("post not found", 404)
    logger.info(f"cms post {post['id']} -> {status}")
    audit.log(action, {"id": post["id"], "slug": post["slug"]})
    notify.notify_content_changed()
    return response.ok({"post": post})


def handle_publish(body: dict, path_params: dict, query_params: dict) -> dict:
    return _set_status(path_params, "published", "post-publish")


def handle_unpublish(body: dict, path_params: dict, query_params: dict) -> dict:
    return _set_status(path_params, "draft", "post-unpublish")


def handle_delete(body: dict, path_params: dict, query_params: dict) -> dict:
    post_id = (path_params or {}).get("id", "")
    if not posts_repo.soft_delete(post_id):
        return response.err("post not found", 404)
    audit.log("post-delete", {"id": post_id})
    notify.notify_content_changed()
    return response.ok({"ok": True})
