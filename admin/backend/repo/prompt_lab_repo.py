"""프롬프트 실험 챗랩(PromptChatLab 우측 패널) 전용 — 설명/지침/파일을
각각 독립적으로 CRUD한다. PostgreSQL(lens-cms-api) 경유 — prompts_repo.py와
같은 패턴(내부 HTTP, X-Internal-Token). 실제 저장 로직은
service/lens-cms-api/prompt_lab_repo.py가 갖고 있고, 이 모듈은 그 위의
얇은 HTTP 클라이언트일 뿐이다.

prompts_repo.py(발행된 프로덕션 프롬프트 버전 스냅샷)와는 별개 저장소다
— 여기 데이터는 "발행" 전까지의 실험 편집 상태만 담는다.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from shared.ssm_client import get_secure

_API_URL = os.environ.get("LENS_CMS_API_URL", "http://13.223.179.151")
_TOKEN_PARAM = os.environ.get("LENS_CMS_API_TOKEN_PARAM", "/sedaily-mbti/admin/lens-cms-api-token")
_TIMEOUT_SECONDS = 8


def _request(method: str, path: str, body: dict | None = None) -> dict:
    url = f"{_API_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Internal-Token": get_secure(_TOKEN_PARAM),
        },
        method=method,
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
        return json.loads(res.read())


def get_doc(category: str, name: str) -> dict:
    return _request("GET", f"/internal/admin/prompt-lab/{category}/{name}")


_DRAFT_CACHE_TTL_SEC = int(os.environ.get("PROMPT_LAB_DRAFT_CACHE_TTL", "60"))
_DRAFT_CACHE: dict[tuple[str, str], tuple[float, str]] = {}


def assemble_draft(category: str, name: str) -> str:
    """설명 → 지침 → 파일(각각 "### 파일 · 이름" 헤딩) 순서로 이어붙인다.

    2026-09-16 — 클라이언트가 프롬프트 원문을 WebSocket으로 실어 보내던
    방식(prompt_override)을 완전히 걷어내고, nova와 같은 방식으로 바꿨다
    (nova/backend/websocket/prompt_builder.py::load_engine_full_prompt —
    사용자 확인: "노바랑 동일한 방식으로 하면 됩니다"). routes/chat_ws.py가
    메시지마다 이 함수로 저장된 지침을 서버에서 직접 읽어온다 — 클라이언트는
    프롬프트 원문을 아예 안 보내므로 WebSocket 32KB 프레임 한도 문제
    자체가 없다. nova의 `_get_engine_data`처럼 60초 TTL 캐시를 둬서 매
    메시지마다 lens-cms-api를 왕복하지 않는다(관리자가 우측 패널에서
    저장하면 60초 안에 반영). get_doc()의 files 목록엔 content가 없어서
    (크기 때문에 목록 API에서 빠짐 — PromptLabFile 타입 참고) 파일마다
    get_file()을 따로 불러야 한다."""
    cache_key = (category, name)
    now = time.time()
    cached = _DRAFT_CACHE.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]

    doc = get_doc(category, name)
    parts: list[str] = []
    description = (doc.get("description") or "").strip()
    if description:
        parts.append(description)
    instructions = (doc.get("instructions") or "").strip()
    if instructions:
        parts.append(instructions)
    for f in doc.get("files") or []:
        file_id = f.get("id")
        if file_id is None:
            continue
        try:
            content = (get_file(category, name, file_id).get("content") or "").strip()
        except NotFoundError:
            continue
        if not content:
            continue
        parts.append(f"### 파일 · {f.get('name') or '이름 없음'}\n\n{content}")
    draft = "\n\n".join(parts)
    _DRAFT_CACHE[cache_key] = (now + _DRAFT_CACHE_TTL_SEC, draft)
    return draft


def update_description(category: str, name: str, text: str) -> dict:
    return _request("PUT", f"/internal/admin/prompt-lab/{category}/{name}/description", body={"text": text})


def update_instructions(category: str, name: str, text: str) -> dict:
    return _request("PUT", f"/internal/admin/prompt-lab/{category}/{name}/instructions", body={"text": text})


def create_file(category: str, name: str, file_name: str, content: str) -> dict:
    return _request(
        "POST", f"/internal/admin/prompt-lab/{category}/{name}/files",
        body={"name": file_name, "content": content},
    )


def get_file(category: str, name: str, file_id: int) -> dict:
    return _request_or_404("GET", f"/internal/admin/prompt-lab/{category}/{name}/files/{file_id}")


def update_file(category: str, name: str, file_id: int, file_name: str | None = None, content: str | None = None) -> dict:
    body: dict = {}
    if file_name is not None:
        body["name"] = file_name
    if content is not None:
        body["content"] = content
    return _request_or_404("PUT", f"/internal/admin/prompt-lab/{category}/{name}/files/{file_id}", body=body)


def delete_file(category: str, name: str, file_id: int) -> dict:
    return _request_or_404("DELETE", f"/internal/admin/prompt-lab/{category}/{name}/files/{file_id}")


def publish(category: str, name: str) -> dict:
    """설명+지침+파일이 전부 비어 있으면 lens-cms-api가 400을 준다 —
    routes 쪽에서 urllib.error.HTTPError(code=400)를 잡아 사용자 메시지로
    바꾼다."""
    return _request("POST", f"/internal/admin/prompt-lab/{category}/{name}/publish")


class NotFoundError(Exception):
    """파일 등 하위 리소스가 없을 때(404) — routes 쪽에서 response.err(404)로 변환."""


def _request_or_404(method: str, path: str, body: dict | None = None) -> dict:
    try:
        return _request(method, path, body)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise NotFoundError from e
        raise
