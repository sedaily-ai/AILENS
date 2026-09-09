"""quiz 라우트 유닛 테스트 — quiz_repo 를 fake 로 대체 (test_posts_routes.py와 같은 구조).

Run from repo root::

    python3 -m pytest admin/backend/tests/test_quiz_routes.py -v
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routes import quiz


def _quiz(**over) -> dict:
    base = {
        "id": "11111111-1111-1111-1111-111111111111",
        "term": "기준금리",
        "explain": "중앙은행이 시중은행에 자금을 빌려줄 때 적용하는 금리.",
        "options": ["물가지수", "환율", "국채수익률"],
        "status": "draft",
        "publish_date": "2026-07-27",
        "created_by": "admin",
        "created_at": "2026-07-27T09:00:00+00:00",
        "updated_at": "2026-07-27T09:00:00+00:00",
        "published_at": None,
    }
    base.update(over)
    return base


def test_create_requires_term() -> None:
    resp = quiz.handle_create({"explain": "설명"}, {}, {})
    assert resp["statusCode"] == 400
    assert "term" in json.loads(resp["body"])["error"]


def test_create_requires_explain() -> None:
    resp = quiz.handle_create({"term": "기준금리"}, {}, {})
    assert resp["statusCode"] == 400
    assert "explain" in json.loads(resp["body"])["error"]


def test_create_rejects_non_list_options() -> None:
    resp = quiz.handle_create(
        {"term": "기준금리", "explain": "설명", "options": "물가지수"}, {}, {}
    )
    assert resp["statusCode"] == 400
    assert "options" in json.loads(resp["body"])["error"]


def test_create_rejects_non_string_option_items() -> None:
    resp = quiz.handle_create(
        {"term": "기준금리", "explain": "설명", "options": ["ok", 1]}, {}, {}
    )
    assert resp["statusCode"] == 400


def test_create_returns_201(monkeypatch) -> None:
    monkeypatch.setattr(quiz.quiz_repo, "create", lambda body, created_by: _quiz())
    resp = quiz.handle_create({"term": "기준금리", "explain": "설명"}, {}, {})
    assert resp["statusCode"] == 201
    assert json.loads(resp["body"])["quiz"]["term"] == "기준금리"


def test_update_allows_partial_body_without_term(monkeypatch) -> None:
    """수정은 create 와 달리 term/explain 이 없어도 통과한다(require_all=False)."""
    monkeypatch.setattr(
        quiz.quiz_repo, "update", lambda qid, body: _quiz(explain=body["explain"])
    )
    resp = quiz.handle_update({"explain": "새 설명"}, {"id": _quiz()["id"]}, {})
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["quiz"]["explain"] == "새 설명"


def test_update_still_rejects_bad_options(monkeypatch) -> None:
    resp = quiz.handle_update({"options": "bad"}, {"id": _quiz()["id"]}, {})
    assert resp["statusCode"] == 400


def test_update_returns_404_when_missing(monkeypatch) -> None:
    monkeypatch.setattr(quiz.quiz_repo, "update", lambda qid, body: None)
    resp = quiz.handle_update({"term": "기준금리"}, {"id": "nope"}, {})
    assert resp["statusCode"] == 404


def test_get_returns_404_when_missing(monkeypatch) -> None:
    monkeypatch.setattr(quiz.quiz_repo, "get", lambda qid: None)
    resp = quiz.handle_get({}, {"id": _quiz()["id"]}, {})
    assert resp["statusCode"] == 404


def test_get_returns_quiz(monkeypatch) -> None:
    monkeypatch.setattr(quiz.quiz_repo, "get", lambda qid: _quiz(id=qid))
    resp = quiz.handle_get({}, {"id": _quiz()["id"]}, {})
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["quiz"]["id"] == _quiz()["id"]


def test_list_passes_status_and_limit(monkeypatch) -> None:
    seen = {}

    def _fake_list(status, limit):
        seen.update(status=status, limit=limit)
        return [_quiz()]

    monkeypatch.setattr(quiz.quiz_repo, "list_quiz", _fake_list)
    resp = quiz.handle_list({}, {}, {"status": "draft", "limit": "10"})
    assert resp["statusCode"] == 200
    assert seen == {"status": "draft", "limit": 10}
    assert json.loads(resp["body"])["count"] == 1


def test_list_clamps_bad_limit(monkeypatch) -> None:
    seen = {}

    def _fake_list(status, limit):
        seen["limit"] = limit
        return []

    monkeypatch.setattr(quiz.quiz_repo, "list_quiz", _fake_list)
    quiz.handle_list({}, {}, {"limit": "9999"})
    assert seen["limit"] == 200
    quiz.handle_list({}, {}, {"limit": "abc"})
    assert seen["limit"] == 50


def test_publish_requires_3_valid_options(monkeypatch) -> None:
    """발행 시엔 create/update 와 별도로 실제 오답 3개가 채워졌는지 확인한다
    (핵심 비즈니스 규칙 — options 필드 자체는 draft 저장 시엔 비어 있어도 통과)."""
    monkeypatch.setattr(
        quiz.quiz_repo, "get", lambda qid: _quiz(options=["물가지수", "환율"])
    )
    resp = quiz.handle_publish({}, {"id": _quiz()["id"]}, {})
    assert resp["statusCode"] == 400
    assert "오답" in json.loads(resp["body"])["error"]


def test_publish_ignores_blank_option_strings(monkeypatch) -> None:
    """빈 문자열만 채운 오답은 유효하지 않은 것으로 센다."""
    monkeypatch.setattr(
        quiz.quiz_repo, "get", lambda qid: _quiz(options=["물가지수", "환율", "  "])
    )
    resp = quiz.handle_publish({}, {"id": _quiz()["id"]}, {})
    assert resp["statusCode"] == 400


def test_publish_returns_404_when_missing(monkeypatch) -> None:
    monkeypatch.setattr(quiz.quiz_repo, "get", lambda qid: None)
    resp = quiz.handle_publish({}, {"id": "nope"}, {})
    assert resp["statusCode"] == 404


def test_publish_sets_status(monkeypatch) -> None:
    monkeypatch.setattr(quiz.quiz_repo, "get", lambda qid: _quiz())
    monkeypatch.setattr(
        quiz.quiz_repo, "set_status", lambda qid, s: _quiz(status=s, published_at="now")
    )
    resp = quiz.handle_publish({}, {"id": _quiz()["id"]}, {})
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["quiz"]["status"] == "published"


def test_unpublish_sets_draft(monkeypatch) -> None:
    monkeypatch.setattr(quiz.quiz_repo, "set_status", lambda qid, s: _quiz(status=s))
    resp = quiz.handle_unpublish({}, {"id": _quiz()["id"]}, {})
    assert json.loads(resp["body"])["quiz"]["status"] == "draft"


def test_unpublish_returns_404_when_missing(monkeypatch) -> None:
    monkeypatch.setattr(quiz.quiz_repo, "set_status", lambda qid, s: None)
    resp = quiz.handle_unpublish({}, {"id": "nope"}, {})
    assert resp["statusCode"] == 404


def test_delete_returns_404_when_already_gone(monkeypatch) -> None:
    monkeypatch.setattr(quiz.quiz_repo, "soft_delete", lambda qid: False)
    resp = quiz.handle_delete({}, {"id": _quiz()["id"]}, {})
    assert resp["statusCode"] == 404


def test_delete_returns_ok(monkeypatch) -> None:
    monkeypatch.setattr(quiz.quiz_repo, "soft_delete", lambda qid: True)
    resp = quiz.handle_delete({}, {"id": _quiz()["id"]}, {})
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["ok"] is True


from conftest import FakeTable

from shared import audit, ddb_client


@pytest.fixture
def audit_table(monkeypatch) -> FakeTable:
    """이름은 그대로 두되(다른 테스트들이 참조), 실제로는 audit_repo.log_event
    를 스텁해 put_calls에 쌓는다 — 2026-09-09(v1.27) 감사 저장이
    PostgreSQL(lens-cms-api)로 옮겨가면서 config_table()과는 더 이상
    무관해졌다."""
    table = FakeTable()
    monkeypatch.setattr(ddb_client, "config_table", lambda: table)

    def fake_log_event(action, detail, actor, session, source_ip):
        table.put_calls.append({"action": action, "detail": detail, "actor": actor})

    monkeypatch.setattr(audit.audit_repo, "log_event", fake_log_event)
    audit.reset_context()
    yield table
    audit.reset_context()


def test_create_writes_audit_row(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(
        quiz.quiz_repo, "create", lambda body, created_by: _quiz(term=body["term"])
    )
    resp = quiz.handle_create({"term": "기준금리", "explain": "설명"}, {}, {})
    assert resp["statusCode"] == 201
    assert audit_table.put_calls[0]["action"] == "quiz-create"
    assert audit_table.put_calls[0]["detail"]["term"] == "기준금리"


def test_update_writes_audit_row(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(
        quiz.quiz_repo, "update", lambda qid, body: _quiz(id=qid, explain=body["explain"])
    )
    resp = quiz.handle_update({"explain": "새 설명"}, {"id": _quiz()["id"]}, {})
    assert resp["statusCode"] == 200
    assert audit_table.put_calls[0]["action"] == "quiz-update"
    assert audit_table.put_calls[0]["detail"]["id"] == _quiz()["id"]


def test_publish_writes_audit_row(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(quiz.quiz_repo, "get", lambda qid: _quiz())
    monkeypatch.setattr(quiz.quiz_repo, "set_status", lambda qid, s: _quiz(id=qid, status=s))
    resp = quiz.handle_publish({}, {"id": _quiz()["id"]}, {})
    assert resp["statusCode"] == 200
    assert len(audit_table.put_calls) == 1
    assert audit_table.put_calls[0]["action"] == "quiz-publish"


def test_publish_rejection_writes_no_audit(monkeypatch, audit_table) -> None:
    """오답 3개 미달로 발행이 막히면 감사 로그도 안 남는다."""
    monkeypatch.setattr(quiz.quiz_repo, "get", lambda qid: _quiz(options=[]))
    resp = quiz.handle_publish({}, {"id": _quiz()["id"]}, {})
    assert resp["statusCode"] == 400
    assert audit_table.put_calls == []


def test_unpublish_uses_distinct_action(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(quiz.quiz_repo, "set_status", lambda qid, s: _quiz(id=qid, status=s))
    quiz.handle_unpublish({}, {"id": _quiz()["id"]}, {})
    assert audit_table.put_calls[0]["action"] == "quiz-unpublish"


def test_delete_writes_audit_row(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(quiz.quiz_repo, "soft_delete", lambda qid: True)
    resp = quiz.handle_delete({}, {"id": "22222222-2222-2222-2222-222222222222"}, {})
    assert resp["statusCode"] == 200
    assert audit_table.put_calls[0]["action"] == "quiz-delete"
    assert audit_table.put_calls[0]["detail"]["id"] == "22222222-2222-2222-2222-222222222222"


def test_failed_validation_writes_no_audit(audit_table) -> None:
    """검증 실패는 감사 대상이 아니다."""
    resp = quiz.handle_create({"explain": "설명"}, {}, {})
    assert resp["statusCode"] == 400
    assert audit_table.put_calls == []


def test_missing_quiz_delete_writes_no_audit(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(quiz.quiz_repo, "soft_delete", lambda qid: False)
    resp = quiz.handle_delete({}, {"id": "nope"}, {})
    assert resp["statusCode"] == 404
    assert audit_table.put_calls == []
