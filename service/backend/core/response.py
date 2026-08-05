"""
Unified response formatting for Lambda handlers.
Eliminates duplicate response formatting code across handlers.
"""

from typing import Any, Dict, Optional, List

from common import http
from config.constants import CORS_HEADERS


def _with_cors(headers: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """v1 응답에는 CORS 를 붙인다 — admin 과의 유일한 차이."""
    merged = {**CORS_HEADERS}
    if headers:
        merged.update(headers)
    return merged


def success_response(
    data: Any,
    status_code: int = 200,
    headers: Optional[Dict[str, str]] = None,
    cache_control: Optional[str] = None
) -> Dict:
    """
    Create a standard success response for Lambda handlers.

    Args:
        data: Response data (will be JSON serialized)
        status_code: HTTP status code (default: 200)
        headers: Additional headers to include
        cache_control: Cache-Control header value

    Returns:
        Lambda response dictionary
    """
    response_headers = _with_cors(headers)

    if cache_control:
        response_headers['Cache-Control'] = cache_control

    return http.success(data, status_code, response_headers)


def error_response(
    message: str,
    status_code: int = 500,
    code: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    retry_possible: bool = False,
    headers: Optional[Dict[str, str]] = None
) -> Dict:
    """
    Create a standard error response for Lambda handlers.

    Args:
        message: Human-readable error message
        status_code: HTTP status code (default: 500)
        code: Machine-readable error code
        details: Additional error details
        retry_possible: Whether the request can be retried
        headers: Additional headers to include

    Returns:
        Lambda response dictionary
    """
    return http.error(
        message, status_code, code=code, details=details,
        retry_possible=retry_possible, headers=_with_cors(headers),
    )


def paginated_response(
    items: List[Any],
    total: int,
    page: int,
    page_size: int,
    additional_data: Optional[Dict[str, Any]] = None,
    status_code: int = 200,
    headers: Optional[Dict[str, str]] = None
) -> Dict:
    """
    Create a standard paginated response for Lambda handlers.

    Args:
        items: List of items for current page
        total: Total number of items
        page: Current page number (1-based)
        page_size: Number of items per page
        additional_data: Additional data to include in response
        status_code: HTTP status code (default: 200)
        headers: Additional headers to include

    Returns:
        Lambda response dictionary
    """
    total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0

    data = {
        'items': items,
        'pagination': {
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
            'has_next': page < total_pages,
            'has_prev': page > 1
        }
    }

    if additional_data:
        data.update(additional_data)

    return success_response(data, status_code=status_code, headers=headers)


def created_response(
    data: Any,
    headers: Optional[Dict[str, str]] = None
) -> Dict:
    """
    Create a 201 Created response.

    Args:
        data: Created resource data
        headers: Additional headers to include

    Returns:
        Lambda response dictionary
    """
    return success_response(data, status_code=201, headers=headers)


def no_content_response(
    headers: Optional[Dict[str, str]] = None
) -> Dict:
    """
    Create a 204 No Content response.

    Args:
        headers: Additional headers to include

    Returns:
        Lambda response dictionary
    """
    # Deliberately not http.success(None, 204, ...): json_dumps(None) serializes to the
    # string "null", which would put a non-empty body on a 204 response. That violates
    # HTTP semantics (204 MUST NOT have a body) and some proxies/clients mishandle it.
    return {'statusCode': 204, 'headers': _with_cors(headers), 'body': ''}


def validation_error_response(
    message: str,
    field: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
) -> Dict:
    """
    Create a 400 Bad Request response for validation errors.

    Args:
        message: Error message
        field: Field that failed validation
        details: Additional error details

    Returns:
        Lambda response dictionary
    """
    error_details = details or {}
    if field:
        error_details['field'] = field

    return error_response(
        message=message,
        status_code=400,
        code='VALIDATION_ERROR',
        details=error_details if error_details else None
    )


def not_found_response(
    resource_type: str,
    resource_id: Optional[str] = None
) -> Dict:
    """
    Create a 404 Not Found response.

    Args:
        resource_type: Type of resource not found
        resource_id: ID of resource not found

    Returns:
        Lambda response dictionary
    """
    if resource_id:
        message = f"{resource_type} with id '{resource_id}' not found"
    else:
        message = f"{resource_type} not found"

    return error_response(
        message=message,
        status_code=404,
        code='NOT_FOUND',
        details={'resource_type': resource_type, 'resource_id': resource_id}
    )


def internal_error_response(
    message: str = "Internal server error",
    code: Optional[str] = None,
    retry_possible: bool = True
) -> Dict:
    """
    Create a 500 Internal Server Error response.

    Args:
        message: Error message
        code: Error code
        retry_possible: Whether the request can be retried

    Returns:
        Lambda response dictionary
    """
    return error_response(
        message=message,
        status_code=500,
        code=code or 'INTERNAL_ERROR',
        retry_possible=retry_possible
    )


def exception_to_response(exc: Exception) -> Dict:
    """
    Convert an exception to an appropriate Lambda response.

    Args:
        exc: Exception to convert

    Returns:
        Lambda response dictionary
    """
    from core.exceptions import (
        BackendError,
        get_status_code_for_exception
    )

    if isinstance(exc, BackendError):
        return error_response(
            message=exc.message,
            status_code=get_status_code_for_exception(exc),
            code=exc.code,
            details=exc.details if exc.details else None,
            retry_possible=exc.retry_possible
        )

    # For unknown exceptions, return generic 500 error
    return internal_error_response(
        message="An unexpected error occurred",
        retry_possible=True
    )
