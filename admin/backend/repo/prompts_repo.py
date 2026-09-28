"""admin 프롬프트 CRUD — PostgreSQL 상시 서버(lens-cms-api) 경유 (v1.27).

posts_repo.py(v1.21)/quiz_repo.py(v1.22)와 같은 패턴. 실제 CRUD 로직은
service/lens-cms-api/prompts_repo.py가 갖고 있다. 공개 읽기(prompt_loader.py,
pipelines/common/ddb_prompt.py)는 이 모듈을 안 쓴다 — 인증 없는 별도
public 엔드포인트(GET /api/v2/prompts/{category}/{name})를 각자 직접 부른다.
"""
from __future__ import annotations

import urllib.error

from shared import lens_cms_client


def _request(method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
    try:
        return lens_cms_client.request(method, path, body=body, query=query)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {}
        raise


def list_prompts() -> list[dict]:
    resp = _request("GET", "/internal/admin/prompts")
    return resp.get("prompts", [])


def get_prompt(category: str, name: str) -> dict | None:
    resp = _request("GET", f"/internal/admin/prompts/{category}/{name}")
    return resp or None


def get_prompt_history(category: str, name: str) -> list[dict]:
    resp = _request("GET", f"/internal/admin/prompts/{category}/{name}/history")
    return resp.get("history", [])


def get_prompt_version(category: str, name: str, version: int) -> dict | None:
    resp = _request("GET", f"/internal/admin/prompts/{category}/{name}/versions/{version}")
    return resp or None


def update_prompt(category: str, name: str, content: str, sections: dict | None, activate: bool = True) -> dict:
    """2026-09-26 — activate 추가(기본 True, 기존 동작 그대로). False면
    새 버전은 만들되 프로덕션 활성값은 안 건드린다 — 테스트 카드의
    "버전 저장"이 쓴다(사용자 요청: "버전 저장을 하면 버전만 저장하는거지,
    프로덕션으로 적용하는건.. 다른 버튼을 눌러야"). 프로덕션 승격은
    activate_version()이 따로 맡는다."""
    body = {"content": content, "activate": activate}
    if sections is not None:
        body["sections"] = sections
    return _request("PUT", f"/internal/admin/prompts/{category}/{name}", body=body)


def activate_version(category: str, name: str, version: int) -> dict | None:
    """이미 있는 버전을 프로덕션 활성값으로 승격 — 새 버전을 안 만든다.
    2026-09-26 신설, update_prompt(activate=False)의 짝."""
    resp = _request("POST", f"/internal/admin/prompts/{category}/{name}/activate", body={"version": version})
    return resp or None


def delete_version(category: str, name: str, version: int) -> dict:
    """버전 하나를 완전히 삭제 — 2026-09-26 신설, 사용자 요청: "버전을
    삭제하는 방법도 있어야 할 것 같고". 활성(프로덕션) 버전은 삭제 거부.

    _request()의 공용 404→{} 흡수를 그대로 쓰면 "없음"과 "활성이라 거부
    (400)"를 구분할 수 없어서, 여기서 직접 lens_cms_client.request를
    불러 상태 코드별로 나눈다. 반환: {"deleted": True} 성공,
    {"deleted": False, "reason": "not_found" | "active"} 실패."""
    try:
        lens_cms_client.request("DELETE", f"/internal/admin/prompts/{category}/{name}/versions/{version}")
        return {"deleted": True}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"deleted": False, "reason": "not_found"}
        if e.code == 400:
            return {"deleted": False, "reason": "active"}
        raise


def rename_version(category: str, name: str, version: int, label: str) -> dict | None:
    """버전 번호·내용은 그대로 두고 이름표(sections.label)만 바꾼다 —
    2026-09-26 신설, 사용자 지적: "버전이름도 수정가능하게 해야합니다".
    "버전 저장"(update_prompt)은 항상 새 버전을 만들어서 기존 버전의
    이름만 고치는 덴 못 쓴다 — 이 함수가 그 간극을 메운다."""
    resp = _request(
        "PATCH", f"/internal/admin/prompts/{category}/{name}/versions/{version}/label", body={"label": label}
    )
    return resp or None


def get_activation_history(category: str, name: str) -> list[dict]:
    """"프로덕션에 적용" 이력(언제·누가·몇 버전을 적용했는지) — 2026-09-26
    신설, 사용자 요청: "프로덕션에 적용한 이력들도 남아야 해요, 몇시
    몇분... 날짜에 했는지". audit_repo.list_prompt_activation_history 참고."""
    resp = _request("GET", f"/internal/admin/prompts/{category}/{name}/activation-history")
    return resp.get("history", [])
