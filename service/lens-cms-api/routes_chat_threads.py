"""프롬프트 챗랩 대화 스레드 라우트.

main.py 분리(2026-10-12 리팩토링 5단계). 경로·응답은 분리 전과 같다.
"""
from __future__ import annotations

from fastapi import APIRouter
import json
from typing import Any, Dict, Optional
from fastapi import Body, Header, HTTPException, Query
import chat_threads_repo
from route_guards import _check_admin_token, _check_field_size

router = APIRouter()


# --- 프롬프트 실험 챗랩: 대화 스레드/메시지 (2026-09-15) ---
# chat_threads_repo.py 모듈 docstring 참고 — 순수 대화 기록 저장소.
# (버전 태그 생략 이유는 위 프롬프트 실험 챗랩 섹션 주석 참고.)

@router.post("/internal/admin/chat-threads")
def internal_create_chat_thread(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    category = payload.get("category") or ""
    name = payload.get("name") or ""
    if not category or not name:
        raise HTTPException(status_code=400, detail="category and name required")
    return chat_threads_repo.create_thread(category, name, payload.get("title") or "")


@router.get("/internal/admin/chat-threads")
def internal_list_chat_threads(category: str = Query(...), name: str = Query(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"threads": chat_threads_repo.list_threads(category, name)}


@router.get("/internal/admin/chat-threads/{thread_id}")
def internal_get_chat_thread(
    thread_id: int,
    before_id: Optional[int] = Query(default=None),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    thread = chat_threads_repo.get_thread(thread_id, before_id=before_id)
    if not thread:
        raise HTTPException(status_code=404, detail="thread not found")
    return thread


@router.get("/internal/admin/chat-threads/{thread_id}/media-keys")
def internal_list_chat_thread_media_keys(thread_id: int, x_internal_token: Optional[str] = Header(default=None)):
    """2026-09-25 — delete_thread()가 S3 정리를 안 하는 문제 수정의
    일부(chat_threads_repo.list_media_keys() docstring 참고). admin
    Lambda가 스레드 삭제 직전에 이걸 불러 지울 S3 키 목록을 받는다."""
    _check_admin_token(x_internal_token)
    cur = chat_threads_repo.get_thread(thread_id, message_limit=1)
    if cur is None:
        raise HTTPException(status_code=404, detail="thread not found")
    return {"keys": chat_threads_repo.list_media_keys(thread_id)}


@router.post("/internal/admin/chat-threads/{thread_id}/messages")
def internal_append_chat_message(thread_id: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    role = payload.get("role")
    if role not in ("user", "assistant"):
        raise HTTPException(status_code=400, detail="role must be user or assistant")
    message_payload = payload.get("payload") or {}
    _check_field_size(json.dumps(message_payload, ensure_ascii=False), "payload")
    result = chat_threads_repo.append_message(thread_id, role, message_payload)
    if result is None:
        raise HTTPException(status_code=404, detail="thread not found")
    return result


@router.put("/internal/admin/chat-threads/{thread_id}")
def internal_update_chat_thread(thread_id: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    """title(이름 변경)·tag(이모지 태그) 둘 다 이 PUT 하나로 처리한다 —
    2026-09-26 tag 추가 전엔 title 하나뿐이라 필수값이었지만, 이제 어느
    쪽이든 하나만 와도 된다(둘 다 없으면 400). tag는 "tag" 키가 payload에
    있는지로 판단한다(None 값 자체가 "태그 해제"라는 유효한 요청이라
    `payload.get("tag")`만으로는 "안 보냄"과 "해제"를 구분 못 한다)."""
    _check_admin_token(x_internal_token)
    title = payload.get("title")
    has_tag = "tag" in payload
    tag = payload.get("tag")
    if title is None and not has_tag:
        raise HTTPException(status_code=400, detail="title or tag required")
    updated = False
    if title is not None:
        updated = chat_threads_repo.update_thread_title(thread_id, title) or updated
    if has_tag:
        updated = chat_threads_repo.set_thread_tag(thread_id, tag) or updated
    if not updated:
        raise HTTPException(status_code=404, detail="thread not found")
    return {"updated": True}


@router.delete("/internal/admin/chat-threads/{thread_id}")
def internal_delete_chat_thread(thread_id: int, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    if not chat_threads_repo.delete_thread(thread_id):
        raise HTTPException(status_code=404, detail="thread not found")
    return {"deleted": True}
