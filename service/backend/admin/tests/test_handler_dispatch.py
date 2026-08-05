"""handler dispatch — 라우팅 · 인증 게이트 · 감사 컨텍스트 바인딩.

Run from service/backend/::

    python3 -m pytest admin/tests/test_handler_dispatch.py -v
"""
from __future__ import annotations

import json

import pytest

from conftest import assert_no_cors

import auth
import handler
from shared import audit


def _event(route_key: str, *, ip: str = "203.0.113.7", token: str = "Bearer t") -> dict:
    return {
        "requestContext": {"routeKey": route_key, "http": {"method": "GET", "path": "/admin/x",
                                                           "sourceIp": ip}},
        "headers": {"authorization": token},
        "body": "",
    }


@pytest.fixture(autouse=True)
def _clean() -> None:
    audit.reset_context()
    yield
    audit.reset_context()


def test_unknown_route_is_404(monkeypatch) -> None:
    resp = handler.lambda_handler(_event("GET /admin/nope"), None)
    assert resp["statusCode"] == 404
    assert json.loads(resp["body"])["error"] == "not found"
    assert_no_cors(resp)


def test_invalid_jwt_is_401(monkeypatch) -> None:
    def boom(_h):
        raise auth.AuthError("token expired")
    monkeypatch.setattr(auth, "verify_jwt", boom)
    resp = handler.lambda_handler(_event("GET /admin/cost"), None)
    assert resp["statusCode"] == 401
    assert json.loads(resp["body"])["error"] == "token expired"
    assert_no_cors(resp)


def _spy_route(seen: dict):
    """dispatch 시점의 감사 컨텍스트를 잡아내는 가짜 라우트."""
    def route(body, path_params, query_params):
        seen.update(audit._ctx.get())
        return {"statusCode": 200, "headers": {}, "body": "{}"}
    return route


def test_dispatch_binds_session_and_source_ip(monkeypatch) -> None:
    seen: dict = {}
    monkeypatch.setattr(auth, "verify_jwt", lambda _h: {"sub": "admin", "iat": 1785000000})
    # HANDLERS 는 dict 다. dict 의 get 은 읽기 전용이라 setattr 가 안 되므로
    # setitem 으로 라우트 하나를 갈아끼운다.
    monkeypatch.setitem(handler.HANDLERS, "GET /admin/cost", (_spy_route(seen), True))
    handler.lambda_handler(_event("GET /admin/cost"), None)
    assert seen["source_ip"] == "203.0.113.7"
    assert seen["session"] == "2026-07-25T17:20:00Z"


def test_public_route_binds_ip_without_session(monkeypatch) -> None:
    seen: dict = {}
    monkeypatch.setitem(handler.HANDLERS, "POST /admin/login", (_spy_route(seen), False))
    handler.lambda_handler(_event("POST /admin/login"), None)
    assert seen["source_ip"] == "203.0.113.7"
    assert "session" not in seen


def test_context_is_cleared_after_dispatch(monkeypatch) -> None:
    """warm 컨테이너의 다음 요청에 이전 세션이 새면 감사 로그가 거짓말을 한다."""
    seen: dict = {}
    monkeypatch.setattr(auth, "verify_jwt", lambda _h: {"sub": "admin", "iat": 1785000000})
    monkeypatch.setitem(handler.HANDLERS, "GET /admin/cost", (_spy_route(seen), True))
    handler.lambda_handler(_event("GET /admin/cost"), None)
    # dispatch 중에는 바인딩돼 있었고(이게 없으면 구현이 아예 없어도 통과한다)
    assert seen["session"] == "2026-07-25T17:20:00Z"
    # 끝난 뒤엔 비워졌다
    assert audit._ctx.get() == {}


def test_context_is_cleared_even_when_route_raises(monkeypatch) -> None:
    """finally 를 쓰는 유일한 이유 — 라우트가 터져도 리셋돼야 한다.

    이 단언이 없으면 bind(); route(); reset() 같은 예외 비안전 구현도 통과한다.
    실제로 이 경로를 보는 테스트가 하나도 없으면, 나중에 finally 가 조용히
    사라져도 아무도 모른다.
    """
    def boom(body: dict, path_params: dict, query_params: dict) -> dict:
        raise KeyError("boom")

    monkeypatch.setattr(auth, "verify_jwt", lambda _h: {"sub": "admin", "iat": 1785000000})
    monkeypatch.setitem(handler.HANDLERS, "GET /admin/cost", (boom, True))

    resp = handler.lambda_handler(_event("GET /admin/cost"), None)
    assert resp["statusCode"] == 500
    assert json.loads(resp["body"])["error"] == "internal server error"
    assert audit._ctx.get() == {}


def test_session_from_claims_converts_iat_to_iso() -> None:
    assert handler._session_from_claims({"iat": 1785000000}) == "2026-07-25T17:20:00Z"
    assert handler._session_from_claims({}) is None
    assert handler._session_from_claims(None) is None
