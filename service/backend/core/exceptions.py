"""백엔드 예외 계층 — common/errors.py 재수출.

정의는 common/errors.py 에 있다. v1/v2 가 쓰던 `from core.exceptions import ...`
경로를 유지하기 위한 얇은 층이다.

EXCEPTION_STATUS_CODES 의 삽입 순서가 동작을 결정한다(common/errors.py 참조).
"""

from common.errors import (
    BackendError,
    ValidationError,
    NotFoundError,
    RepositoryError,
    TranslationError,
    ExternalServiceError,
    AuthenticationError,
    AuthorizationError,
    RateLimitError,
    ConfigurationError,
    EXCEPTION_STATUS_CODES,
    get_status_code_for_exception,
)

__all__ = [
    "BackendError",
    "ValidationError",
    "NotFoundError",
    "RepositoryError",
    "TranslationError",
    "ExternalServiceError",
    "AuthenticationError",
    "AuthorizationError",
    "RateLimitError",
    "ConfigurationError",
    "EXCEPTION_STATUS_CODES",
    "get_status_code_for_exception",
]
