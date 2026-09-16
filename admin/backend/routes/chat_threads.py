"""프롬프트 실험 챗랩(PromptChatLab.tsx 좌측 사이드바) — 대화 스레드/메시지
CRUD(2026-09-15, 사용자 요청: "대화들.. 저장 가능한 세션들.. 좌측
사이드바.. 각 대화마다 어떤 대화를 했고 출력물이 나왔는지 체크"). 실제
저장은 repo/chat_threads_repo.py(lens-cms-api 경유)가 갖고 있다."""
from __future__ import annotations

from repo import chat_threads_repo
from shared import response


def handle_create(body: dict, path_params: dict, query_params: dict) -> dict:
    category = body.get("category") or ""
    name = body.get("name") or ""
    if not category or not name:
        return response.err("category and name required", 400)
    return response.ok(chat_threads_repo.create_thread(category, name, body.get("title") or ""))


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    category = (query_params or {}).get("category") or ""
    name = (query_params or {}).get("name") or ""
    if not category or not name:
        return response.err("category and name required", 400)
    return response.ok(chat_threads_repo.list_threads(category, name))


def handle_get(body: dict, path_params: dict, query_params: dict) -> dict:
    thread_id = (path_params or {}).get("thread_id")
    if not thread_id:
        return response.err("thread_id required", 400)
    try:
        return response.ok(chat_threads_repo.get_thread(thread_id))
    except chat_threads_repo.NotFoundError:
        return response.err("thread not found", 404)


def handle_append_message(body: dict, path_params: dict, query_params: dict) -> dict:
    thread_id = (path_params or {}).get("thread_id")
    if not thread_id:
        return response.err("thread_id required", 400)
    role = body.get("role")
    if role not in ("user", "assistant"):
        return response.err("role must be user or assistant", 400)
    payload = body.get("payload") or {}
    try:
        return response.ok(chat_threads_repo.append_message(thread_id, role, payload))
    except chat_threads_repo.NotFoundError:
        return response.err("thread not found", 404)


def handle_update(body: dict, path_params: dict, query_params: dict) -> dict:
    thread_id = (path_params or {}).get("thread_id")
    if not thread_id:
        return response.err("thread_id required", 400)
    title = body.get("title")
    if title is None:
        return response.err("title required", 400)
    try:
        return response.ok(chat_threads_repo.update_thread_title(thread_id, title))
    except chat_threads_repo.NotFoundError:
        return response.err("thread not found", 404)


def handle_delete(body: dict, path_params: dict, query_params: dict) -> dict:
    thread_id = (path_params or {}).get("thread_id")
    if not thread_id:
        return response.err("thread_id required", 400)
    try:
        return response.ok(chat_threads_repo.delete_thread(thread_id))
    except chat_threads_repo.NotFoundError:
        return response.err("thread not found", 404)
