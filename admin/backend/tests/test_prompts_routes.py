"""prompts 3개 라우트의 현재 응답을 박제한다 (characterization).

DDB schema: pk='PROMPT#<category>/<name>', sk='v#<int>' | 'LATEST'

Run from service/backend/::

    python3 -m pytest admin/tests/test_prompts_routes.py -v
"""
from __future__ import annotations

import json

import pytest

from conftest import FakeTable, assert_no_cors

from routes import prompts
from shared import ddb_client

_PK = "PROMPT#transform/nt"


@pytest.fixture
def wired(monkeypatch) -> FakeTable:
    # v# 행이 없으면 이력 조회가 아예 실행되지 않아 test_get_returns_active_content_and_history
    # 의 sk 파싱·내림차순·필드 매핑 로직이 무의미해진다. 반드시 v# 행을 포함할 것.
    table = FakeTable(
        items=[
            {"pk": _PK, "sk": "LATEST", "active_version": 3, "updated_at": "2026-07-01T00:00:00Z"},
            {"pk": _PK, "sk": "v#1", "created_at": "2026-06-01T00:00:00Z", "actor": "admin"},
            {"pk": _PK, "sk": "v#2", "created_at": "2026-06-15T00:00:00Z", "actor": "admin"},
            {"pk": _PK, "sk": "v#3", "created_at": "2026-07-01T00:00:00Z", "actor": "admin"},
        ],
        get_map={
            (_PK, "LATEST"): {"pk": _PK, "sk": "LATEST", "active_version": 3},
            (_PK, "v#3"): {"pk": _PK, "sk": "v#3", "content": "본문 v3"},
        },
    )
    monkeypatch.setattr(ddb_client, "prompts_table", lambda: table)
    # prompts.handle_update 의 audit.log() 는 ddb_client.config_table() 을 통해 쓴다
    # (prompts_table 과 별개 accessor) — 같은 FakeTable 로 묶어야 put_calls 에서 보인다.
    monkeypatch.setattr(ddb_client, "config_table", lambda: table)
    return table


def test_list_strips_prefix_and_sorts(wired) -> None:
    resp = prompts.handle_list({}, {}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert list(body) == ["prompts"]
    assert body["prompts"] == [
        {"id": "transform/nt", "active_version": 3, "updated_at": "2026-07-01T00:00:00Z"}
    ]
    assert_no_cors(resp)


def test_get_requires_category_and_name(wired) -> None:
    resp = prompts.handle_get({}, {"category": "transform"}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "category and name required"
    assert_no_cors(resp)


def test_get_missing_prompt_is_404(wired) -> None:
    resp = prompts.handle_get({}, {"category": "nope", "name": "x"}, {})
    assert resp["statusCode"] == 404
    assert json.loads(resp["body"])["error"] == "prompt not found: nope/x"
    assert_no_cors(resp)


def test_get_returns_active_content_and_history(wired) -> None:
    resp = prompts.handle_get({}, {"category": "transform", "name": "nt"}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"id", "active_content", "active_version", "history"}
    assert body["id"] == "transform/nt"
    assert body["active_content"] == "본문 v3"
    assert body["active_version"] == 3
    # sk 파싱(v#N → N) · 내림차순 · 필드 매핑을 한 번에 고정한다.
    assert body["history"] == [
        {"version": 3, "created_at": "2026-07-01T00:00:00Z", "actor": "admin"},
        {"version": 2, "created_at": "2026-06-15T00:00:00Z", "actor": "admin"},
        {"version": 1, "created_at": "2026-06-01T00:00:00Z", "actor": "admin"},
    ]
    assert_no_cors(resp)


def test_get_history_sorts_numerically_not_lexicographically(monkeypatch) -> None:
    """버전 10을 넘으면 사전순 정렬이 목록을 망가뜨린다 — 숫자 정렬을 고정한다.

    ``sk`` 는 ``'v#12'`` 같은 문자열이라 DynamoDB 가 사전순으로 정렬한다:
    ``v#1, v#10, v#11, v#12, v#2, ... v#9``. 이전 구현은
    ``ScanIndexForward=False, Limit=10`` 으로 DB 절단에 의존해
    ``[9,8,7,6,5,4,3,2,12,11]`` 을 돌려줬다 — 최신 v#12·v#11 이 목록 끝에
    처박히고 **v#10 과 v#1 은 아예 빠졌다.** 이 테스트는 그 버그가 아니라
    올바른 동작(버전 번호 내림차순 상위 10개)을 고정한다.
    """
    rows = [{"pk": _PK, "sk": "LATEST", "active_version": 12}]
    rows += [
        {"pk": _PK, "sk": f"v#{n}", "created_at": f"2026-07-{n:02d}T00:00:00Z", "actor": "admin"}
        for n in range(1, 13)
    ]
    table = FakeTable(
        items=rows,
        get_map={
            (_PK, "LATEST"): {"pk": _PK, "sk": "LATEST", "active_version": 12},
            (_PK, "v#12"): {"pk": _PK, "sk": "v#12", "content": "본문 v12"},
        },
    )
    monkeypatch.setattr(ddb_client, "prompts_table", lambda: table)

    body = json.loads(prompts.handle_get({}, {"category": "transform", "name": "nt"}, {})["body"])
    assert len(body["history"]) == 10
    assert [h["version"] for h in body["history"]] == [12, 11, 10, 9, 8, 7, 6, 5, 4, 3]
    # 최신 버전이 맨 앞이어야 한다 — 관리자 화면이 이 순서를 그대로 렌더한다.
    assert body["history"][0]["version"] == body["active_version"]
    # created_at 이 버전과 짝을 유지하는지 (정렬이 메타데이터를 섞지 않았는지)
    assert body["history"][0]["created_at"] == "2026-07-12T00:00:00Z"
    assert body["history"][2]["created_at"] == "2026-07-10T00:00:00Z"


def test_update_requires_content(wired) -> None:
    resp = prompts.handle_update({}, {"category": "transform", "name": "nt"}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "content required"
    assert_no_cors(resp)


def test_update_creates_prompt_when_latest_missing(wired) -> None:
    """2026-08-14 동작 변경: LATEST 부재는 404 가 아니라 v#1 생성(upsert)이다.

    이전에는 404 였다. 그래서 관리자 화면이 참조하는 id(``letters/draft`` 등)를
    API 로 만들 방법이 없었다 — create 라우트도 없어서 DDB 를 직접 시드해야
    했고, 실제로 글 관리의 프롬프트 버튼은 열면 에러만 떴다. 새 프롬프트를
    화면에서 바로 만들 수 있어야 하므로 의도적으로 바꿨다.
    """
    resp = prompts.handle_update({"content": "첫 저장"}, {"category": "letters", "name": "draft"}, {})
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"]) == {"ok": True, "new_version": 1, "created": True}
    # v#1 행 + LATEST 포인터가 함께 생긴다. update_item 의 SET 은 아이템이
    # 없으면 만들어 주므로 LATEST 쓰기는 기존 코드 그대로다.
    assert wired.put_calls[0]["pk"] == "PROMPT#letters/draft"
    assert wired.put_calls[0]["sk"] == "v#1"
    assert len(wired.update_calls) == 1
    assert_no_cors(resp)


def test_update_bumps_version_and_writes_both_rows(wired) -> None:
    resp = prompts.handle_update({"content": "본문 v4"}, {"category": "transform", "name": "nt"}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body == {"ok": True, "new_version": 4, "created": False}
    assert wired.put_calls[0]["sk"] == "v#4"
    assert wired.put_calls[0]["content"] == "본문 v4"
    # sections 를 안 보내면 그 속성 자체가 없어야 한다 — 옛 행과 모양이 같다.
    assert "sections_json" not in wired.put_calls[0]
    assert len(wired.update_calls) == 1
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


def test_update_stores_sections_as_json_string(wired) -> None:
    resp = prompts.handle_update(
        {"content": "## 설명\n1면 요약용", "sections": _SECTIONS},
        {"category": "transform", "name": "nt"},
        {},
    )
    assert resp["statusCode"] == 200
    row = wired.put_calls[0]
    # content 는 산문 그대로 — 구조가 섞이면 Bedrock 에 JSON 이 흘러간다.
    assert row["content"] == "## 설명\n1면 요약용"
    assert json.loads(row["sections_json"]) == _SECTIONS
    # 한글이 \uXXXX 로 이스케이프되면 바이트가 불어난다(ensure_ascii=False 확인).
    assert "1면 요약용" in row["sections_json"]


def test_update_rejects_non_object_sections(wired) -> None:
    resp = prompts.handle_update(
        {"content": "x", "sections": "not an object"},
        {"category": "transform", "name": "nt"},
        {},
    )
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "sections must be an object"
    assert wired.put_calls == []
    assert_no_cors(resp)


def test_update_rejects_oversized_payload(wired) -> None:
    """DDB 아이템 한계(400KB)를 넘기기 전에 400 으로 막는다.

    한글은 UTF-8 에서 3바이트다 — 글자 수로 재면 3배를 놓친다. 12만 자면
    360KB 로 한계(340KB)를 넘어야 한다.
    """
    resp = prompts.handle_update(
        {"content": "가" * 120_000},
        {"category": "transform", "name": "nt"},
        {},
    )
    assert resp["statusCode"] == 400
    assert "prompt too large" in json.loads(resp["body"])["error"]
    assert wired.put_calls == []
    assert_no_cors(resp)


def test_get_returns_sections_when_present(monkeypatch) -> None:
    table = FakeTable(
        items=[{"pk": _PK, "sk": "v#1", "created_at": "2026-08-14T00:00:00Z", "actor": "admin"}],
        get_map={
            (_PK, "LATEST"): {"pk": _PK, "sk": "LATEST", "active_version": 1},
            (_PK, "v#1"): {
                "pk": _PK,
                "sk": "v#1",
                "content": "## 설명\n1면 요약용",
                "sections_json": json.dumps(_SECTIONS, ensure_ascii=False),
            },
        },
    )
    monkeypatch.setattr(ddb_client, "prompts_table", lambda: table)

    body = json.loads(prompts.handle_get({}, {"category": "transform", "name": "nt"}, {})["body"])
    assert body["sections"] == _SECTIONS
    # 기존 필드는 그대로 — /prompts/edit 의 평문 편집기가 계속 동작해야 한다.
    assert body["active_content"] == "## 설명\n1면 요약용"
    assert body["active_version"] == 1


def test_get_ignores_broken_sections_json(monkeypatch) -> None:
    """깨진 JSON 은 500 이 아니라 '구조 없음'으로 취급한다 — 편집기가
    active_content 를 한 섹션으로 열어 복구할 수 있어야 한다."""
    table = FakeTable(
        items=[{"pk": _PK, "sk": "v#1", "created_at": "2026-08-14T00:00:00Z", "actor": "admin"}],
        get_map={
            (_PK, "LATEST"): {"pk": _PK, "sk": "LATEST", "active_version": 1},
            (_PK, "v#1"): {"pk": _PK, "sk": "v#1", "content": "본문", "sections_json": "{깨짐"},
        },
    )
    monkeypatch.setattr(ddb_client, "prompts_table", lambda: table)

    resp = prompts.handle_get({}, {"category": "transform", "name": "nt"}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert "sections" not in body
    assert body["active_content"] == "본문"


def test_update_writes_audit_row(wired) -> None:
    """prompts.handle_update 은 auth.audit_log 가 아니라 audit.log 를 직접 부른다 —
    죽은 monkeypatch 스텁이 가리던 경로라 이관 후 무단언이었다 (리뷰 지적)."""
    prompts.handle_update({"content": "본문 v4"}, {"category": "transform", "name": "nt"}, {})
    # put_calls[0] 은 새 버전 행(v#4), audit 행은 그 뒤에 온다.
    assert wired.put_calls[-1]["action"] == "prompt-update"
