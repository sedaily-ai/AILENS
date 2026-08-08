"""AI 레터 편집 라우트 (CMS spec §5.3).

파이프라인 산출물을 관리자가 사후 수정한다. 생성은 없다 — 레터는 Editor Pick 이 만든다.
삭제는 소프트 삭제(deleted_at) 로, 사용자 화면에서 내리기만 한다.
"""
from __future__ import annotations

import logging

from repo import letters_repo
from shared import audit, notify, response

logger = logging.getLogger(__name__)


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    date = ((query_params or {}).get("date") or "").strip()
    if not date:
        return response.err("date is required (YYYY-MM-DD)", 400)
    return response.ok({"letters": letters_repo.list_by_date(date)})


def handle_get(body: dict, path_params: dict, query_params: dict) -> dict:
    letter = letters_repo.get((path_params or {}).get("id", ""))
    if not letter:
        return response.err("letter not found", 404)
    return response.ok({"letter": letter})


def handle_update(body: dict, path_params: dict, query_params: dict) -> dict:
    letter = letters_repo.update((path_params or {}).get("id", ""), body or {})
    if not letter:
        return response.err("letter not found", 404)
    logger.info(f"ai letter edited: {letter['id']}")
    audit.log("letter-update", {"id": letter["id"]})
    notify.notify_content_changed()
    return response.ok({"letter": letter})


def handle_delete(body: dict, path_params: dict, query_params: dict) -> dict:
    letter_id = (path_params or {}).get("id", "")
    if not letters_repo.soft_delete(letter_id):
        return response.err("letter not found", 404)
    audit.log("letter-delete", {"id": letter_id})
    notify.notify_content_changed()
    return response.ok({"ok": True})
