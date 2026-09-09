"""login · password-change 의 현재 응답을 박제한다 (characterization).

이 테스트는 "지금 이렇게 동작한다"를 고정하는 것이 목적이다. 4단계 이관에서
의도적으로 바꾸는 부분(에러 body 키)은 그때 이 파일을 명시적으로 고친다.

Run from service/backend/::

    python3 -m pytest admin/tests/test_auth_routes.py -v
"""
from __future__ import annotations

import json

import pytest
from argon2 import PasswordHasher

from conftest import FakeSSM, assert_no_cors

import auth
from routes import admin_password
from shared import ssm_client

_PH = PasswordHasher()
_GOOD = "correct-horse-battery"
_HASH = _PH.hash(_GOOD)


@pytest.fixture
def wired(monkeypatch) -> None:
    """lockout 없음 + 비밀번호 해시 준비된 상태.

    2026-09-09(v1.28): lockout 저장이 DynamoDB에서 PostgreSQL(lens-cms-api,
    repo/config_repo.py 경유)로 바뀌면서 FakeTable 대신 config_repo 함수를
    직접 스텁한다.
    """
    ssm = FakeSSM({auth.PASSWORD_HASH_PARAM: _HASH, auth.JWT_SECRET_PARAM: "test-secret"})
    monkeypatch.setattr(auth.config_repo, "check_lockout", lambda: None)
    monkeypatch.setattr(auth.config_repo, "record_login_fail", lambda threshold, lockout_minutes: (1, None))
    monkeypatch.setattr(auth.config_repo, "reset_login_fail", lambda: None)
    monkeypatch.setattr(ssm_client, "get_secure", ssm.get_secure)
    monkeypatch.setattr(ssm_client, "put_secure", ssm.put_secure)


def test_login_success_returns_token_and_expiry(wired) -> None:
    resp = auth.handle_login({"password": _GOOD}, {}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"token", "expires_at"}
    assert isinstance(body["token"], str) and body["token"]
    assert_no_cors(resp)


def test_login_empty_password_is_400_with_message_key(wired) -> None:
    resp = auth.handle_login({"password": ""}, {}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "password required"
    assert_no_cors(resp)


def test_login_wrong_password_is_401(wired) -> None:
    resp = auth.handle_login({"password": "wrong"}, {}, {})
    assert resp["statusCode"] == 401
    assert json.loads(resp["body"])["error"] == "invalid credentials"
    assert_no_cors(resp)


def test_login_lockout_is_423_with_retry_after_in_details(monkeypatch) -> None:
    """4단계 이관으로 retry_after_seconds 가 details 안으로 내려갔다.

    프런트는 status 423 만 보고 이 필드를 읽지 않으므로(login/page.tsx:25)
    화면 동작은 그대로다.
    """
    monkeypatch.setattr(auth, "_check_lockout", lambda: 300)
    resp = auth.handle_login({"password": _GOOD}, {}, {})
    assert resp["statusCode"] == 423
    body = json.loads(resp["body"])
    assert body["error"] == "locked out"
    assert body["details"]["retry_after_seconds"] == 300
    assert_no_cors(resp)


def test_password_change_requires_both_fields(wired) -> None:
    resp = admin_password.handle_change({"old": _GOOD}, {}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "old and new required"
    assert_no_cors(resp)


def test_password_change_enforces_min_length(wired) -> None:
    resp = admin_password.handle_change({"old": _GOOD, "new": "short"}, {}, {})
    assert resp["statusCode"] == 400
    assert "at least 12" in json.loads(resp["body"])["error"]
    assert_no_cors(resp)


def test_password_change_rejects_same_password(wired) -> None:
    resp = admin_password.handle_change({"old": _GOOD, "new": _GOOD}, {}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "new password must differ from old"
    assert_no_cors(resp)


def test_password_change_old_mismatch_is_401(wired) -> None:
    resp = admin_password.handle_change({"old": "nope", "new": "a-long-enough-pw"}, {}, {})
    assert resp["statusCode"] == 401
    assert json.loads(resp["body"])["error"] == "old password mismatch"
    assert_no_cors(resp)


def test_password_change_success_returns_ok(wired) -> None:
    resp = admin_password.handle_change({"old": _GOOD, "new": "a-long-enough-pw"}, {}, {})
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"]) == {"ok": True}
    assert_no_cors(resp)
