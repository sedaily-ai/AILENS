"""프롬프트 실험 챗랩 — 대화 스레드/메시지. PostgreSQL(lens-cms-api) 경유,
prompt_lab_repo.py와 같은 패턴(내부 HTTP, X-Internal-Token). 실제 저장
로직은 service/lens-cms-api/chat_threads_repo.py가 갖고 있다.
"""
from __future__ import annotations

import urllib.error
import urllib.parse

from shared import lens_cms_client


class NotFoundError(Exception):
    """스레드가 없을 때(404) — routes 쪽에서 response.err(404)로 변환."""


def _request(method: str, path: str, body: dict | None = None) -> dict:
    try:
        return lens_cms_client.request(method, path, body=body)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise NotFoundError from e
        raise


def create_thread(category: str, name: str, title: str = "") -> dict:
    return _request("POST", "/internal/admin/chat-threads", body={"category": category, "name": name, "title": title})


def list_threads(category: str, name: str) -> dict:
    qs = urllib.parse.urlencode({"category": category, "name": name})
    return _request("GET", f"/internal/admin/chat-threads?{qs}")


def get_thread(thread_id: int) -> dict:
    return _request("GET", f"/internal/admin/chat-threads/{thread_id}")


def append_message(thread_id: int, role: str, payload: dict) -> dict:
    return _request("POST", f"/internal/admin/chat-threads/{thread_id}/messages", body={"role": role, "payload": payload})


def update_thread_title(thread_id: int, title: str) -> dict:
    return _request("PUT", f"/internal/admin/chat-threads/{thread_id}", body={"title": title})


def delete_thread(thread_id: int) -> dict:
    return _request("DELETE", f"/internal/admin/chat-threads/{thread_id}")
