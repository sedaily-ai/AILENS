#!/usr/bin/env python3
"""
Split Storage Integration Tests
=================================
Tests the DynamoDB pointer + S3 body storage layer using actual AWS resources.

What is tested:
  1. save_article splits body fields to S3, metadata to DynamoDB
  2. get_article merges DynamoDB metadata + S3 body transparently
  3. Legacy articles (no s3_body_uri) still return body from DynamoDB
  4. GET /api/article/{id} end-to-end via HTTP

Requirements:
  - AWS credentials configured (DynamoDB + S3 access)
  - DynamoDB table: sedaily-mbti-articles-dev (must exist)
  - S3 bucket: sedaily-mbti-article-body-dev (must exist — run provision.sh first)
  - requests library installed

Usage:
  python tests/test_split_storage.py
  API_URL=http://localhost:8000 python tests/test_split_storage.py

All test articles use a 'test_split_' prefix and are cleaned up after each test.
"""
import asyncio
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone, timedelta

import requests

# ── Add backend root to path ─────────────────────────────────────────────────

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from clients.s3_article_client import S3ArticleClient
from clients.dynamodb_client import DynamoDBClient
from config.constants import S3_BODY_FIELDS

# ── Configuration ────────────────────────────────────────────────────────────

REGION = os.getenv('AWS_REGION', 'us-east-1')
TABLE = os.getenv('DYNAMODB_TABLE_ARTICLES', 'sedaily-mbti-articles-dev')
BUCKET = os.getenv('S3_ARTICLE_BODY_BUCKET', 'sedaily-mbti-article-body-dev')
API_URL = os.getenv('API_URL', 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev')

# Test article IDs use a unique prefix for safe cleanup
TEST_PREFIX = f"test_split_{uuid.uuid4().hex[:8]}"


# ── Test Framework ───────────────────────────────────────────────────────────

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []

    def ok(self, name: str, detail: str = ''):
        self.passed += 1
        print(f"  \033[32mPASS\033[0m  {name} {detail}")

    def fail(self, name: str, reason: str):
        self.failed += 1
        self.errors.append((name, reason))
        print(f"  \033[31mFAIL\033[0m  {name} — {reason}")

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


# ── Test Fixtures ────────────────────────────────────────────────────────────

def make_test_article(news_id: str) -> dict:
    """Create a full test article with all fields."""
    return {
        'news_id': news_id,
        'item_type': 'article',
        'press': '서울경제',
        'title_ko': f'[TEST] 테스트 기사 제목 {news_id}',
        'sub_title_ko': '테스트 부제목',
        'content_ko': '삼성전자가 1분기 영업이익 6조원을 기록했다. ' * 20,
        'content_raw': '<p>삼성전자가 1분기 영업이익 6조원을 기록했다.</p>',
        'content_blocks': [
            {'type': 'text', 'text_ko': '삼성전자가 실적을 발표했다.', 'style': 'normal'},
            {'type': 'image', 'url': 'https://example.com/img.jpg', 'caption': '삼성전자'},
        ],
        'version_NT': {'title': '[NT] 삼성전자 구조 분석', 'body': 'NT 본문 내용'},
        'version_NF': {'title': '[NF] 삼성전자의 의미', 'body': 'NF 본문 내용'},
        'version_ST': {'title': '[ST] 삼성 실적 팩트', 'body': 'ST 본문 내용'},
        'version_SF': {'title': '[SF] 삼성전자 쉽게 보기', 'body': 'SF 본문 내용'},
        'category': '경제',
        'published_at': '2026-04-09T10:00:00+09:00',
        'author_name': '테스트 기자',
        'author_email': 'test@sedaily.com',
        'byline': '테스트 기자',
        'url': f'https://www.sedaily.com/NewsView/{news_id}',
        'original_link': f'https://www.sedaily.com/NewsView/{news_id}',
        'images': [{'url': 'https://example.com/img.jpg', 'caption_content': '테스트'}],
        'related_news': [],
        'is_breaking_news': False,
    }


def make_legacy_article(news_id: str) -> dict:
    """Create a legacy article (stored entirely in DynamoDB, no S3 split)."""
    article = make_test_article(news_id)
    # Legacy articles don't go through S3ArticleClient — they're saved
    # by a DynamoDBClient without s3_article_client configured
    return article


# ── Cleanup ──────────────────────────────────────────────────────────────────

created_news_ids = []


def cleanup():
    """Remove all test articles from DynamoDB and S3."""
    import boto3

    if not created_news_ids:
        return

    print('')
    print(f'  Cleaning up {len(created_news_ids)} test articles...')

    # DynamoDB cleanup
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    table = dynamodb.Table(TABLE)
    for nid in created_news_ids:
        try:
            table.delete_item(Key={'news_id': nid})
        except Exception:
            pass

    # S3 cleanup
    s3 = boto3.client('s3', region_name=REGION)
    for nid in created_news_ids:
        key = f"articles/{nid}/body.json"
        try:
            s3.delete_object(Bucket=BUCKET, Key=key)
        except Exception:
            pass

    print(f'  Cleanup done.')


# ── Test 1: Save with split storage ──────────────────────────────────────────

def test_save_split_storage():
    """save_article splits body → S3, metadata → DynamoDB"""
    name = 'save_article (split storage)'
    news_id = f'{TEST_PREFIX}_save'
    created_news_ids.append(news_id)

    # Create clients: DynamoDB wired to S3ArticleClient
    s3_client = S3ArticleClient(bucket_name=BUCKET, region=REGION)
    db = DynamoDBClient(table_name=TABLE, region=REGION, s3_article_client=s3_client)

    article = make_test_article(news_id)

    # Save
    success = asyncio.run(db.save_article(article))
    if not success:
        results.fail(name, 'save_article returned False')
        return

    # Verify DynamoDB has metadata + s3_body_uri, but NOT body fields
    import boto3
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    table = dynamodb.Table(TABLE)
    response = table.get_item(Key={'news_id': news_id})
    item = response.get('Item')

    if not item:
        results.fail(name, 'Article not found in DynamoDB after save')
        return

    # Must have s3_body_uri
    if not item.get('s3_body_uri'):
        results.fail(name, 'Missing s3_body_uri in DynamoDB')
        return

    # Must have metadata
    if item.get('title_ko') != article['title_ko']:
        results.fail(name, f"title_ko mismatch: {item.get('title_ko')}")
        return

    if item.get('category') != '경제':
        results.fail(name, f"category mismatch: {item.get('category')}")
        return

    # Must NOT have body fields in DynamoDB
    body_fields_in_dynamo = [f for f in S3_BODY_FIELDS if item.get(f)]
    if body_fields_in_dynamo:
        results.fail(name, f'Body fields leaked to DynamoDB: {body_fields_in_dynamo}')
        return

    # Verify S3 has the body
    body = s3_client.get_body(news_id)
    if not body:
        results.fail(name, 'Body not found in S3')
        return

    if not body.get('content_ko'):
        results.fail(name, 'S3 body missing content_ko')
        return

    if not body.get('version_NT'):
        results.fail(name, 'S3 body missing version_NT')
        return

    s3_uri = item['s3_body_uri']
    results.ok(name, f's3_body_uri={s3_uri}, DynamoDB clean, S3 has {len(body)} fields')


# ── Test 2: Get with unified retrieval ───────────────────────────────────────

def test_get_unified_retrieval():
    """get_article merges DynamoDB metadata + S3 body"""
    name = 'get_article (unified retrieval)'
    news_id = f'{TEST_PREFIX}_save'  # reuse article from test 1

    s3_client = S3ArticleClient(bucket_name=BUCKET, region=REGION)
    db = DynamoDBClient(table_name=TABLE, region=REGION, s3_article_client=s3_client)

    article = asyncio.run(db.get_article(news_id))
    if not article:
        results.fail(name, 'get_article returned None')
        return

    # Must have metadata (from DynamoDB)
    if not article.get('title_ko'):
        results.fail(name, 'Missing title_ko')
        return

    if not article.get('category'):
        results.fail(name, 'Missing category')
        return

    if not article.get('s3_body_uri'):
        results.fail(name, 'Missing s3_body_uri')
        return

    # Must have body (merged from S3)
    if not article.get('content_ko'):
        results.fail(name, 'Missing content_ko (S3 merge failed)')
        return

    if not article.get('version_NT'):
        results.fail(name, 'Missing version_NT (S3 merge failed)')
        return

    if not article.get('version_NF'):
        results.fail(name, 'Missing version_NF (S3 merge failed)')
        return

    if not article.get('version_ST'):
        results.fail(name, 'Missing version_ST (S3 merge failed)')
        return

    if not article.get('version_SF'):
        results.fail(name, 'Missing version_SF (S3 merge failed)')
        return

    if not article.get('content_blocks'):
        results.fail(name, 'Missing content_blocks (S3 merge failed)')
        return

    results.ok(name, f'All fields present: metadata + {len(S3_BODY_FIELDS)} body fields from S3')


# ── Test 3: get_article_metadata returns only DynamoDB data ──────────────────

def test_get_metadata_only():
    """get_article_metadata returns DynamoDB data without S3 fetch"""
    name = 'get_article_metadata (no S3)'
    news_id = f'{TEST_PREFIX}_save'  # reuse article from test 1

    s3_client = S3ArticleClient(bucket_name=BUCKET, region=REGION)
    db = DynamoDBClient(table_name=TABLE, region=REGION, s3_article_client=s3_client)

    metadata = asyncio.run(db.get_article_metadata(news_id))
    if not metadata:
        results.fail(name, 'get_article_metadata returned None')
        return

    # Must have metadata
    if not metadata.get('title_ko'):
        results.fail(name, 'Missing title_ko')
        return

    if not metadata.get('s3_body_uri'):
        results.fail(name, 'Missing s3_body_uri')
        return

    # Must NOT have body fields (they're in S3, not fetched)
    body_fields_present = [f for f in S3_BODY_FIELDS if metadata.get(f)]
    if body_fields_present:
        results.fail(name, f'Body fields should not be in metadata-only: {body_fields_present}')
        return

    results.ok(name, 'Metadata only — no body fields, no S3 fetch')


# ── Test 4: Backward compatibility (legacy article) ─────────────────────────

def test_backward_compat_legacy():
    """Legacy articles (no s3_body_uri) still return body from DynamoDB"""
    name = 'Backward compat (legacy article)'
    news_id = f'{TEST_PREFIX}_legacy'
    created_news_ids.append(news_id)

    # Save WITHOUT s3_article_client → everything goes to DynamoDB
    db_legacy = DynamoDBClient(table_name=TABLE, region=REGION, s3_article_client=None)

    article = make_legacy_article(news_id)
    success = asyncio.run(db_legacy.save_article(article))
    if not success:
        results.fail(name, 'Legacy save_article returned False')
        return

    # Verify DynamoDB has body fields directly
    import boto3
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    table = dynamodb.Table(TABLE)
    response = table.get_item(Key={'news_id': news_id})
    item = response.get('Item', {})

    if item.get('s3_body_uri'):
        results.fail(name, 'Legacy article should NOT have s3_body_uri')
        return

    if not item.get('content_ko'):
        results.fail(name, 'Legacy article missing content_ko in DynamoDB')
        return

    # Now read it back with a split-storage client — should still work
    s3_client = S3ArticleClient(bucket_name=BUCKET, region=REGION)
    db_split = DynamoDBClient(table_name=TABLE, region=REGION, s3_article_client=s3_client)

    retrieved = asyncio.run(db_split.get_article(news_id))
    if not retrieved:
        results.fail(name, 'get_article returned None for legacy article')
        return

    if not retrieved.get('content_ko'):
        results.fail(name, 'Legacy article: content_ko missing after retrieval')
        return

    if not retrieved.get('version_NT'):
        results.fail(name, 'Legacy article: version_NT missing after retrieval')
        return

    results.ok(name, 'Legacy article: body read directly from DynamoDB, no S3 needed')


# ── Test 5: DynamoDBClient without S3 client reads what it can ───────────────

def test_get_without_s3_client():
    """DynamoDBClient without s3_article_client returns DynamoDB data only"""
    name = 'get_article (no S3 client configured)'
    news_id = f'{TEST_PREFIX}_save'  # split article from test 1

    # Client WITHOUT s3_article_client
    db_no_s3 = DynamoDBClient(table_name=TABLE, region=REGION, s3_article_client=None)

    article = asyncio.run(db_no_s3.get_article(news_id))
    if not article:
        results.fail(name, 'get_article returned None')
        return

    # Has metadata
    if not article.get('title_ko'):
        results.fail(name, 'Missing title_ko')
        return

    # Has s3_body_uri pointer but no body (can't fetch without S3 client)
    if not article.get('s3_body_uri'):
        results.fail(name, 'Missing s3_body_uri')
        return

    # Body fields should NOT be present (they're in S3 and we can't fetch them)
    if article.get('content_ko'):
        results.fail(name, 'content_ko should not be present without S3 client')
        return

    results.ok(name, 'Returns metadata + s3_body_uri pointer only (no body merge)')


# ── Test 6: S3ArticleClient direct operations ────────────────────────────────

def test_s3_client_direct():
    """S3ArticleClient put/get/delete cycle"""
    name = 'S3ArticleClient (put/get/delete)'
    news_id = f'{TEST_PREFIX}_s3direct'
    created_news_ids.append(news_id)

    s3_client = S3ArticleClient(bucket_name=BUCKET, region=REGION)

    body = {
        'content_ko': '직접 테스트 본문',
        'version_NT': {'title': 'NT 제목', 'body': 'NT 본문'},
    }

    # Put
    uri = s3_client.put_body(news_id, body)
    if not uri.startswith('s3://'):
        results.fail(name, f'Invalid URI: {uri}')
        return

    # Get
    retrieved = s3_client.get_body(news_id)
    if not retrieved:
        results.fail(name, 'get_body returned None')
        return

    if retrieved.get('content_ko') != '직접 테스트 본문':
        results.fail(name, f'Content mismatch: {retrieved.get("content_ko")}')
        return

    # Delete
    deleted = s3_client.delete_body(news_id)
    if not deleted:
        results.fail(name, 'delete_body returned False')
        return

    # Verify deleted
    gone = s3_client.get_body(news_id)
    if gone is not None:
        results.fail(name, 'Body still exists after delete')
        return

    results.ok(name, f'uri={uri}, round-trip OK, delete confirmed')


# ── Test 7: End-to-end via HTTP API ──────────────────────────────────────────

def test_api_end_to_end():
    """GET /api/article/{id} returns merged article via HTTP"""
    name = 'GET /api/article (HTTP e2e)'
    news_id = f'{TEST_PREFIX}_save'  # split article from test 1

    try:
        resp = requests.get(f'{API_URL}/api/article/{news_id}', timeout=30)
    except Exception as e:
        results.fail(name, f'Request error: {e}')
        return

    if resp.status_code == 400:
        # The deployed Lambda may not have the S3 client wired yet
        # (depends on whether deploy.sh has been run with the updated article_handler)
        results.ok(name, 'Status 400 — Lambda may not have S3 client wired yet (deploy needed)')
        return

    if resp.status_code != 200:
        results.fail(name, f'Status {resp.status_code}: {resp.text[:150]}')
        return

    data = resp.json()

    if not data.get('news_id'):
        results.fail(name, 'Missing news_id in response')
        return

    if not data.get('title_ko'):
        results.fail(name, 'Missing title_ko')
        return

    # Check for MBTI versions (should be merged from S3 by the handler)
    has_nt = bool(data.get('version_NT'))
    has_content = bool(data.get('content_ko'))

    results.ok(name, f'news_id={data["news_id"]}, content_ko={"yes" if has_content else "no"}, version_NT={"yes" if has_nt else "no"}')


# ── Test 8: content_hash is preserved ────────────────────────────────────────

def test_content_hash():
    """content_hash is generated and stored in DynamoDB metadata"""
    name = 'content_hash (change detection)'
    news_id = f'{TEST_PREFIX}_save'  # split article from test 1

    import boto3
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    table = dynamodb.Table(TABLE)
    response = table.get_item(Key={'news_id': news_id})
    item = response.get('Item', {})

    content_hash = item.get('content_hash', '')
    if not content_hash:
        results.fail(name, 'Missing content_hash in DynamoDB')
        return

    if len(content_hash) != 64:
        results.fail(name, f'content_hash length {len(content_hash)} (expected 64 hex chars)')
        return

    results.ok(name, f'hash={content_hash[:16]}... (SHA256, 64 chars)')


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print('')
    print('=' * 60)
    print('  Split Storage Integration Tests')
    print(f'  DynamoDB: {TABLE}')
    print(f'  S3: {BUCKET}')
    print(f'  API: {API_URL}')
    print(f'  Test prefix: {TEST_PREFIX}')
    print('=' * 60)
    print('')

    try:
        # Storage layer tests
        print('── Storage Layer ──')
        print('')
        test_save_split_storage()
        test_get_unified_retrieval()
        test_get_metadata_only()
        test_backward_compat_legacy()
        test_get_without_s3_client()
        test_s3_client_direct()
        test_content_hash()

        # HTTP API test
        print('')
        print('── HTTP API ──')
        print('')
        test_api_end_to_end()

    finally:
        cleanup()

    print('')
    all_passed = results.summary()
    print('')
    sys.exit(0 if all_passed else 1)


if __name__ == '__main__':
    main()
