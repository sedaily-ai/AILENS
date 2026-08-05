"""Unit tests for v2 health handler.

Runs from `backend/`: `python3 -m pytest v2/tests/test_health.py -v`.
"""
import json


def test_health_get_returns_ok():
    from v2.handlers.health import lambda_handler

    event = {
        'httpMethod': 'GET',
        'path': '/api/v2/health',
    }
    result = lambda_handler(event, None)

    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body == {'status': 'ok', 'version': 'v2'}


def test_health_options_returns_cors_preflight():
    from v2.handlers.health import lambda_handler

    event = {
        'httpMethod': 'OPTIONS',
        'path': '/api/v2/health',
    }
    result = lambda_handler(event, None)

    assert result['statusCode'] == 200
    assert result['body'] == ''
    assert 'Access-Control-Allow-Origin' in result['headers']


def test_health_accepts_http_api_v2_event_format():
    """HTTP API (v2) puts method under requestContext.http.method instead of httpMethod."""
    from v2.handlers.health import lambda_handler

    event = {
        'requestContext': {'http': {'method': 'GET'}},
        'rawPath': '/api/v2/health',
    }
    result = lambda_handler(event, None)

    assert result['statusCode'] == 200
    body = json.loads(result['body'])
    assert body == {'status': 'ok', 'version': 'v2'}
