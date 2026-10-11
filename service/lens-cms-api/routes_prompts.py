"""프롬프트·프롬프트 실험실 라우트.

main.py 분리(2026-10-12 리팩토링 5단계). 경로·응답은 분리 전과 같다.
"""
from __future__ import annotations

from fastapi import APIRouter
from typing import Any, Dict, Optional
from fastapi import Body, Header, HTTPException
import audit_repo
import prompt_lab_repo
import prompts_repo
from route_guards import _check_admin_token, _check_field_size

router = APIRouter()


# --- admin 프롬프트 (v1.27) ---
# 공개 조회는 service/backend/services/prompt_loader.py, pipelines/common/
# ddb_prompt.py 둘 다 사용 — 원래 DynamoDB GetItem도 무인증(같은 Lambda
# 실행 역할 안이었을 뿐)이었다. 나머지(목록/버전이력/수정)는 admin 전용.

@router.get("/api/v2/prompts/{category}/{name}")
def get_prompt_content(category: str, name: str):
    content = prompts_repo.get_active_content(category, name)
    if content is None:
        raise HTTPException(status_code=404, detail="prompt not found")
    return {"content": content}


@router.get("/internal/admin/prompts")
def internal_list_prompts(x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"prompts": prompts_repo.list_prompts()}


@router.get("/internal/admin/prompts/{category}/{name}")
def internal_get_prompt(category: str, name: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    prompt = prompts_repo.get_prompt(category, name)
    if not prompt:
        raise HTTPException(status_code=404, detail="prompt not found")
    return prompt


@router.get("/internal/admin/prompts/{category}/{name}/history")
def internal_get_prompt_history(category: str, name: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"history": prompts_repo.get_prompt_history(category, name)}


@router.get("/internal/admin/prompts/{category}/{name}/versions/{version}")
def internal_get_prompt_version(category: str, name: str, version: int, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    v = prompts_repo.get_prompt_version(category, name, version)
    if not v:
        raise HTTPException(status_code=404, detail="prompt version not found")
    return v


@router.put("/internal/admin/prompts/{category}/{name}")
def internal_update_prompt(category: str, name: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    content = payload.get("content", "")
    if not content:
        raise HTTPException(status_code=400, detail="content required")
    _check_field_size(content, "content")
    activate = payload.get("activate", True)
    result = prompts_repo.update_prompt(category, name, content, sections=payload.get("sections"), activate=activate)
    return result


@router.post("/internal/admin/prompts/{category}/{name}/activate")
def internal_activate_prompt_version(category: str, name: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    """update_prompt(activate=False)로 저장해둔 버전을 프로덕션 활성값으로
    승격한다 — 새 버전을 안 만들고 is_active만 옮긴다(2026-09-26 신설).

    prompt_lab_docs/files(관리자 화면의 편집 가능한 초안, "프로덕션" 카드가
    보여주는 값)도 같이 맞춘다 — 안 그러면 "테스트 카드가 만든 버전을
    활성화"했는데 프로덕션 카드의 설명/지침/파일 칸은 예전 초안을 그대로
    보여주는 채로 남아서, 사용자가 거기서 무심코 "발행"을 다시 누르면 방금
    활성화한 내용을 예전 초안으로 덮어써버리는 함정이 생긴다. sections가
    이 챗랩이 만든 모양({kind: "prompt_lab", ...})일 때만 동기화한다 — 그
    이전 방식(PromptDrawer)으로 만들어진 버전은 애초에 이 화면과 무관한
    설명/지침/파일 구조가 없어 손대지 않는다."""
    _check_admin_token(x_internal_token)
    version = payload.get("version")
    if not isinstance(version, int):
        raise HTTPException(status_code=400, detail="version (int) required")
    result = prompts_repo.activate_version(category, name, version)
    if result is None:
        raise HTTPException(status_code=404, detail="prompt version not found")

    v = prompts_repo.get_prompt_version(category, name, version)
    sections = (v or {}).get("sections") or {}
    if isinstance(sections, dict) and sections.get("kind") == "prompt_lab":
        prompt_lab_repo.update_description(category, name, sections.get("description") or "")
        prompt_lab_repo.update_instructions(category, name, sections.get("instructions") or "")
        doc = prompt_lab_repo.get_doc(category, name)
        for f in doc["files"]:
            prompt_lab_repo.delete_file(f["id"])
        for f in sections.get("files") or []:
            if isinstance(f, dict):
                prompt_lab_repo.create_file(category, name, f.get("name") or "이름 없음", f.get("content") or "")

    return result


@router.delete("/internal/admin/prompts/{category}/{name}/versions/{version}")
def internal_delete_prompt_version(category: str, name: str, version: int, x_internal_token: Optional[str] = Header(default=None)):
    """버전 하나를 완전히 삭제한다(2026-09-26 신설, 사용자 요청: "버전을
    삭제하는 방법도 있어야 할 것 같고"). 활성(프로덕션) 버전은 400으로
    거부 — prompts_repo.delete_version 참고."""
    _check_admin_token(x_internal_token)
    result = prompts_repo.delete_version(category, name, version)
    if result is None:
        raise HTTPException(status_code=404, detail="prompt version not found")
    if not result.get("deleted"):
        raise HTTPException(
            status_code=400,
            detail="지금 프로덕션에서 쓰이는 버전은 삭제할 수 없습니다 — 다른 버전을 먼저 적용한 뒤 삭제해 주세요.",
        )
    return result


@router.patch("/internal/admin/prompts/{category}/{name}/versions/{version}/label")
def internal_rename_prompt_version(category: str, name: str, version: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    """버전 번호·content는 그대로 두고 이름표(sections.label)만 바꾼다 —
    2026-09-26 신설, 사용자 지적: "버전이름도 수정가능하게 해야합니다".
    prompts_repo.rename_version 참고."""
    _check_admin_token(x_internal_token)
    label = payload.get("label")
    if not isinstance(label, str):
        raise HTTPException(status_code=400, detail="label (string) required")
    result = prompts_repo.rename_version(category, name, version, label)
    if result is None:
        raise HTTPException(status_code=404, detail="prompt version not found")
    return result


# --- 프롬프트 실험 챗랩: 설명/지침/파일 개별 저장 (2026-09-15) ---
# prompt_lab_repo.py 모듈 docstring 참고 — prompts_repo(프로덕션 버전
# 스냅샷)와는 별개 저장소, "발행"만 그쪽을 조립해서 부른다.
# (이 파일의 "v1.X" 섹션 버전 태그는 v1.28(줄 696 근방) 이후로는 안 붙여왔다 —
# 맨 위 모듈 docstring도 v1.20에 멈춰있는 등 이 파일 자체에서도 v1.29+ 구간은
# 비공식적으로 날짜만 남기는 쪽으로 굳어진 상태. 여기서 새로 번호를 매기지
# 않고 그 관례를 따른다.)

@router.get("/internal/admin/prompt-lab/{category}/{name}")
def internal_get_prompt_lab_doc(category: str, name: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return prompt_lab_repo.get_doc(category, name)


@router.put("/internal/admin/prompt-lab/{category}/{name}/description")
def internal_update_lab_description(category: str, name: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    text = payload.get("text") or ""
    _check_field_size(text, "description")
    return prompt_lab_repo.update_description(category, name, text)


@router.put("/internal/admin/prompt-lab/{category}/{name}/instructions")
def internal_update_lab_instructions(category: str, name: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    text = payload.get("text") or ""
    _check_field_size(text, "instructions")
    return prompt_lab_repo.update_instructions(category, name, text)


@router.post("/internal/admin/prompt-lab/{category}/{name}/files")
def internal_create_lab_file(category: str, name: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    file_name = (payload.get("name") or "").strip() or "이름 없음"
    content = payload.get("content") or ""
    _check_field_size(content, "content")
    return prompt_lab_repo.create_file(category, name, file_name, content)


@router.get("/internal/admin/prompt-lab/{category}/{name}/files/{file_id}")
def internal_get_lab_file(category: str, name: str, file_id: int, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    f = prompt_lab_repo.get_file_content(file_id)
    if not f:
        raise HTTPException(status_code=404, detail="file not found")
    return f


@router.put("/internal/admin/prompt-lab/{category}/{name}/files/{file_id}")
def internal_update_lab_file(category: str, name: str, file_id: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    # update_file()은 name/content 둘 다 없을 때도 None을 돌려준다(파일이
    # 실제로 없는 경우와 같은 신호) — "수정할 내용 없음"과 "파일 없음"을
    # 여기서 먼저 구분해야 전자를 404로 잘못 응답하지 않는다.
    if payload.get("name") is None and payload.get("content") is None:
        raise HTTPException(status_code=400, detail="name or content required")
    if payload.get("content") is not None:
        _check_field_size(payload["content"], "content")
    r = prompt_lab_repo.update_file(file_id, payload.get("name"), payload.get("content"))
    if r is None:
        raise HTTPException(status_code=404, detail="file not found")
    return r


@router.delete("/internal/admin/prompt-lab/{category}/{name}/files/{file_id}")
def internal_delete_lab_file(category: str, name: str, file_id: int, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    if not prompt_lab_repo.delete_file(file_id):
        raise HTTPException(status_code=404, detail="file not found")
    return {"deleted": True}


@router.post("/internal/admin/prompt-lab/{category}/{name}/publish")
def internal_publish_prompt_lab(category: str, name: str, x_internal_token: Optional[str] = Header(default=None)):
    """설명+지침+파일을 조립해 prompts_repo에 새 프로덕션 버전으로 발행한다
    — admin/backend가 조립 로직 없이 그대로 위임할 수 있게 서버 쪽에서
    한 번에 처리한다(프론트가 들고 있던 조립 문자열을 다시 그대로
    쏴주는 것보다, 서버가 지금 저장된 desc/instructions/files를 정본으로
    다시 조립하는 편이 "화면에 아직 저장 안 한 편집 중 내용"이 실수로
    발행되는 걸 막는다).

    2026-09-26 — sections에 조립 전 원본 구조(설명/지침/파일 분리)도 같이
    남긴다(사용자 지적: 테스트 카드의 "생성 프롬프트" 참조가 프로덕션
    패널과 다른 구조라 헷갈림 — 프론트가 이 버전을 다시 볼 때 flattened
    content 대신 이 구조를 그대로 재현해서 프로덕션과 동일하게 보여준다).
    /prompts/edit(PromptDrawer)의 sections(PromptSectionKey="content" 형태)
    와는 필드 모양이 다르다 — 같은 컬럼이지만 카테고리별로 어느 편집기가
    발행했는지에 따라 다른 모양이 들어가는 건 이미 sections가 unknown
    타입(lib/types.ts::PromptDetail.sections)으로 다뤄지고 있어서 문제
    없다."""
    _check_admin_token(x_internal_token)
    doc = prompt_lab_repo.get_doc(category, name)
    parts = []
    if doc["description"].strip():
        parts.append(doc["description"].strip())
    if doc["instructions"].strip():
        parts.append(doc["instructions"].strip())
    lab_files = []
    for meta in doc["files"]:
        full = prompt_lab_repo.get_file_content(meta["id"])
        if full and full["content"].strip():
            parts.append(f"### 파일 · {full['name']}\n\n{full['content'].strip()}")
            lab_files.append({"name": full["name"], "content": full["content"]})
    content = "\n\n".join(parts)
    if not content:
        raise HTTPException(status_code=400, detail="empty prompt — nothing to publish")
    sections = {
        "kind": "prompt_lab",
        "description": doc["description"],
        "instructions": doc["instructions"],
        "files": lab_files,
    }
    return prompts_repo.update_prompt(category, name, content, sections=sections)


@router.get("/internal/admin/prompts/{category}/{name}/activation-history")
def internal_prompt_activation_history(category: str, name: str, x_internal_token: Optional[str] = Header(default=None)):
    """2026-09-26 신설, 사용자 요청 — "프로덕션에 적용한 이력들도 남아야
    해요, 몇시 몇분... 날짜에 했는지". audit_repo.list_prompt_activation_history
    참고 — 새 저장소 없이 기존 audit_logs를 그대로 거른다."""
    _check_admin_token(x_internal_token)
    return {"history": audit_repo.list_prompt_activation_history(category, name)}
