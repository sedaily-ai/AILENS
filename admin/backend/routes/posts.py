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

# trend_card 채널 폐기(2026-08-17) — "요즘 화제의 경제 이슈" 섹션을 "이슈
# 톡톡"에 흡수 통합하면서, 이 채널로 카드를 직접 만드는 진입점도 없앤다
# (실사용 데이터도 0건이었다 — 이미 letters 채널 + section='trend' 태그로
# 대체된 지 오래).
_VALID_CHANNELS = {"letters", "paper", "feed", "webtoon", "video", "lens", "home_player"}
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
    # channel — 2026-09-11, 웹툰/영상/홈플레이어 편집 화면이 자기 채널을
    # 실어 보내면 lens 번들 글의 body_inline을 그 포맷에 맞는 평평한
    # 모양으로 받는다(service/lens-cms-api/admin_posts_repo.py::_to_dict
    # 참조). 여기서 안 읽고 그냥 흘리면 편집 화면이 매번 빈 컷 목록을
    # 받는다(실제로 이 누락 때문에 8컷이 다 안 보이는 버그가 났었음).
    channel = (query_params or {}).get("channel")
    post = posts_repo.get((path_params or {}).get("id", ""), channel)
    if not post:
        return response.err("post not found", 404)
    return response.ok({"post": post})


def handle_update(body: dict, path_params: dict, query_params: dict) -> dict:
    err = _validate(body, require_all=False)
    if err:
        return response.err(err, 400)
    # channel — handle_get()과 같은 이유(2026-09-11): 웹툰/영상/홈플레이어
    # 편집기가 자기 채널을 실어 보내면 lens_cms_api가 그 포맷 슬라이스만
    # 스코프해서 저장한다(admin_posts_repo.py::_update_lens_bundle_slice
    # 참조). 안 흘리면 lens 번들 저장이 400(안전장치)으로 막힌다.
    channel = (query_params or {}).get("channel")
    try:
        post = posts_repo.update((path_params or {}).get("id", ""), body, channel)
    except ValueError as e:
        # posts_repo._request()가 lens_cms_api의 400(예: lens 번들 안전장치)을
        # ValueError로 다시 던진다 — 그 메시지를 그대로 프런트에 보여준다.
        return response.err(str(e), 400)
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
