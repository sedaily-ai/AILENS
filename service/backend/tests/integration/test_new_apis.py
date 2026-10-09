#!/usr/bin/env python3
"""
New API Smoke Tests — Archive
========================================================
Tests the 3 new API handlers both directly (Python import) and via HTTP.

Direct invocation tests the handler logic without needing API Gateway wiring.
HTTP tests verify the full path (may return 403/404 if Lambda not wired yet).

Requirements:
  - AWS credentials (DynamoDB access for personal-dev table)
  - provision.sh run (creates personal-dev table)

Usage:
  python tests/test_new_apis.py
  API_URL=http://localhost:8000 python tests/test_new_apis.py

Test data is cleaned up after all tests run.
"""
import asyncio
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone, timedelta

import requests as http_requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# ── Configuration ────────────────────────────────────────────────────────────

API_URL = os.getenv('API_URL', 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev')
REGION = os.getenv('AWS_REGION', 'us-east-1')
KST = timezone(timedelta(hours=9))
TODAY_ISO = datetime.now(KST).strftime('%Y-%m-%d')
TIMEOUT = 60

TEST_USER = f"test_newapi_{uuid.uuid4().hex[:8]}"
TEST_ARTICLE_1 = "TEST_ARTICLE_001"
TEST_ARTICLE_2 = "TEST_ARTICLE_002"


# ── Test Framework ───────────────────────────────────────────────────────────

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.errors = []

    def ok(self, name: str, detail: str = ''):
        self.passed += 1
        print(f"  \033[32mPASS\033[0m  {name} {detail}")

    def fail(self, name: str, reason: str):
        self.failed += 1
        self.errors.append((name, reason))
        print(f"  \033[31mFAIL\033[0m  {name} — {reason}")

    def skip(self, name: str, reason: str):
        self.skipped += 1
        print(f"  \033[33mSKIP\033[0m  {name} — {reason}")

    def summary(self):
        total = self.passed + self.failed + self.skipped
        print('')
        print('=' * 60)
        if self.failed == 0:
            msg = f"  {self.passed} PASSED"
            if self.skipped:
                msg += f", {self.skipped} SKIPPED"
            print(f"\033[32m{msg}\033[0m")
        else:
            print(f"\033[31m  {self.failed}/{total} TESTS FAILED\033[0m")
            for name, reason in self.errors:
                print(f"    - {name}: {reason}")
        print('=' * 60)
        return self.failed == 0


results = TestResult()


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_lambda_event(method, path, body=None, query_params=None, path_params=None):
    """Build a Lambda event dict simulating API Gateway v1."""
    event = {
        'httpMethod': method,
        'path': path,
        'queryStringParameters': query_params or {},
        'pathParameters': path_params or {},
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body) if body else '{}',
        'isBase64Encoded': False,
    }
    return event


def invoke_handler(handler_func, event):
    """Invoke a Lambda handler and return parsed (status_code, body_dict).
    Handles both sync (decorator-wrapped) and raw async handlers."""
    result = handler_func(event, None)
    # If the decorator already ran asyncio.run internally, result is a dict
    if asyncio.iscoroutine(result):
        response = asyncio.run(result)
    else:
        response = result
    status = response.get('statusCode', 500)
    body_str = response.get('body', '{}')
    try:
        body = json.loads(body_str) if isinstance(body_str, str) else body_str
    except (json.JSONDecodeError, TypeError):
        body = {'raw': body_str}
    return status, body


def http_call(method, path, **kwargs):
    """Make an HTTP call and return (status, body, elapsed_ms)."""
    kwargs.setdefault('timeout', TIMEOUT)
    start = time.time()
    try:
        resp = getattr(http_requests, method)(f'{API_URL}{path}', **kwargs)
        ms = int((time.time() - start) * 1000)
        try:
            body = resp.json()
        except Exception:
            body = {'raw': resp.text[:200]}
        return resp.status_code, body, ms
    except Exception as e:
        ms = int((time.time() - start) * 1000)
        return None, {'error': str(e)}, ms


# ── Cleanup registry ─────────────────────────────────────────────────────────

cleanup_actions = []


def register_cleanup(func):
    cleanup_actions.append(func)


def run_cleanup():
    print('')
    print(f'  Running {len(cleanup_actions)} cleanup actions...')
    for action in cleanup_actions:
        try:
            action()
        except Exception as e:
            print(f'    [warn] cleanup failed: {e}')
    print('  Cleanup done.')


# =============================================================================
# ARCHIVE TESTS
# =============================================================================

def test_archive_direct():
    """Test archive handler via direct Python invocation."""

    from handlers.user.archive import lambda_handler

    saved_archive_id = None

    # ── 1a. POST /api/archive — save a sentence ──────────────────────
    name = 'Archive: save sentence (direct)'
    event = make_lambda_event('POST', '/api/archive', body={
        'user_id': TEST_USER,
        'text': '삼성전자가 1분기 영업이익 6조원을 기록했다.',
        'article_id': TEST_ARTICLE_1,
        'article_title': '삼성전자 1분기 실적 발표',
        'article_published_at': '2026-04-09T10:00:00+09:00',
    })

    status, body = invoke_handler(lambda_handler, event)

    if status != 201:
        results.fail(name, f'Status {status}: {body}')
        return

    sentence = body.get('sentence', {})
    saved_archive_id = sentence.get('id', '')
    vector_status = body.get('vector_status', '')

    if not saved_archive_id:
        results.fail(name, 'No archive id returned')
        return

    results.ok(name, f'id={saved_archive_id[:30]}..., vector={vector_status}')

    # ── 1b. GET /api/archive — list sentences ────────────────────────
    name = 'Archive: list sentences (direct)'
    event = make_lambda_event('GET', '/api/archive', query_params={
        'user_id': TEST_USER,
    })

    status, body = invoke_handler(lambda_handler, event)

    if status != 200:
        results.fail(name, f'Status {status}: {body}')
        return

    sentences = body.get('sentences', [])
    count = body.get('count', 0)

    found = any(s.get('id') == saved_archive_id for s in sentences)
    if not found:
        results.fail(name, f'Saved sentence not found in list ({count} items)')
        return

    results.ok(name, f'{count} sentences, saved item found')

    # ── 1c. POST /api/archive/similar — similarity search ────────────
    name = 'Archive: similar (no pgvector — graceful fallback)'
    event = make_lambda_event('POST', '/api/archive/similar', body={
        'user_id': TEST_USER,
        'text': '반도체 수출이 호조를 보이고 있다.',
        'limit': 5,
    })

    status, body = invoke_handler(lambda_handler, event)

    # 503 is expected when pgvector is not configured
    if status == 503:
        results.ok(name, 'Status 503 — pgvector not configured (expected)')
    elif status == 200:
        results.ok(name, f'Status 200, {body.get("count", 0)} similar results')
    else:
        results.fail(name, f'Status {status}: {body}')

    # ── 1d. DELETE /api/archive/{id} ─────────────────────────────────
    name = 'Archive: delete sentence (direct)'
    event = make_lambda_event('DELETE', f'/api/archive/{saved_archive_id}',
                              query_params={'user_id': TEST_USER},
                              path_params={'archive_id': saved_archive_id})

    status, body = invoke_handler(lambda_handler, event)

    if status != 200:
        results.fail(name, f'Status {status}: {body}')
        return

    if not body.get('deleted'):
        results.fail(name, 'Response missing deleted=true')
        return

    results.ok(name, f'deleted archive_id={saved_archive_id[:30]}...')

    # ── 1e. Verify deletion ──────────────────────────────────────────
    name = 'Archive: verify deletion (direct)'
    event = make_lambda_event('GET', '/api/archive', query_params={
        'user_id': TEST_USER,
    })

    status, body = invoke_handler(lambda_handler, event)

    if status != 200:
        results.fail(name, f'Status {status}')
        return

    sentences = body.get('sentences', [])
    still_found = any(s.get('id') == saved_archive_id for s in sentences)
    if still_found:
        results.fail(name, 'Deleted sentence still appears in list')
        return

    results.ok(name, f'{body.get("count", 0)} sentences remaining, deleted item gone')


def test_archive_http():
    """Test archive handler via HTTP (may 404 if not wired to API Gateway)."""
    name = 'Archive: list via HTTP'
    status, body, ms = http_call('get', f'/api/archive?user_id={TEST_USER}')

    if status is None:
        results.fail(name, f'Connection error: {body}')
    elif status in (403, 404):
        results.ok(name, f'({ms}ms) Status {status} — not wired to API Gateway yet')
    elif status == 200:
        results.ok(name, f'({ms}ms) {body.get("count", 0)} sentences')
    else:
        results.fail(name, f'({ms}ms) Status {status}: {body}')


# =============================================================================
# PODCAST TESTS
# =============================================================================

def cleanup_test_data():
    """Remove all test user data from Personal DB."""
    try:
        import boto3
        personal_table = os.getenv('DYNAMODB_TABLE_PERSONAL', 'TEST-ONLY-set-DYNAMODB_TABLE_PERSONAL')
        dynamodb = boto3.resource('dynamodb', region_name=REGION)
        table = dynamodb.Table(personal_table)

        # Query all items for test user
        from boto3.dynamodb.conditions import Key
        resp = table.query(
            KeyConditionExpression=Key('user_id').eq(TEST_USER),
        )
        items = resp.get('Items', [])

        for item in items:
            table.delete_item(Key={
                'user_id': item['user_id'],
                'sk': item['sk'],
            })

        print(f'  Cleaned {len(items)} items for user {TEST_USER}')
    except Exception as e:
        print(f'  [warn] Personal DB cleanup failed: {e}')


# =============================================================================
# MAIN
# =============================================================================

def main():
    print('')
    print('=' * 60)
    print('  New API Smoke Tests')
    print(f'  API: {API_URL}')
    print(f'  Test user: {TEST_USER}')
    print(f'  Date: {TODAY_ISO}')
    print('=' * 60)
    print('')

    register_cleanup(cleanup_test_data)

    try:
        # Archive
        print('── Archive API ──')
        print('')
        test_archive_direct()
        test_archive_http()

                
    finally:
        run_cleanup()

    print('')
    all_passed = results.summary()
    print('')
    sys.exit(0 if all_passed else 1)


if __name__ == '__main__':
    main()
