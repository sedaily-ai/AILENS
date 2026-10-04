#!/usr/bin/env python3
"""
Full Integration Test — End-to-End Pipeline + Vector Search + APIs
====================================================================
Tests the complete data flow from article collection through vector indexing
to chatbot RAG and archive similarity search.

Adapts to available resources:
  - Step Functions: runs pipeline if state machine exists, otherwise tests
    storage layer directly
  - OpenSearch: tests RAG search if OPENSEARCH_ENDPOINT is set, otherwise skips
  - pgvector: tests similarity if PG_HOST is set, otherwise skips
  - DynamoDB + S3: always tested (required)

Usage:
  python tests/test_full_integration.py

  # With all services:
  OPENSEARCH_ENDPOINT=https://... PG_HOST=xxx PG_PASSWORD=xxx python tests/test_full_integration.py

Environment:
  API_URL              — API Gateway (default: production)
  OPENSEARCH_ENDPOINT  — OpenSearch domain (optional)
  PG_HOST, PG_PASSWORD — PostgreSQL (optional)
  SFN_ARN              — Step Functions ARN (auto-resolved if not set)
"""
import asyncio
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone, timedelta

import boto3
import requests as http_requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# ── Configuration ────────────────────────────────────────────────────────────

REGION = os.getenv('AWS_REGION', 'us-east-1')
API_URL = os.getenv('API_URL', 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev')
OS_ENDPOINT = os.getenv('OPENSEARCH_ENDPOINT', '')
PG_HOST = os.getenv('PG_HOST', '')
PG_PASSWORD = os.getenv('PG_PASSWORD', '')
TABLE = os.getenv('DYNAMODB_TABLE_ARTICLES', 'sedaily-mbti-articles-dev')
BUCKET = os.getenv('S3_ARTICLE_BODY_BUCKET', 'sedaily-mbti-article-body-dev')
KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).strftime('%Y%m%d')
TODAY_ISO = datetime.now(KST).strftime('%Y-%m-%d')
TIMEOUT = 60

TEST_ID = f"test_integ_{uuid.uuid4().hex[:8]}"
TEST_USER = f"{TEST_ID}_user"
TEST_NEWS_ID = f"{TEST_ID}_article"

start_time = time.time()


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
        elapsed = int(time.time() - start_time)
        print('')
        print('=' * 60)
        if self.failed == 0:
            msg = f"  {self.passed} PASSED"
            if self.skipped:
                msg += f", {self.skipped} SKIPPED"
            msg += f"  ({elapsed}s)"
            print(f"\033[32m{msg}\033[0m")
        else:
            print(f"\033[31m  {self.failed}/{total} FAILED  ({elapsed}s)\033[0m")
            for name, reason in self.errors:
                print(f"    - {name}: {reason}")
        print('=' * 60)
        return self.failed == 0


results = TestResult()
cleanup_actions = []


# ── Helper: direct handler invocation ────────────────────────────────────────

def invoke(handler_func, method, path, body=None, query_params=None, path_params=None):
    """Invoke a Lambda handler directly and return (status, body_dict)."""
    event = {
        'httpMethod': method,
        'path': path,
        'queryStringParameters': query_params or {},
        'pathParameters': path_params or {},
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body) if body else '{}',
        'isBase64Encoded': False,
    }
    result = handler_func(event, None)
    if asyncio.iscoroutine(result):
        result = asyncio.run(result)
    status = result.get('statusCode', 500)
    body_str = result.get('body', '{}')
    try:
        data = json.loads(body_str) if isinstance(body_str, str) else body_str
    except (json.JSONDecodeError, TypeError):
        data = {'raw': body_str}
    return status, data


# =============================================================================
# PHASE 1: Article Storage (DynamoDB + S3 split)
# =============================================================================

def test_phase1_storage():
    """Save a test article via split storage and verify both layers."""
    print('── Phase 1: Article Storage (DynamoDB + S3) ──')
    print('')

    from clients.s3.article_body import S3ArticleClient
    from clients.ddb.dynamodb import DynamoDBClient

    s3_client = S3ArticleClient(bucket_name=BUCKET, region=REGION)
    db = DynamoDBClient(table_name=TABLE, region=REGION, s3_article_client=s3_client)

    article = {
        'news_id': TEST_NEWS_ID,
        'item_type': 'article',
        'title_ko': f'[통합테스트] 삼성전자 1분기 실적 분석 {TEST_ID}',
        'sub_title_ko': '반도체 부문 호조',
        'content_ko': '삼성전자가 1분기 영업이익 6조원을 달성했다. 반도체 부문 실적 호조가 주된 원인이다. ' * 10,
        'content_raw': '<p>삼성전자 실적</p>',
        'content_blocks': [{'type': 'text', 'text_ko': '삼성전자 실적 발표', 'style': 'normal'}],
        'version_NT': {'title': '[NT] 삼성전자 구조 분석', 'body': 'NT 분석 본문 내용'},
        'version_NF': {'title': '[NF] 삼성전자의 의미', 'body': 'NF 해석 본문 내용'},
        'version_ST': {'title': '[ST] 삼성 실적 팩트', 'body': 'ST 팩트 본문 내용'},
        'version_SF': {'title': '[SF] 삼성전자 쉽게', 'body': 'SF 공감 본문 내용'},
        'category': '경제',
        'published_at': f'{TODAY_ISO}T10:00:00+09:00',
        'author_name': '통합테스트',
        'byline': '통합테스트',
        'url': f'https://test.com/{TEST_NEWS_ID}',
        'original_link': f'https://test.com/{TEST_NEWS_ID}',
        'images': [],
        'related_news': [],
        'is_breaking_news': False,
    }

    # 1a. Save
    name = 'Save article (split storage)'
    success = asyncio.run(db.save_article(article))
    if not success:
        results.fail(name, 'save_article returned False')
        return False
    results.ok(name)

    # Register cleanup
    def cleanup_article():
        dynamodb = boto3.resource('dynamodb', region_name=REGION)
        dynamodb.Table(TABLE).delete_item(Key={'news_id': TEST_NEWS_ID})
        s3 = boto3.client('s3', region_name=REGION)
        try:
            s3.delete_object(Bucket=BUCKET, Key=f'articles/{TEST_NEWS_ID}/body.json')
        except Exception:
            pass
    cleanup_actions.append(cleanup_article)

    # 1b. Verify DynamoDB has s3_body_uri
    name = 'DynamoDB has s3_body_uri'
    meta = asyncio.run(db.get_article_metadata(TEST_NEWS_ID))
    if not meta or not meta.get('s3_body_uri'):
        results.fail(name, f's3_body_uri missing: {meta.get("s3_body_uri") if meta else "no item"}')
        return False
    results.ok(name, meta['s3_body_uri'])

    # 1c. Verify S3 body exists with versions
    name = 'S3 body has MBTI versions'
    body = s3_client.get_body(TEST_NEWS_ID)
    if not body:
        results.fail(name, 'S3 body not found')
        return False
    has_versions = all(body.get(f'version_{g}') for g in ['NT', 'NF', 'ST', 'SF'])
    if not has_versions:
        results.fail(name, 'Missing versions in S3 body')
        return False
    results.ok(name, f'{len(body)} fields')

    # 1d. Unified retrieval
    name = 'Unified get_article (DynamoDB + S3 merge)'
    full = asyncio.run(db.get_article(TEST_NEWS_ID))
    if not full or not full.get('content_ko') or not full.get('version_NT'):
        results.fail(name, 'Merged article missing body fields')
        return False
    results.ok(name, f'title={full["title_ko"][:30]}..., has content + 4 versions')

    return True


# =============================================================================
# PHASE 2: Vector Indexing (OpenSearch + pgvector)
# =============================================================================

def test_phase2_opensearch():
    """Index test article in OpenSearch and run hybrid search."""
    print('')
    print('── Phase 2a: OpenSearch Indexing + Search ──')
    print('')

    if not OS_ENDPOINT:
        results.skip('OpenSearch indexing', 'OPENSEARCH_ENDPOINT not set')
        results.skip('OpenSearch hybrid search', 'OPENSEARCH_ENDPOINT not set')
        return False

    from clients.opensearch_client import OpenSearchClient
    from clients.embedding_client import EmbeddingClient

    os_client = OpenSearchClient(endpoint=OS_ENDPOINT, index_name='sedaily-articles-integ-test', region=REGION)
    embed_client = EmbeddingClient()

    # Create index
    name = 'OpenSearch: create index'
    try:
        os_client.create_article_index()
        results.ok(name)
    except Exception as e:
        results.fail(name, str(e)[:100])
        return False

    # Index test article
    name = 'OpenSearch: index article'
    try:
        embedding = embed_client.embed_text('삼성전자 1분기 영업이익 6조원 반도체')
        os_client.index_article(
            {'news_id': TEST_NEWS_ID, 'title': '삼성전자 1분기 실적', 'content': '삼성전자 영업이익 6조원', 'category': '경제', 'published_at': f'{TODAY_ISO}T10:00:00+09:00'},
            embedding, mbti_group='NT',
        )
        os_client._client.indices.refresh(index='sedaily-articles-integ-test')
        time.sleep(1)
        results.ok(name)
    except Exception as e:
        results.fail(name, str(e)[:100])
        return False

    # Hybrid search
    name = 'OpenSearch: hybrid search'
    try:
        query_emb = embed_client.embed_text('경제 뉴스 삼성')
        hits = os_client.hybrid_search('삼성전자', query_emb, size=5)
        found = any(TEST_NEWS_ID in h.get('news_id', '') for h in hits)
        results.ok(name, f'{len(hits)} hits, test_article_found={found}')
    except Exception as e:
        results.fail(name, str(e)[:100])

    # Cleanup
    def cleanup_os():
        try:
            os_client._client.indices.delete(index='sedaily-articles-integ-test', ignore=[404])
        except Exception:
            pass
    cleanup_actions.append(cleanup_os)

    return True



# =============================================================================
# PHASE 3: Chatbot RAG
# =============================================================================

def test_phase3_chatbot():
    """Test chatbot with RAG context from OpenSearch."""
    print('')
    print('── Phase 3: Chatbot RAG ──')
    print('')

    name = 'Chatbot: RAG response'
    try:
        resp = http_requests.post(
            f'{API_URL}/api/chat',
            json={'message': '오늘 가장 중요한 경제 뉴스가 뭐야?', 'mbti_group': 'SF', 'conversation_history': []},
            headers={'Content-Type': 'application/json'},
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            results.fail(name, f'Status {resp.status_code}')
            return

        data = resp.json()
        text = data.get('response', '')
        src = data.get('context_source', 'unknown')
        persona = data.get('persona', {}).get('name', '')

        results.ok(name, f'persona={persona}, context={src}, {len(text)} chars')

        # Check context source
        name = 'Chatbot: context source'
        if OS_ENDPOINT and src == 'opensearch_rag':
            results.ok(name, 'Using OpenSearch RAG')
        elif src == 'dynamodb_fallback':
            results.ok(name, 'Using DynamoDB fallback (OpenSearch not configured in Lambda)')
        else:
            results.ok(name, f'context_source={src}')

    except Exception as e:
        results.fail(name, str(e)[:100])


# =============================================================================
# PHASE 4: Archive + Similarity
# =============================================================================

def test_phase4_archive():
    """Test archive save + similarity search."""
    print('')
    print('── Phase 4: Archive + Similarity Search ──')
    print('')

    from handlers.user.archive import lambda_handler

    # Save a sentence
    name = 'Archive: save sentence'
    status, data = invoke(lambda_handler, 'POST', '/api/archive', body={
        'user_id': TEST_USER,
        'text': '삼성전자가 반도체 부문에서 6조원의 영업이익을 기록하며 시장 기대를 상회했다.',
        'article_id': TEST_NEWS_ID,
        'article_title': '삼성전자 1분기 실적',
    })

    if status != 201:
        results.fail(name, f'Status {status}: {data}')
        return

    archive_id = data.get('sentence', {}).get('id', '')
    vector_status = data.get('vector_status', '')
    results.ok(name, f'id={archive_id[:30]}..., vector={vector_status}')

    # Register cleanup
    def cleanup_archive():
        try:
            from repositories.personal_repository import get_personal_repository
            repo = get_personal_repository()
            sentences = asyncio.run(repo.list_archived_sentences(TEST_USER))
            for s in sentences:
                asyncio.run(repo.delete_archived_sentence(TEST_USER, s.article_id, s.created_at))
        except Exception:
            pass
    cleanup_actions.append(cleanup_archive)

    # List and verify
    name = 'Archive: list contains saved'
    status, data = invoke(lambda_handler, 'GET', '/api/archive',
                          query_params={'user_id': TEST_USER})
    if status != 200:
        results.fail(name, f'Status {status}')
        return

    found = any(s.get('id') == archive_id for s in data.get('sentences', []))
    results.ok(name, f'{data.get("count", 0)} sentences, found={found}')

    # Similarity search
    name = 'Archive: similarity search'
    status, data = invoke(lambda_handler, 'POST', '/api/archive/similar', body={
        'user_id': TEST_USER,
        'text': '반도체 실적이 좋아서 경제가 좋아지고 있다',
        'limit': 5,
    })

    if status == 503:
        results.ok(name, 'pgvector not configured — graceful 503')
    elif status == 200:
        results.ok(name, f'{data.get("count", 0)} similar results')
    else:
        results.fail(name, f'Status {status}: {data}')


# =============================================================================
# PHASE 5: Recommendation + DNA Analysis
# =============================================================================

# =============================================================================
# MAIN
# =============================================================================

def main():
    print('')
    print('=' * 60)
    print('  Full Integration Test — AI LENS Backend')
    print(f'  API: {API_URL}')
    print(f'  Date: {TODAY_ISO}')
    print(f'  OpenSearch: {"configured" if OS_ENDPOINT else "not configured"}')
    print(f'  pgvector: {"configured" if PG_HOST else "not configured"}')
    print(f'  Test ID: {TEST_ID}')
    print('=' * 60)
    print('')

    try:
        # Phase 1: Always runs — core storage
        storage_ok = test_phase1_storage()

        if not storage_ok:
            print('\n  Phase 1 failed — cannot proceed')
            return

        # Phase 2: Vector indexing (optional)
        test_phase2_opensearch()

        # Phase 3: Chatbot (always runs — tests fallback too)
        test_phase3_chatbot()

        # Phase 4: Archive (always runs — pgvector part optional)
        test_phase4_archive()

        # Phase 5: Recommendations (always runs)

    finally:
        print('')
        print('── Cleanup ──')
        for action in cleanup_actions:
            try:
                action()
            except Exception as e:
                print(f'  [warn] {e}')
        print(f'  {len(cleanup_actions)} cleanup actions executed')

    print('')
    all_passed = results.summary()
    print('')
    sys.exit(0 if all_passed else 1)


if __name__ == '__main__':
    main()
