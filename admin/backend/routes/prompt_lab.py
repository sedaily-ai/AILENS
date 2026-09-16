"""프롬프트 실험 챗랩(PromptChatLab.tsx 우측 패널) — 설명/지침/파일을
각각 독립적으로 저장·조회·삭제한다(2026-09-15, 사용자 요청: "설명 입력
하고 저장하면 설명만.. 지침 수정하고 저장하면 지침만.. 파일도 마찬가지"
— Claude 프로젝트의 지침/컨텍스트 파일처럼 서로 침범하지 않는 개별
CRUD). 지금은 webtoon/published 하나만 이 화면에서 쓰지만, category/name
은 경로 파라미터로 받아 특정 프롬프트에 고정하지 않는다.

repo/prompt_lab_repo.py가 실제 저장(lens-cms-api의 새 prompt_lab_docs/
prompt_lab_files 테이블, prompts_repo.py의 버전 스냅샷과는 별개)을 갖고
있다. "발행"만 그쪽에서 지금 저장된 설명+지침+파일을 조립해
prompts_repo.update_prompt()로 새 프로덕션 버전을 만든다."""
from __future__ import annotations

import urllib.error

from repo import prompt_lab_repo
from shared import response


def handle_get_doc(body: dict, path_params: dict, query_params: dict) -> dict:
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    if not category or not name:
        return response.err("category and name required", 400)
    return response.ok(prompt_lab_repo.get_doc(category, name))


def handle_update_description(body: dict, path_params: dict, query_params: dict) -> dict:
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    if not category or not name:
        return response.err("category and name required", 400)
    text = body.get("text")
    if text is None:
        return response.err("text required", 400)
    return response.ok(prompt_lab_repo.update_description(category, name, text))


def handle_update_instructions(body: dict, path_params: dict, query_params: dict) -> dict:
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    if not category or not name:
        return response.err("category and name required", 400)
    text = body.get("text")
    if text is None:
        return response.err("text required", 400)
    return response.ok(prompt_lab_repo.update_instructions(category, name, text))


def handle_create_file(body: dict, path_params: dict, query_params: dict) -> dict:
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    if not category or not name:
        return response.err("category and name required", 400)
    file_name = (body.get("name") or "").strip()
    if not file_name:
        return response.err("name required", 400)
    content = body.get("content") or ""
    return response.ok(prompt_lab_repo.create_file(category, name, file_name, content))


def handle_get_file(body: dict, path_params: dict, query_params: dict) -> dict:
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    file_id = (path_params or {}).get("file_id", "")
    if not category or not name or not file_id:
        return response.err("category, name and file_id required", 400)
    try:
        return response.ok(prompt_lab_repo.get_file(category, name, file_id))
    except prompt_lab_repo.NotFoundError:
        return response.err("file not found", 404)


def handle_update_file(body: dict, path_params: dict, query_params: dict) -> dict:
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    file_id = (path_params or {}).get("file_id", "")
    if not category or not name or not file_id:
        return response.err("category, name and file_id required", 400)
    file_name = body.get("name")
    content = body.get("content")
    if file_name is None and content is None:
        return response.err("name or content required", 400)
    try:
        return response.ok(prompt_lab_repo.update_file(category, name, file_id, file_name, content))
    except prompt_lab_repo.NotFoundError:
        return response.err("file not found", 404)


def handle_delete_file(body: dict, path_params: dict, query_params: dict) -> dict:
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    file_id = (path_params or {}).get("file_id", "")
    if not category or not name or not file_id:
        return response.err("category, name and file_id required", 400)
    try:
        return response.ok(prompt_lab_repo.delete_file(category, name, file_id))
    except prompt_lab_repo.NotFoundError:
        return response.err("file not found", 404)


def handle_publish(body: dict, path_params: dict, query_params: dict) -> dict:
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    if not category or not name:
        return response.err("category and name required", 400)
    try:
        return response.ok(prompt_lab_repo.publish(category, name))
    except urllib.error.HTTPError as e:
        if e.code == 400:
            return response.err("설명·지침·파일이 모두 비어 있습니다 — 발행할 내용이 없습니다", 400)
        raise
