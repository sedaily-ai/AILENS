"""백엔드 공통 예외 계층.

v1 core/exceptions.py 에서 옮겨왔다. core/exceptions.py 는 이 모듈의 이름을
재수출하는 얇은 층으로 남는다(기존 import 경로 유지).

⚠️ EXCEPTION_STATUS_CODES 의 삽입 순서가 동작을 결정한다.
get_status_code_for_exception 이 순서대로 isinstance 를 검사하고 첫 매치를
반환하므로, BackendError 는 반드시 맨 마지막에 있어야 한다. 앞으로 옮기면
모든 서브클래스가 500 으로 떨어진다.
"""

from typing import Optional, Dict, Any


class BackendError(Exception):
    """
    Base exception for all backend errors.
    All custom exceptions should inherit from this class.
    """

    def __init__(
        self,
        message: str,
        code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        retry_possible: bool = False
    ):
        super().__init__(message)
        self.message = message
        self.code = code or 'BACKEND_ERROR'
        self.details = details or {}
        self.retry_possible = retry_possible

    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for API response."""
        result = {
            'error': self.message,
            'code': self.code,
        }
        if self.details:
            result['details'] = self.details
        if self.retry_possible:
            result['retry_possible'] = True
        return result


class ValidationError(BackendError):
    """
    Raised when input validation fails.
    HTTP Status: 400 Bad Request
    """

    def __init__(
        self,
        message: str,
        field: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            message=message,
            code='VALIDATION_ERROR',
            details=details or {},
            retry_possible=False
        )
        self.field = field
        if field:
            self.details['field'] = field


class NotFoundError(BackendError):
    """
    Raised when a requested resource is not found.
    HTTP Status: 404 Not Found
    """

    def __init__(
        self,
        resource_type: str,
        resource_id: Optional[str] = None,
        message: Optional[str] = None
    ):
        default_message = f"{resource_type} not found"
        if resource_id:
            default_message = f"{resource_type} with id '{resource_id}' not found"

        super().__init__(
            message=message or default_message,
            code='NOT_FOUND',
            details={'resource_type': resource_type},
            retry_possible=False
        )
        self.resource_type = resource_type
        self.resource_id = resource_id
        if resource_id:
            self.details['resource_id'] = resource_id


class RepositoryError(BackendError):
    """
    Raised when a database operation fails.
    HTTP Status: 500 Internal Server Error
    """

    def __init__(
        self,
        message: str,
        operation: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        retry_possible: bool = True
    ):
        super().__init__(
            message=message,
            code='REPOSITORY_ERROR',
            details=details or {},
            retry_possible=retry_possible
        )
        self.operation = operation
        if operation:
            self.details['operation'] = operation


class TranslationError(BackendError):
    """
    Raised when translation fails.
    HTTP Status: 500 Internal Server Error
    """

    def __init__(
        self,
        message: str,
        source_text: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        retry_possible: bool = True
    ):
        super().__init__(
            message=message,
            code='TRANSLATION_ERROR',
            details=details or {},
            retry_possible=retry_possible
        )
        # Don't include full source text in details (could be large)
        if source_text:
            self.details['source_text_length'] = len(source_text)


class ExternalServiceError(BackendError):
    """
    Raised when an external API call fails.
    HTTP Status: 502 Bad Gateway or 503 Service Unavailable
    """

    def __init__(
        self,
        service_name: str,
        message: str,
        status_code: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
        retry_possible: bool = True
    ):
        super().__init__(
            message=f"{service_name}: {message}",
            code='EXTERNAL_SERVICE_ERROR',
            details=details or {},
            retry_possible=retry_possible
        )
        self.service_name = service_name
        self.status_code = status_code
        self.details['service'] = service_name
        if status_code:
            self.details['status_code'] = status_code


class AuthenticationError(BackendError):
    """
    Raised when authentication fails.
    HTTP Status: 401 Unauthorized
    """

    def __init__(
        self,
        message: str = "Authentication required",
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            message=message,
            code='AUTHENTICATION_ERROR',
            details=details or {},
            retry_possible=False
        )


class AuthorizationError(BackendError):
    """
    Raised when authorization fails.
    HTTP Status: 403 Forbidden
    """

    def __init__(
        self,
        message: str = "Permission denied",
        required_permission: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            message=message,
            code='AUTHORIZATION_ERROR',
            details=details or {},
            retry_possible=False
        )
        if required_permission:
            self.details['required_permission'] = required_permission


class RateLimitError(BackendError):
    """
    Raised when rate limit is exceeded.
    HTTP Status: 429 Too Many Requests
    """

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        retry_after: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            message=message,
            code='RATE_LIMIT_ERROR',
            details=details or {},
            retry_possible=True
        )
        self.retry_after = retry_after
        if retry_after:
            self.details['retry_after'] = retry_after


class ConfigurationError(BackendError):
    """
    Raised when configuration is invalid or missing.
    HTTP Status: 500 Internal Server Error
    """

    def __init__(
        self,
        message: str,
        config_key: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            message=message,
            code='CONFIGURATION_ERROR',
            details=details or {},
            retry_possible=False
        )
        if config_key:
            self.details['config_key'] = config_key


# HTTP Status Code mapping for exceptions
EXCEPTION_STATUS_CODES = {
    ValidationError: 400,
    AuthenticationError: 401,
    AuthorizationError: 403,
    NotFoundError: 404,
    RateLimitError: 429,
    RepositoryError: 500,
    TranslationError: 500,
    ConfigurationError: 500,
    ExternalServiceError: 502,
    BackendError: 500,
}


def get_status_code_for_exception(exc: BackendError) -> int:
    """Get the appropriate HTTP status code for an exception."""
    for exc_class, status_code in EXCEPTION_STATUS_CODES.items():
        if isinstance(exc, exc_class):
            return status_code
    return 500
