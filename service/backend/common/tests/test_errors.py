"""common/errors.py — 예외 계층과 status code 매핑.

Run from service/backend/::

    python3 -m pytest common/tests/test_errors.py -v
"""
from __future__ import annotations

import pytest

from common import errors


def test_backend_error_defaults() -> None:
    e = errors.BackendError("boom")
    assert e.message == "boom"
    assert e.code == "BACKEND_ERROR"
    assert e.details == {}
    assert e.retry_possible is False


def test_backend_error_to_dict_shape() -> None:
    e = errors.BackendError("boom", code="X", details={"f": 1}, retry_possible=True)
    assert e.to_dict() == {"error": "boom", "code": "X", "details": {"f": 1},
                           "retry_possible": True}


def test_validation_error_puts_field_into_details() -> None:
    e = errors.ValidationError("bad", field="title")
    assert e.code == "VALIDATION_ERROR"
    assert e.details["field"] == "title"


def test_not_found_error_builds_message_from_id() -> None:
    e = errors.NotFoundError("article", "abc")
    assert e.message == "article with id 'abc' not found"
    assert e.details == {"resource_type": "article", "resource_id": "abc"}


def test_external_service_error_prefixes_service_name() -> None:
    e = errors.ExternalServiceError("bedrock", "timeout", status_code=504)
    assert e.message == "bedrock: timeout"
    assert e.details["service"] == "bedrock"
    assert e.details["status_code"] == 504


@pytest.mark.parametrize("exc,expected", [
    (errors.ValidationError("x"), 400),
    (errors.AuthenticationError(), 401),
    (errors.AuthorizationError(), 403),
    (errors.NotFoundError("r"), 404),
    (errors.RateLimitError(), 429),
    (errors.RepositoryError("x"), 500),
    (errors.TranslationError("x"), 500),
    (errors.ConfigurationError("x"), 500),
    (errors.ExternalServiceError("s", "x"), 502),
    (errors.BackendError("x"), 500),
])
def test_status_code_mapping(exc, expected: int) -> None:
    assert errors.get_status_code_for_exception(exc) == expected


def test_backend_error_is_last_in_mapping_order() -> None:
    """순서가 의미를 갖는다.

    get_status_code_for_exception 은 삽입 순서대로 isinstance 를 검사하고 첫
    매치를 반환한다. BackendError 가 앞으로 오면 모든 서브클래스가 500 이 된다.
    """
    assert list(errors.EXCEPTION_STATUS_CODES)[-1] is errors.BackendError
