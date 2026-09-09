"""prompts 3개 라우트의 현재 응답을 박제한다 (characterization).

2026-09-09(v1.27): 저장이 DynamoDB에서 PostgreSQL(lens-cms-api, repo/
prompts_repo.py 경유)로 바뀌면서 FakeTable 기반 monkeypatch에서
prompts_repo 함수 자체를 스텁하는 방식으로 다시 썼다.

DynamoDB 시절 있던 두 테스트는 이번에 뺐다(둘 다 지금 구조에서 애초에
일어날 수 없는 시나리오를 막던 것):
  - 사전식 정렬 버그 회피 테스트: 버전 정렬을 이 파일이 하지 않는다
    (서버가 ORDER BY version DESC로 SQL에서 처리 — INTEGER라 사전식
    정렬 버그 자체가 구조적으로 불가능).
  - 깨진 sections_json 방어 테스트: sections는 이제 JSONB 컬럼이라
    애초에 깨진 JSON이 저장될 수 없다(문자열 파싱 자체가 사라짐).

Run from admin/backend/::

    python3 -m pytest tests/test_prompts_routes.py -v
"""
from __future__ import annotations

import json

import pytest

from conftest import assert_no_cors

from routes import prompts


@pytest.fixture
def audit_calls(monkeypatch) -> list:
    calls: list = []
    monkeypatch.setattr(prompts.audit, "log", lambda action, detail=None: calls.append((action, detail)))
    return calls


def test_list_strips_prefix_and_sorts(monkeypatch) -> None:
    monkeypatch.setattr(
        prompts.prompts_repo, "list_prompts",
        lambda: [
            {"id": "video/published", "active_version": 1, "updated_at": "2026-07-01T00:00:00Z"},
            {"id": "transform/nt", "active_version": 3, "updated_at": "2026-07-01T00:00:00Z"},
        ],
    )
    resp = prompts.handle_list({}, {}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert list(body) == ["prompts"]
    # repo가 이미 (category, name)순으로 정렬해 주지만, handle_list이 id
    # 문자열로 한 번 더 정렬한다는 계약도 같이 고정한다.
    assert body["prompts"] == [
        {"id": "transform/nt", "active_version": 3, "updated_at": "2026-07-01T00:00:00Z"},
        {"id": "video/published", "active_version": 1, "updated_at": "2026-07-01T00:00:00Z"},
    ]
    assert_no_cors(resp)


def test_get_requires_category_and_name(monkeypatch) -> None:
    resp = prompts.handle_get({}, {"category": "transform"}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "category and name required"
    assert_no_cors(resp)


def test_get_missing_prompt_is_404(monkeypatch) -> None:
    monkeypatch.setattr(prompts.prompts_repo, "get_prompt", lambda category, name: None)
    resp = prompts.handle_get({}, {"category": "nope", "name": "x"}, {})
    assert resp["statusCode"] == 404
    assert json.loads(resp["body"])["error"] == "prompt not found: nope/x"
    assert_no_cors(resp)


def test_get_returns_active_content_and_history(monkeypatch) -> None:
    monkeypatch.setattr(
        prompts.prompts_repo, "get_prompt",
        lambda category, name: {
            "id": "transform/nt",
            "active_content": "본문 v3",
            "active_version": 3,
            "sections": None,
            "history": [
                {"version": 3, "created_at": "2026-07-01T00:00:00Z", "actor": "admin"},
                {"version": 2, "created_at": "2026-06-15T00:00:00Z", "actor": "admin"},
                {"version": 1, "created_at": "2026-06-01T00:00:00Z", "actor": "admin"},
            ],
        },
    )
    resp = prompts.handle_get({}, {"category": "transform", "name": "nt"}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"id", "active_content", "active_version", "history"}
    assert body["id"] == "transform/nt"
    assert body["active_content"] == "본문 v3"
    assert body["active_version"] == 3
    assert body["history"] == [
        {"version": 3, "created_at": "2026-07-01T00:00:00Z", "actor": "admin"},
        {"version": 2, "created_at": "2026-06-15T00:00:00Z", "actor": "admin"},
        {"version": 1, "created_at": "2026-06-01T00:00:00Z", "actor": "admin"},
    ]
    assert_no_cors(resp)


def test_update_requires_content(monkeypatch) -> None:
    resp = prompts.handle_update({}, {"category": "transform", "name": "nt"}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "content required"
    assert_no_cors(resp)


def test_update_creates_prompt_when_latest_missing(monkeypatch, audit_calls) -> None:
    """새 프롬프트는 upsert(created=True)로 만들어진다 — 404가 아니다.

    관리자 화면이 참조하는 id(``letters/draft`` 등)를 API로 만들 수 있어야
    하고, create 전용 라우트가 없어도 update가 그 역할을 겸한다.
    """
    calls: list = []
    monkeypatch.setattr(
        prompts.prompts_repo, "update_prompt",
        lambda category, name, content, sections: (
            calls.append((category, name, content, sections))
            or {"created": True, "new_version": 1, "prev_version": 0}
        ),
    )
    resp = prompts.handle_update({"content": "첫 저장"}, {"category": "letters", "name": "draft"}, {})
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"]) == {"ok": True, "new_version": 1, "created": True}
    assert calls == [("letters", "draft", "첫 저장", None)]
    assert audit_calls == [("prompt-update", {
        "prompt": "letters/draft", "new_version": 1, "prev_version": 0,
        "created": True, "has_sections": False, "bytes": len("첫 저장".encode("utf-8")),
    })]
    assert_no_cors(resp)


def test_update_bumps_version_and_writes_both_rows(monkeypatch, audit_calls) -> None:
    monkeypatch.setattr(
        prompts.prompts_repo, "update_prompt",
        lambda category, name, content, sections: {"created": False, "new_version": 4, "prev_version": 3},
    )
    resp = prompts.handle_update({"content": "본문 v4"}, {"category": "transform", "name": "nt"}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body == {"ok": True, "new_version": 4, "created": False}
    assert audit_calls[0][0] == "prompt-update"
    assert audit_calls[0][1]["new_version"] == 4
    assert_no_cors(resp)


# ---------------------------------------------------------------------------
# sections — 편집기용 구조 (content 는 모델이 읽는 산문으로 유지)
# ---------------------------------------------------------------------------

_SECTIONS = {
    "description": {"text": "1면 요약용", "format": "text", "attachments": []},
    "structure": {"text": "1. 헤드라인", "format": "markdown", "attachments": []},
    "guidelines": {
        "text": "- 간결하게",
        "format": "markdown",
        "attachments": [
            {"name": "tone.md", "size": 12, "format": "markdown", "content": "담담하게"}
        ],
    },
}


def test_update_passes_sections_as_dict(monkeypatch, audit_calls) -> None:
    """content는 산문 그대로, sections는 dict 그대로 repo에 넘어간다 — JSONB라
    이 계층에서 JSON 문자열로 직렬화할 필요가 없어졌다(문자열화는 서버가 함)."""
    calls: list = []
    monkeypatch.setattr(
        prompts.prompts_repo, "update_prompt",
        lambda category, name, content, sections: (
            calls.append((content, sections))
            or {"created": False, "new_version": 2, "prev_version": 1}
        ),
    )
    resp = prompts.handle_update(
        {"content": "## 설명\n1면 요약용", "sections": _SECTIONS},
        {"category": "transform", "name": "nt"},
        {},
    )
    assert resp["statusCode"] == 200
    assert calls == [("## 설명\n1면 요약용", _SECTIONS)]


def test_update_rejects_non_object_sections(monkeypatch, audit_calls) -> None:
    called = []
    monkeypatch.setattr(prompts.prompts_repo, "update_prompt", lambda *a, **kw: called.append(1))
    resp = prompts.handle_update(
        {"content": "x", "sections": "not an object"},
        {"category": "transform", "name": "nt"},
        {},
    )
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "sections must be an object"
    assert called == []
    assert_no_cors(resp)


def test_update_rejects_oversized_payload(monkeypatch, audit_calls) -> None:
    """한글은 UTF-8에서 3바이트다 — 글자 수로 재면 3배를 놓친다. 12만 자면
    360KB로 상한(340KB)을 넘어야 한다. 이 상한은 원래 DDB 400KB 아이템
    한계 회피용이었지만, Postgres 전환 후에도 첨부 남용 방지용으로 유지."""
    called = []
    monkeypatch.setattr(prompts.prompts_repo, "update_prompt", lambda *a, **kw: called.append(1))
    resp = prompts.handle_update(
        {"content": "가" * 120_000},
        {"category": "transform", "name": "nt"},
        {},
    )
    assert resp["statusCode"] == 400
    assert "prompt too large" in json.loads(resp["body"])["error"]
    assert called == []
    assert_no_cors(resp)


def test_get_returns_sections_when_present(monkeypatch) -> None:
    monkeypatch.setattr(
        prompts.prompts_repo, "get_prompt",
        lambda category, name: {
            "id": "transform/nt",
            "active_content": "## 설명\n1면 요약용",
            "active_version": 1,
            "sections": _SECTIONS,
            "history": [],
        },
    )
    body = json.loads(prompts.handle_get({}, {"category": "transform", "name": "nt"}, {})["body"])
    assert body["sections"] == _SECTIONS
    # 기존 필드는 그대로 — /prompts/edit 의 평문 편집기가 계속 동작해야 한다.
    assert body["active_content"] == "## 설명\n1면 요약용"
    assert body["active_version"] == 1


def test_update_writes_audit_row(monkeypatch, audit_calls) -> None:
    monkeypatch.setattr(
        prompts.prompts_repo, "update_prompt",
        lambda category, name, content, sections: {"created": False, "new_version": 4, "prev_version": 3},
    )
    prompts.handle_update({"content": "본문 v4"}, {"category": "transform", "name": "nt"}, {})
    assert audit_calls[0][0] == "prompt-update"
