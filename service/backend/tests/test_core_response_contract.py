"""core/response.py 의 9개 함수 계약을 박제한다 (characterization).

v1 16개 + v2 14개 파일이 이 모듈을 쓴다. common/ 위임 리팩터링 전후로
statusCode · headers(CORS 포함) · body 가 동일해야 한다.

기존 service/backend/tests/ 의 통합 테스트와 달리 실 AWS 가 필요 없는
순수 함수 테스트다.

Run from service/backend/::

    python3 -m pytest tests/test_core_response_contract.py -v
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from config.constants import CORS_HEADERS
from core import response
from core.exceptions import (
    AuthenticationError,
    AuthorizationError,
    BackendError,
    ConfigurationError,
    ExternalServiceError,
    NotFoundError,
    RateLimitError,
    RepositoryError,
    TranslationError,
    ValidationError,
)


def _body(resp: dict) -> dict:
    return json.loads(resp["body"])


def test_success_response_includes_cors_headers() -> None:
    """admin 과 달리 v1 은 CORS 를 붙인다 — 이게 두 소비자의 유일한 차이다."""
    resp = response.success_response({"a": 1})
    assert resp["statusCode"] == 200
    for key, value in CORS_HEADERS.items():
        assert resp["headers"][key] == value
    assert _body(resp) == {"a": 1}


@pytest.mark.parametrize("make", [
    lambda: response.success_response({"a": 1}),
    lambda: response.error_response("boom", status_code=500),
    lambda: response.exception_to_response(ValidationError("bad", field="t")),
])
def test_v1_content_type_is_pinned_literally(make) -> None:
    """v1 의 ``Content-Type`` 을 **리터럴로** 고정한다.

    ``common/http.py`` 의 ``DEFAULT_HEADERS`` 는
    ``'application/json; charset=utf-8'`` 인데 ``config/constants.py`` 의
    ``CORS_HEADERS`` 는 ``'application/json'`` 이다. 두 값이 다르고, v1 이 옛
    값을 유지하는 건 ``_build`` 가 호출자 헤더를 **나중에** 병합하기 때문 —
    순전히 병합 순서에 의존하고 있다.

    위의 CORS 테스트들은 ``CORS_HEADERS.items()`` 를 돌기 때문에, 훗날 누가
    ``CORS_HEADERS`` 에서 ``Content-Type`` 을 빼면 v1 응답 30여 개가 조용히
    ``charset=utf-8`` 로 바뀌는데도 **스위트는 초록이다**(순회할 항목이 하나
    줄었을 뿐이므로). 그래서 상수에서 파생하지 않고 문자열을 직접 박는다.
    """
    resp = make()
    assert resp["headers"]["Content-Type"] == "application/json", (
        "v1 의 Content-Type 이 바뀌었다. 의도한 변경이면 이 테스트를 함께 고치되, "
        "기존 소비자 30여 개의 응답 헤더가 달라진다는 점을 확인하라."
    )


def test_success_response_merges_headers_and_cache_control() -> None:
    resp = response.success_response({}, headers={"X-T": "1"}, cache_control="max-age=60")
    assert resp["headers"]["X-T"] == "1"
    assert resp["headers"]["Cache-Control"] == "max-age=60"


def test_error_response_includes_cors_headers() -> None:
    """error_response 는 success_response 와 **별개로** CORS 를 조립한다.

    `{**CORS_HEADERS}` 가 core/response.py 의 53·90·188행 세 곳에 각각 있다.
    Task 13 이 성공 경로만 common/http 로 위임하고 에러 경로를 흘리면, 에러
    응답 전체가 CORS 를 잃는다 — 브라우저는 실제 오류 대신 CORS 실패를
    표시하므로 프런트가 원인을 볼 수 없게 된다.
    """
    resp = response.error_response("boom", 400)
    for key, value in CORS_HEADERS.items():
        assert resp["headers"][key] == value


def test_exception_to_response_includes_cors_headers() -> None:
    """@lambda_handler 가 BackendError 를 응답으로 바꾸는 경로도 같은 보장이 필요하다."""
    resp = response.exception_to_response(ValidationError("bad", field="t"))
    for key, value in CORS_HEADERS.items():
        assert resp["headers"][key] == value


def test_error_response_body_and_optional_fields() -> None:
    resp = response.error_response("boom", 400, code="X", details={"f": 1}, retry_possible=True)
    assert resp["statusCode"] == 400
    assert _body(resp) == {"error": "boom", "code": "X", "details": {"f": 1},
                           "retry_possible": True}


def test_error_response_defaults_to_500_and_bare_body() -> None:
    resp = response.error_response("boom")
    assert resp["statusCode"] == 500
    assert _body(resp) == {"error": "boom"}


def test_paginated_response_pagination_block() -> None:
    resp = response.paginated_response([1, 2], total=5, page=1, page_size=2)
    body = _body(resp)
    assert body["items"] == [1, 2]
    assert body["pagination"] == {"total": 5, "page": 1, "page_size": 2,
                                  "total_pages": 3, "has_next": True, "has_prev": False}


def test_paginated_response_handles_zero_page_size() -> None:
    body = _body(response.paginated_response([], total=0, page=1, page_size=0))
    assert body["pagination"]["total_pages"] == 0


def test_created_response_is_201() -> None:
    assert response.created_response({"id": "x"})["statusCode"] == 201


def test_no_content_response_is_204_with_empty_body() -> None:
    resp = response.no_content_response()
    assert resp["statusCode"] == 204
    assert resp["body"] == ""
    for key in CORS_HEADERS:
        assert key in resp["headers"]


def test_validation_error_response_shape() -> None:
    resp = response.validation_error_response("bad", field="title")
    assert resp["statusCode"] == 400
    body = _body(resp)
    assert body["code"] == "VALIDATION_ERROR"
    assert body["details"]["field"] == "title"


def test_not_found_response_message_and_details() -> None:
    resp = response.not_found_response("article", "abc")
    assert resp["statusCode"] == 404
    body = _body(resp)
    assert body["error"] == "article with id 'abc' not found"
    assert body["details"] == {"resource_type": "article", "resource_id": "abc"}


def test_internal_error_response_defaults() -> None:
    resp = response.internal_error_response()
    assert resp["statusCode"] == 500
    body = _body(resp)
    assert body["code"] == "INTERNAL_ERROR"
    assert body["retry_possible"] is True


@pytest.mark.parametrize("exc,status", [
    (ValidationError("bad", field="t"), 400),
    (AuthenticationError("no token"), 401),
    (AuthorizationError("forbidden"), 403),
    (NotFoundError("article", "abc"), 404),
    (RateLimitError("slow down"), 429),
    (RepositoryError("ddb down"), 500),
    (TranslationError("bedrock down"), 500),
    (ConfigurationError("missing env"), 500),
    (ExternalServiceError("upstream", "opensearch"), 502),
    # BackendError 는 EXCEPTION_STATUS_CODES 에서 **반드시 마지막**이어야 한다 —
    # dict 삽입 순서로 isinstance 를 판정하므로 앞에 오면 모든 하위 클래스가
    # 500 으로 뭉개진다. 기반 클래스 자체도 500 임을 함께 고정한다.
    (BackendError("generic"), 500),
])
def test_exception_to_response_maps_backend_errors(exc, status: int) -> None:
    """예외 계층을 common 으로 옮길 때 isinstance 판정이 깨질 수 있는 지점.

    9개 하위 클래스 + 기반 클래스 전부를 돈다. 이전에는 2종만 돌아서,
    `EXCEPTION_STATUS_CODES` 의 삽입 순서가 뒤바뀌거나 특정 예외가 매핑에서
    빠져도 스위트가 초록이었다.
    """
    resp = response.exception_to_response(exc)
    assert resp["statusCode"] == status
    assert _body(resp)["code"] == exc.code


def test_every_mapped_exception_is_covered_by_the_parametrization() -> None:
    """새 예외를 추가하고 위 목록에 넣지 않으면 여기서 걸린다.

    파라미터화는 사람이 손으로 유지하는 목록이라, 매핑이 늘어날 때 조용히
    커버리지가 빠지는 것을 막는다.
    """
    from common.errors import EXCEPTION_STATUS_CODES

    parametrized = {
        ValidationError, AuthenticationError, AuthorizationError, NotFoundError,
        RateLimitError, RepositoryError, TranslationError, ConfigurationError,
        ExternalServiceError, BackendError,
    }
    assert set(EXCEPTION_STATUS_CODES) == parametrized, (
        "EXCEPTION_STATUS_CODES 가 바뀌었다 — 위 parametrize 목록도 함께 갱신하라. "
        f"매핑에만 있음: {set(EXCEPTION_STATUS_CODES) - parametrized}, "
        f"목록에만 있음: {parametrized - set(EXCEPTION_STATUS_CODES)}"
    )


def test_exception_to_response_maps_unknown_exception_to_500() -> None:
    resp = response.exception_to_response(RuntimeError("nope"))
    assert resp["statusCode"] == 500
    body = _body(resp)
    assert body["error"] == "An unexpected error occurred"
    assert body["retry_possible"] is True


def test_serializer_handles_datetime_decimal_set() -> None:
    body = _body(response.success_response({
        "dt": datetime(2026, 7, 29, 5, 0, tzinfo=timezone.utc),
        "whole": Decimal("3"),
        "frac": Decimal("1.5"),
        "s": {"x"},
    }))
    assert body["dt"].startswith("2026-07-29T05:00:00")
    assert body["whole"] == 3
    assert body["frac"] == 1.5
    assert body["s"] == ["x"]
