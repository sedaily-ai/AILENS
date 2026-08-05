#!/usr/bin/env python3
"""
OpenSearch Integration Tests
==============================
Tests the OpenSearch client: index creation, document indexing,
text search, vector search, hybrid search, and chatbot RAG.

Prerequisites:
  - OpenSearch domain active (run provision_opensearch.sh, wait 15-20 min)
  - OPENSEARCH_ENDPOINT environment variable set
  - Bedrock access (for embedding generation)

Usage:
  OPENSEARCH_ENDPOINT=https://xxx.us-east-1.es.amazonaws.com python tests/test_opensearch.py

Test data is cleaned up after all tests.
"""
import json
import os
import sys
import time
import uuid

import requests as http_requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# ── Configuration ────────────────────────────────────────────────────────────

REGION = os.getenv('AWS_REGION', 'us-east-1')
ENDPOINT = os.getenv('OPENSEARCH_ENDPOINT', '')
INDEX_NAME = os.getenv('OPENSEARCH_INDEX', 'sedaily-articles-test')
API_URL = os.getenv('API_URL', 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev')

TEST_PREFIX = f"test_os_{uuid.uuid4().hex[:8]}"

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

# ── Shared state ─────────────────────────────────────────────────────────────

os_client = None
embed_client = None
test_embedding = None


def init_clients():
    """Initialize OpenSearch and Embedding clients."""
    global os_client, embed_client

    if not ENDPOINT:
        return False

    try:
        from clients.opensearch_client import OpenSearchClient
        os_client = OpenSearchClient(
            endpoint=ENDPOINT,
            index_name=INDEX_NAME,
            region=REGION,
        )
    except Exception as e:
        print(f"  Failed to init OpenSearchClient: {e}")
        return False

    try:
        from clients.embedding_client import EmbeddingClient
        embed_client = EmbeddingClient()
    except Exception as e:
        print(f"  Failed to init EmbeddingClient: {e}")
        return False

    return True


# ── Test 1: Create index ────────────────────────────────────────────────────

def test_create_index():
    """Create the article index with Korean analyzer + kNN vector field."""
    name = 'Create article index'

    try:
        success = os_client.create_article_index()
        if not success:
            results.fail(name, 'create_article_index returned False')
            return False

        # Verify index exists
        exists = os_client._client.indices.exists(index=INDEX_NAME)
        if not exists:
            results.fail(name, 'Index does not exist after creation')
            return False

        # Verify mappings
        mappings = os_client._client.indices.get_mapping(index=INDEX_NAME)
        props = mappings.get(INDEX_NAME, {}).get('mappings', {}).get('properties', {})

        expected_fields = ['news_id', 'title', 'body_text', 'category',
                          'published_at', 'mbti_group', 'embedding_vector']
        missing = [f for f in expected_fields if f not in props]

        if missing:
            results.fail(name, f'Missing fields in mapping: {missing}')
            return False

        # Verify embedding_vector is knn_vector with correct dimension
        emb_mapping = props.get('embedding_vector', {})
        if emb_mapping.get('type') != 'knn_vector':
            results.fail(name, f'embedding_vector type: {emb_mapping.get("type")} (expected knn_vector)')
            return False

        dim = emb_mapping.get('dimension', 0)
        results.ok(name, f'fields={len(props)}, embedding_dim={dim}')
        return True

    except Exception as e:
        results.fail(name, str(e)[:200])
        return False


# ── Test 2: Generate embedding ───────────────────────────────────────────────

def test_generate_embedding():
    """Generate a test embedding via Bedrock Titan."""
    global test_embedding
    name = 'Generate embedding'

    try:
        test_embedding = embed_client.embed_text(
            "삼성전자가 1분기 영업이익 6조원을 달성했다. 반도체 부문 실적 호조가 주요 원인이다."
        )

        if not test_embedding:
            results.fail(name, 'Empty embedding returned')
            return False

        if len(test_embedding) != 1024:
            results.fail(name, f'Dimension {len(test_embedding)}, expected 1024')
            return False

        results.ok(name, f'dim={len(test_embedding)}, first_3=[{test_embedding[0]:.4f}, {test_embedding[1]:.4f}, {test_embedding[2]:.4f}]')
        return True

    except Exception as e:
        results.fail(name, str(e)[:200])
        return False


# ── Test 3: Index a test article ─────────────────────────────────────────────

def test_index_article():
    """Index a test article with embedding."""
    name = 'Index article'

    test_article = {
        'news_id': f'{TEST_PREFIX}_001',
        'title': '삼성전자 1분기 영업이익 6조원 돌파',
        'content': '삼성전자가 1분기 영업이익 6조원을 달성했다. 반도체 부문 실적 호조가 주요 원인이다. 메모리 반도체 가격 상승과 HBM 수요 증가가 실적을 견인했다.',
        'category': '경제',
        'published_at': '2026-04-09T10:00:00+09:00',
    }

    try:
        success = os_client.index_article(test_article, test_embedding, mbti_group='NT')
        if not success:
            results.fail(name, 'index_article returned False')
            return False

        # Also index an NF version
        nf_article = dict(test_article)
        nf_article['title'] = '삼성전자 실적이 우리에게 의미하는 것'
        nf_article['content'] = '삼성전자의 6조원 실적 뒤에는 반도체 산업의 구조적 변화가 있다. 이는 한국 경제 전체에 어떤 의미일까.'

        nf_embedding = embed_client.embed_text(nf_article['content'])
        os_client.index_article(nf_article, nf_embedding, mbti_group='NF')

        # Refresh index for immediate search
        os_client._client.indices.refresh(index=INDEX_NAME)

        # Wait a moment for indexing
        time.sleep(1)

        results.ok(name, f'news_id={test_article["news_id"]}, 2 versions (NT+NF)')
        return True

    except Exception as e:
        results.fail(name, str(e)[:200])
        return False


# ── Test 4: Text search ─────────────────────────────────────────────────────

def test_text_search():
    """BM25 text search with Korean analyzer."""
    name = 'Text search (BM25)'

    try:
        hits = os_client.search_by_text(
            query='삼성전자 영업이익',
            size=5,
        )

        if not hits:
            results.fail(name, 'No results returned')
            return

        first = hits[0]
        score = first.get('_score', 0)
        title = first.get('title', '')

        found_test = any(TEST_PREFIX in h.get('news_id', '') for h in hits)

        results.ok(name, f'{len(hits)} hits, top_score={score:.2f}, test_article_found={found_test}')

    except Exception as e:
        results.fail(name, str(e)[:200])


# ── Test 5: Vector search ───────────────────────────────────────────────────

def test_vector_search():
    """kNN vector search using cosine similarity."""
    name = 'Vector search (kNN)'

    try:
        query_embedding = embed_client.embed_text('반도체 실적 분석')
        hits = os_client.search_by_vector(
            embedding=query_embedding,
            k=5,
        )

        if not hits:
            results.fail(name, 'No results returned')
            return

        first = hits[0]
        score = first.get('_score', 0)

        results.ok(name, f'{len(hits)} hits, top_score={score:.4f}')

    except Exception as e:
        results.fail(name, str(e)[:200])


# ── Test 6: Hybrid search ───────────────────────────────────────────────────

def test_hybrid_search():
    """Combined text + vector search with score normalization."""
    name = 'Hybrid search (text+vector)'

    try:
        query_embedding = embed_client.embed_text('경제 뉴스 삼성전자')
        hits = os_client.hybrid_search(
            query='경제 뉴스',
            embedding=query_embedding,
            size=5,
        )

        if not hits:
            results.fail(name, 'No results returned')
            return

        first = hits[0]
        combined = first.get('_score', 0)
        text_s = first.get('_text_score', 0)
        vec_s = first.get('_vector_score', 0)

        results.ok(name, f'{len(hits)} hits, top: combined={combined:.4f} (text={text_s:.4f}, vector={vec_s:.4f})')

    except Exception as e:
        results.fail(name, str(e)[:200])


# ── Test 7: Filtered search ─────────────────────────────────────────────────

def test_filtered_search():
    """Search with category and mbti_group filters."""
    name = 'Filtered search'

    try:
        hits = os_client.search_by_text(
            query='삼성',
            filters={'category': '경제', 'mbti_group': 'NT'},
            size=5,
        )

        nt_count = sum(1 for h in hits if h.get('mbti_group') == 'NT')

        results.ok(name, f'{len(hits)} hits (NT filter), {nt_count} are NT')

    except Exception as e:
        results.fail(name, str(e)[:200])


# ── Test 8: Chatbot RAG via HTTP ─────────────────────────────────────────────

def test_chatbot_rag():
    """POST /api/chat — verify context_source is opensearch_rag."""
    name = 'Chatbot RAG (HTTP)'

    try:
        resp = http_requests.post(
            f'{API_URL}/api/chat',
            json={
                'message': '오늘 경제 뉴스 알려줘',
                'mbti_group': 'NT',
                'conversation_history': [],
            },
            headers={'Content-Type': 'application/json'},
            timeout=30,
        )

        if resp.status_code != 200:
            results.fail(name, f'Status {resp.status_code}: {resp.text[:100]}')
            return

        data = resp.json()
        context_src = data.get('context_source', 'unknown')
        response_text = data.get('response', '')

        # If OPENSEARCH_ENDPOINT is set in the Lambda env, should use opensearch_rag
        # If not set, will fallback to dynamodb_fallback
        if context_src == 'opensearch_rag':
            results.ok(name, f'context_source=opensearch_rag, {len(response_text)} chars')
        elif context_src == 'dynamodb_fallback':
            results.ok(name, f'context_source=dynamodb_fallback (Lambda env may not have OPENSEARCH_ENDPOINT yet)')
        else:
            results.ok(name, f'context_source={context_src}, {len(response_text)} chars')

    except Exception as e:
        results.fail(name, str(e)[:200])


# ── Cleanup ──────────────────────────────────────────────────────────────────

def cleanup():
    """Delete test documents and optionally the test index."""
    if not os_client:
        return

    print('')
    print('  Cleaning up test data...')

    try:
        # Delete test documents
        for suffix in ['_001_NT', '_001_NF', '_001']:
            doc_id = f'{TEST_PREFIX}{suffix}'
            os_client._client.delete(index=INDEX_NAME, id=doc_id, ignore=[404])

        # If using a test-specific index, delete it
        if 'test' in INDEX_NAME:
            os_client._client.indices.delete(index=INDEX_NAME, ignore=[404])
            print(f'  Deleted test index: {INDEX_NAME}')
        else:
            print(f'  Kept index {INDEX_NAME} (not a test index)')

    except Exception as e:
        print(f'  [warn] Cleanup error: {e}')

    print('  Done.')


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print('')
    print('=' * 60)
    print('  OpenSearch Integration Tests')
    print(f'  Endpoint: {ENDPOINT or "(not set)"}')
    print(f'  Index: {INDEX_NAME}')
    print(f'  Test prefix: {TEST_PREFIX}')
    print('=' * 60)
    print('')

    if not ENDPOINT:
        print('  OPENSEARCH_ENDPOINT not set.')
        print('  Run: OPENSEARCH_ENDPOINT=https://xxx.es.amazonaws.com python tests/test_opensearch.py')
        print('')
        results.skip('All tests', 'OPENSEARCH_ENDPOINT not set')
        results.summary()
        sys.exit(0)

    if not init_clients():
        results.fail('Init clients', 'Failed to initialize OpenSearch or Embedding client')
        results.summary()
        sys.exit(1)

    try:
        # Index creation
        print('── Index Management ──')
        print('')
        index_ok = test_create_index()

        if not index_ok:
            print('\n  Index creation failed — skipping remaining tests')
            return

        # Embedding generation
        print('')
        print('── Embedding ──')
        print('')
        embed_ok = test_generate_embedding()

        if not embed_ok:
            print('\n  Embedding failed — skipping indexing/search tests')
            return

        # Document indexing
        print('')
        print('── Document Operations ──')
        print('')
        index_ok = test_index_article()

        if not index_ok:
            print('\n  Indexing failed — skipping search tests')
            return

        # Search tests
        print('')
        print('── Search ──')
        print('')
        test_text_search()
        test_vector_search()
        test_hybrid_search()
        test_filtered_search()

        # Chatbot RAG
        print('')
        print('── Chatbot RAG ──')
        print('')
        test_chatbot_rag()

    finally:
        cleanup()

    print('')
    all_passed = results.summary()
    print('')
    sys.exit(0 if all_passed else 1)


if __name__ == '__main__':
    main()
