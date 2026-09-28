"""프롬프트 실험 챗랩(PromptChatLab.tsx 좌측 사이드바) — 대화 스레드/메시지
CRUD(2026-09-15, 사용자 요청: "대화들.. 저장 가능한 세션들.. 좌측
사이드바.. 각 대화마다 어떤 대화를 했고 출력물이 나왔는지 체크"). 실제
저장은 repo/chat_threads_repo.py(lens-cms-api 경유)가 갖고 있다."""
from __future__ import annotations

import logging

from repo import chat_threads_repo
from routes.webtoon import jobs as webtoon_jobs
from shared import response

logger = logging.getLogger(__name__)


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
    before_id_raw = (query_params or {}).get("before_id")
    before_id = None
    if before_id_raw:
        try:
            before_id = int(before_id_raw)
        except (TypeError, ValueError):
            return response.err("before_id must be an integer", 400)
    try:
        return response.ok(chat_threads_repo.get_thread(thread_id, before_id=before_id))
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
    """title(이름 변경)·tag(이모지 태그) 둘 다 이 라우트 하나로 처리한다
    (2026-09-26 tag 추가 — lens-cms-api main.py::internal_update_chat_thread
    와 동일 결정). tag는 "tag" 키가 body에 있는지로 판단 — None 값 자체가
    "태그 해제"라는 유효한 요청이다."""
    thread_id = (path_params or {}).get("thread_id")
    if not thread_id:
        return response.err("thread_id required", 400)
    title = body.get("title")
    has_tag = "tag" in (body or {})
    if title is None and not has_tag:
        return response.err("title or tag required", 400)
    try:
        result: dict = {}
        if title is not None:
            result = chat_threads_repo.update_thread_title(thread_id, title)
        if has_tag:
            result = chat_threads_repo.set_thread_tag(thread_id, body.get("tag"))
        return response.ok(result)
    except chat_threads_repo.NotFoundError:
        return response.err("thread not found", 404)


def handle_delete(body: dict, path_params: dict, query_params: dict) -> dict:
    """2026-09-25, 백엔드 CRUD 점검 중 발견 — 예전엔 DB 행만 지우고
    이 대화에서 만든 음성·영상·컷 이미지는 S3에 그대로 남아 계속
    쌓이고 있었다. DB 삭제 전에 이 대화의 모든 메시지에서 S3 media
    키를 모아 먼저 지운다 — S3 삭제가 실패해도(권한 미부여 등)
    DB 삭제 자체는 막지 않는다(fail-open — 이 저장소의 audit.log/
    notify.notify_content_changed와 같은 원칙, 사용자가 요청한
    "삭제"라는 행위 자체를 부수 정리 실패 때문에 막을 이유가 없다)."""
    thread_id = (path_params or {}).get("thread_id")
    if not thread_id:
        return response.err("thread_id required", 400)
    try:
        keys = chat_threads_repo.list_media_keys(thread_id)
    except chat_threads_repo.NotFoundError:
        return response.err("thread not found", 404)
    if keys:
        try:
            bucket = webtoon_jobs.bucket()
            s3 = webtoon_jobs.s3()
            # S3 DeleteObjects는 한 번에 최대 1000개
            for i in range(0, len(keys), 1000):
                chunk = keys[i:i + 1000]
                s3.delete_objects(Bucket=bucket, Delete={"Objects": [{"Key": k} for k in chunk]})
            logger.info(f"chat-thread {thread_id} 삭제 — S3 media {len(keys)}개 정리됨")
        except Exception:  # noqa: BLE001 — S3 정리 실패가 스레드 삭제 자체를 막으면 안 됨
            logger.exception(f"chat-thread {thread_id} S3 media 정리 실패(무시하고 DB 삭제 계속)")
    try:
        return response.ok(chat_threads_repo.delete_thread(thread_id))
    except chat_threads_repo.NotFoundError:
        return response.err("thread not found", 404)
