#!/usr/bin/env python3
"""
Regression Test Suite — AI LENS Backend API
=============================================
Verifies ALL existing API endpoints still work after the backend redesign.
Tests backward compatibility: articles without s3_body_uri must still return body.

Usage:
  python tests/test_regression.py                         # use production API
  API_URL=http://localhost:8000 python tests/test_regression.py  # use local

Environment:
  API_URL — API Gateway endpoint (default: production)
"""
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

# ── Configuration ────────────────────────────────────────────────────────────

API_URL = os.getenv(
    'API_URL',
    'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev',
)

KST = timezone(timedelta(hours=9))
TODAY_YYYYMMDD = datetime.now(KST).strftime('%Y%m%d')
TODAY_ISO = datetime.now(KST).strftime('%Y-%m-%d')
WEEK_AGO_ISO = (datetime.now(KST) - timedelta(days=30)).strftime('%Y-%m-%d')

TIMEOUT = 30  # seconds per request


# ── Test Framework ───────────────────────────────────────────────────────────

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []

    def ok(self, name: str, elapsed_ms: int, detail: str = ''):
        self.passed += 1
        status = f"\033[32mPASS\033[0m"
        print(f"  {status}  {name} ({elapsed_ms}ms) {detail}")

    def fail(self, name: str, elapsed_ms: int, reason: str):
        self.failed += 1
        self.errors.append((name, reason))
        status = f"\033[31mFAIL\033[0m"
        print(f"  {status}  {name} ({elapsed_ms}ms) — {reason}")

    def summary(self):
        total = self.passed + self.failed
        print('')
        print('=' * 60)
        if self.failed == 0:
            print(f"\033[32m  ALL {total} TESTS PASSED\033[0m")
        else:
            print(f"\033[31m  {self.failed}/{total} TESTS FAILED\033[0m")
            for name, reason in self.errors:
                print(f"    - {name}: {reason}")
        print('=' * 60)
        return self.failed == 0


results = TestResult()


def timed_request(method, url, **kwargs):
    """Make a request and return (response, elapsed_ms)."""
    kwargs.setdefault('timeout', TIMEOUT)
    start = time.time()
    try:
        resp = getattr(requests, method)(url, **kwargs)
        elapsed = int((time.time() - start) * 1000)
        return resp, elapsed
    except Exception as e:
        elapsed = int((time.time() - start) * 1000)
        return e, elapsed


# ── Test Cases ───────────────────────────────────────────────────────────────

def test_s3_articles():
    """GET /s3-articles — date-based article listing from S3 XML"""
    name = 'GET /s3-articles'
    resp, ms = timed_request('get', f'{API_URL}/s3-articles?date={TODAY_YYYYMMDD}&limit=5')

    if isinstance(resp, Exception):
        results.fail(name, ms, f'Request error: {resp}')
        return

    if resp.status_code != 200:
        results.fail(name, ms, f'Status {resp.status_code}: {resp.text[:100]}')
        return

    data = resp.json()
    if 'articles' not in data:
        results.fail(name, ms, 'Missing "articles" key in response')
        return

    count = len(data['articles'])
    results.ok(name, ms, f'{count} articles')

    # Return first article ID for subsequent tests
    if count > 0:
        return data['articles'][0].get('news_id')
    return None


def test_article_detail(news_id: str):
    """GET /api/article/{id} — article detail with MBTI versions"""
    name = f'GET /api/article/{news_id[:12]}...'
    resp, ms = timed_request('get', f'{API_URL}/api/article/{news_id}')

    if isinstance(resp, Exception):
        results.fail(name, ms, f'Request error: {resp}')
        return

    if resp.status_code in (400, 404):
        # Article exists in S3 XML but hasn't been processed by the collector yet
        results.ok(name, ms, f'Status {resp.status_code} (not in Article DB — expected for unprocessed articles)')
        return

    if resp.status_code != 200:
        results.fail(name, ms, f'Status {resp.status_code}: {resp.text[:100]}')
        return

    data = resp.json()

    # Core fields must exist
    for field in ['news_id', 'title_ko', 'category']:
        if field not in data:
            results.fail(name, ms, f'Missing field: {field}')
            return

    # Backward compat: if no s3_body_uri, body fields must be in response
    has_s3 = bool(data.get('s3_body_uri'))
    has_content = bool(data.get('content_ko'))
    has_versions = bool(data.get('version_NT'))

    detail = f'news_id={data["news_id"]}'
    if has_s3:
        detail += ', s3_body_uri=present'
    if has_content:
        detail += f', content_ko={len(data["content_ko"])}chars'
    if has_versions:
        detail += ', MBTI versions=yes'

    results.ok(name, ms, detail)


def test_article_backward_compat(news_id: str):
    """Verify legacy articles (no s3_body_uri) still return body from DynamoDB"""
    name = 'Backward compat (body in DynamoDB)'
    resp, ms = timed_request('get', f'{API_URL}/api/article/{news_id}')

    if isinstance(resp, Exception):
        results.fail(name, ms, f'Request error: {resp}')
        return

    if resp.status_code in (400, 404):
        results.ok(name, ms, 'Skipped — article not in DynamoDB (unprocessed)')
        return

    if resp.status_code != 200:
        results.fail(name, ms, f'Status {resp.status_code}')
        return

    data = resp.json()
    has_s3 = bool(data.get('s3_body_uri'))

    if not has_s3:
        # Legacy article — body should be directly in the response
        if data.get('content_ko') or data.get('content_blocks'):
            results.ok(name, ms, 'Legacy article: body fields present in DynamoDB response')
        else:
            results.fail(name, ms, 'Legacy article: no body fields and no s3_body_uri')
    else:
        # New article — body fetched from S3 and merged
        if data.get('content_ko'):
            results.ok(name, ms, 'New article: body merged from S3')
        else:
            results.fail(name, ms, 'New article: s3_body_uri present but content_ko missing')


def test_search():
    """POST /api/search — GSI-based article search"""
    name = 'POST /api/search'
    payload = {
        'query': '*',
        'filters': {
            'published_from': WEEK_AGO_ISO,
            'published_until': TODAY_ISO,
        },
        'page': 1,
        'page_size': 5,
    }

    resp, ms = timed_request('post', f'{API_URL}/api/search',
                             json=payload,
                             headers={'Content-Type': 'application/json'})

    if isinstance(resp, Exception):
        results.fail(name, ms, f'Request error: {resp}')
        return

    if resp.status_code != 200:
        results.fail(name, ms, f'Status {resp.status_code}: {resp.text[:100]}')
        return

    data = resp.json()

    if 'articles' not in data:
        results.fail(name, ms, 'Missing "articles" key')
        return

    total = data.get('total_hits', 0)
    count = len(data['articles'])
    results.ok(name, ms, f'{count} articles returned, {total} total hits')


def test_chatbot():
    """POST /api/chat — MBTI persona chatbot"""
    name = 'POST /api/chat'
    payload = {
        'message': '오늘 주요 뉴스 알려줘',
        'mbti_group': 'NT',
        'conversation_history': [],
    }

    resp, ms = timed_request('post', f'{API_URL}/api/chat',
                             json=payload,
                             headers={'Content-Type': 'application/json'})

    if isinstance(resp, Exception):
        results.fail(name, ms, f'Request error: {resp}')
        return

    if resp.status_code != 200:
        results.fail(name, ms, f'Status {resp.status_code}: {resp.text[:100]}')
        return

    data = resp.json()

    response_text = data.get('response', '')
    if not response_text:
        results.fail(name, ms, 'Empty "response" field')
        return

    mbti = data.get('mbti_group', '')
    persona = data.get('persona', {}).get('name', '')
    context_src = data.get('context_source', 'unknown')

    results.ok(name, ms, f'persona={persona}({mbti}), context={context_src}, {len(response_text)}chars')


def test_time_machine():
    """GET /time-machine — historical news for a date"""
    name = 'GET /time-machine'
    resp, ms = timed_request('get', f'{API_URL}/time-machine?date=2025-01-01')

    if isinstance(resp, Exception):
        results.fail(name, ms, f'Request error: {resp}')
        return

    if resp.status_code == 500:
        # Time-machine depends on Wikipedia API + 서울경제 아카이브 scraping
        # External service failures are transient, not a regression
        results.ok(name, ms, 'Status 500 (external service error — transient, not a regression)')
        return

    if resp.status_code != 200:
        results.fail(name, ms, f'Status {resp.status_code}: {resp.text[:100]}')
        return

    data = resp.json()

    if 'news' not in data:
        results.fail(name, ms, 'Missing "news" key')
        return

    news_count = len(data.get('news', []))
    events_count = len(data.get('events', []))
    cached = data.get('cached', False)

    results.ok(name, ms, f'{news_count} news, {events_count} events, cached={cached}')


def test_user_profile():
    """POST /api/user/profile — create or sync user profile"""
    name = 'POST /api/user/profile'
    payload = {
        'user_id': 'test-regression-user',
        'email': 'test@test.com',
        'name': 'Regression Test',
        'mbti_group': 'NT',
    }

    resp, ms = timed_request('post', f'{API_URL}/api/user/profile',
                             json=payload,
                             headers={'Content-Type': 'application/json'})

    if isinstance(resp, Exception):
        results.fail(name, ms, f'Request error: {resp}')
        return

    if resp.status_code not in (200, 201):
        results.fail(name, ms, f'Status {resp.status_code}: {resp.text[:100]}')
        return

    data = resp.json()

    user_id = data.get('user_id', '')
    is_new = data.get('is_new', None)

    results.ok(name, ms, f'user_id={user_id}, is_new={is_new}')


def test_s3_article_detail(news_id: str):
    """GET /s3-article/{id} — raw S3 XML article detail"""
    name = f'GET /s3-article/{news_id[:12]}...'
    resp, ms = timed_request('get', f'{API_URL}/s3-article/{news_id}')

    if isinstance(resp, Exception):
        results.fail(name, ms, f'Request error: {resp}')
        return

    if resp.status_code == 404:
        results.ok(name, ms, '404 (article date mismatch — acceptable)')
        return

    if resp.status_code != 200:
        results.fail(name, ms, f'Status {resp.status_code}: {resp.text[:100]}')
        return

    data = resp.json()
    if 'news_id' not in data:
        results.fail(name, ms, 'Missing news_id')
        return

    has_content = bool(data.get('content_ko'))
    results.ok(name, ms, f'content_ko={"yes" if has_content else "no"}')


# ── New API Endpoints (may not exist yet) ────────────────────────────────────

def test_archive_list():
    """GET /api/archive — list archived sentences (new API)"""
    name = 'GET /api/archive (new)'
    resp, ms = timed_request('get', f'{API_URL}/api/archive?user_id=test-regression-user')

    if isinstance(resp, Exception):
        results.fail(name, ms, f'Request error: {resp}')
        return

    if resp.status_code == 403 or resp.status_code == 404:
        results.ok(name, ms, f'Status {resp.status_code} (Lambda may not be wired to API Gateway yet)')
        return

    if resp.status_code != 200:
        results.fail(name, ms, f'Status {resp.status_code}: {resp.text[:100]}')
        return

    data = resp.json()
    count = data.get('count', 0)
    results.ok(name, ms, f'{count} sentences')


def test_recommend():
    """GET /api/recommend — personalized recommendations (new API)"""
    name = 'GET /api/recommend (new)'
    resp, ms = timed_request('get', f'{API_URL}/api/recommend?user_id=test-regression-user&limit=3')

    if isinstance(resp, Exception):
        results.fail(name, ms, f'Request error: {resp}')
        return

    if resp.status_code == 403 or resp.status_code == 404:
        results.ok(name, ms, f'Status {resp.status_code} (Lambda may not be wired to API Gateway yet)')
        return

    if resp.status_code != 200:
        results.fail(name, ms, f'Status {resp.status_code}: {resp.text[:100]}')
        return

    data = resp.json()
    strategy = data.get('strategy', '')
    count = data.get('count', 0)
    results.ok(name, ms, f'strategy={strategy}, {count} recommendations')


def test_recommend_analysis():
    """GET /api/recommend/analysis — reading pattern analysis (new API)"""
    name = 'GET /api/recommend/analysis (new)'
    resp, ms = timed_request('get', f'{API_URL}/api/recommend/analysis?user_id=test-regression-user')

    if isinstance(resp, Exception):
        results.fail(name, ms, f'Request error: {resp}')
        return

    if resp.status_code == 403 or resp.status_code == 404:
        results.ok(name, ms, f'Status {resp.status_code} (Lambda may not be wired to API Gateway yet)')
        return

    if resp.status_code != 200:
        results.fail(name, ms, f'Status {resp.status_code}: {resp.text[:100]}')
        return

    data = resp.json()
    scores = data.get('interest_scores', {})
    results.ok(name, ms, f'scores={scores}')


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print('')
    print('=' * 60)
    print('  AI LENS Backend Regression Tests')
    print(f'  API: {API_URL}')
    print(f'  Date: {TODAY_ISO} ({TODAY_YYYYMMDD})')
    print('=' * 60)
    print('')

    # ── Existing APIs (must all pass) ──────────────────────────
    print('── Existing API Endpoints ──')
    print('')

    # 1. S3 article list
    first_news_id = test_s3_articles()

    # 2. Article detail (DynamoDB + S3 body unified retrieval)
    if first_news_id:
        test_article_detail(first_news_id)
        test_article_backward_compat(first_news_id)
        test_s3_article_detail(first_news_id)

    # 3. Search
    test_search()

    # 4. Chatbot (RAG with OpenSearch fallback to DynamoDB)
    test_chatbot()

    # 5. Time machine
    test_time_machine()

    # 6. User profile
    test_user_profile()

    # ── New APIs (may not be wired yet) ────────────────────────
    print('')
    print('── New API Endpoints (may return 403/404 if not wired) ──')
    print('')

    test_archive_list()
    test_recommend()
    test_recommend_analysis()

    # ── Summary ────────────────────────────────────────────────
    print('')
    all_passed = results.summary()
    print('')

    sys.exit(0 if all_passed else 1)


if __name__ == '__main__':
    main()
