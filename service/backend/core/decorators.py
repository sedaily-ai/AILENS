"""
Decorators for Lambda handlers.
Provides unified error handling, logging, and response formatting.
"""

import functools
import logging
import asyncio
from typing import Callable, Any, Optional, Dict

from core.response import (
    error_response,
    exception_to_response,
)
from core.exceptions import (
    BackendError,
    ValidationError,
    NotFoundError,
    get_status_code_for_exception,
)

logger = logging.getLogger(__name__)


def lambda_handler(func: Callable) -> Callable:
    """
    Decorator for Lambda handlers that provides:
    - Unified error handling
    - Request/response logging
    - Async support

    Usage:
        @lambda_handler
        def my_handler(event, context):
            return success_response({'data': 'value'})

        @lambda_handler
        async def my_async_handler(event, context):
            result = await some_async_operation()
            return success_response(result)
    """
    @functools.wraps(func)
    def wrapper(event: Dict, context: Any) -> Dict:
        handler_name = func.__name__

        # Log request (exclude body for large payloads)
        logger.info(f"Handler {handler_name} invoked")
        logger.debug(f"Event: {_safe_log_event(event)}")

        try:
            # Handle async functions. Lambda containers always start fresh,
            # so there's never an existing event loop on the first invocation.
            # asyncio.run() creates a new loop and tears it down cleanly.
            if asyncio.iscoroutinefunction(func):
                result = asyncio.run(func(event, context))
            else:
                result = func(event, context)

            # Log response status
            status_code = result.get('statusCode', 200) if isinstance(result, dict) else 200
            logger.info(f"Handler {handler_name} completed with status {status_code}")

            return result

        except ValidationError as e:
            logger.warning(f"Validation error in {handler_name}: {e.message}")
            return error_response(
                message=e.message,
                status_code=400,
                code=e.code,
                details=e.details if e.details else None
            )

        except NotFoundError as e:
            logger.info(f"Resource not found in {handler_name}: {e.message}")
            return error_response(
                message=e.message,
                status_code=404,
                code=e.code,
                details=e.details if e.details else None
            )

        except BackendError as e:
            status_code = get_status_code_for_exception(e)
            logger.error(f"Backend error in {handler_name}: {e.message}", exc_info=True)
            return exception_to_response(e)

        except Exception as e:
            logger.error(f"Unexpected error in {handler_name}: {e}", exc_info=True)
            return error_response(
                message="Internal server error",
                status_code=500,
                code='INTERNAL_ERROR',
                retry_possible=True
            )

    return wrapper


def with_logging(log_level: int = logging.INFO) -> Callable:
    """
    Decorator factory for adding custom logging level to handlers.

    Usage:
        @with_logging(logging.DEBUG)
        @lambda_handler
        def my_handler(event, context):
            ...
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Set log level for this handler
            original_level = logger.level
            logger.setLevel(log_level)
            try:
                return func(*args, **kwargs)
            finally:
                logger.setLevel(original_level)
        return wrapper
    return decorator


def require_params(*required_params: str) -> Callable:
    """
    Decorator factory that validates required query parameters.

    Usage:
        @require_params('category', 'page')
        @lambda_handler
        def my_handler(event, context):
            params = event['queryStringParameters']
            # params['category'] and params['page'] are guaranteed to exist
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(event: Dict, context: Any) -> Dict:
            params = event.get('queryStringParameters') or {}

            missing = [p for p in required_params if not params.get(p)]

            if missing:
                raise ValidationError(
                    message=f"Missing required parameters: {', '.join(missing)}",
                    details={'missing_params': missing}
                )

            return func(event, context)
        return wrapper
    return decorator


def require_body_fields(*required_fields: str) -> Callable:
    """
    Decorator factory that validates required fields in request body.

    Usage:
        @require_body_fields('title', 'content')
        @lambda_handler
        def my_handler(event, context):
            import json
            body = json.loads(event['body'])
            # body['title'] and body['content'] are guaranteed to exist
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(event: Dict, context: Any) -> Dict:
            import json

            body_str = event.get('body')
            if not body_str:
                raise ValidationError(
                    message="Request body is required",
                    field='body'
                )

            try:
                body = json.loads(body_str)
            except json.JSONDecodeError as e:
                raise ValidationError(
                    message=f"Invalid JSON in request body: {e}",
                    field='body'
                )

            missing = [f for f in required_fields if f not in body]

            if missing:
                raise ValidationError(
                    message=f"Missing required fields in body: {', '.join(missing)}",
                    details={'missing_fields': missing}
                )

            return func(event, context)
        return wrapper
    return decorator


def require_path_param(param_name: str) -> Callable:
    """
    Decorator factory that validates a required path parameter.

    Usage:
        @require_path_param('id')
        @lambda_handler
        def my_handler(event, context):
            article_id = event['pathParameters']['id']
            # article_id is guaranteed to exist
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(event: Dict, context: Any) -> Dict:
            path_params = event.get('pathParameters') or {}

            if not path_params.get(param_name):
                raise ValidationError(
                    message=f"Missing required path parameter: {param_name}",
                    field=param_name
                )

            return func(event, context)
        return wrapper
    return decorator


def _safe_log_event(event: Dict) -> Dict:
    """
    Create a safe-to-log version of event (exclude sensitive/large data).
    """
    safe_event = {}

    # Copy safe fields
    safe_fields = [
        'httpMethod',
        'path',
        'pathParameters',
        'queryStringParameters',
        'requestContext',
    ]

    for field in safe_fields:
        if field in event:
            safe_event[field] = event[field]

    # Indicate if body exists but don't log it
    if event.get('body'):
        body_len = len(event['body']) if isinstance(event['body'], str) else 0
        safe_event['body'] = f'<{body_len} bytes>'

    return safe_event
