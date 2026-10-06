"""
Decorators for Lambda handlers.
Provides unified error handling, logging, and response formatting.
"""

import functools
import logging
import asyncio
from typing import Callable, Any, Dict

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
