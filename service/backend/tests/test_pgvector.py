#!/usr/bin/env python3
"""
pgvector Integration Tests — "내 서랍"(Archive) 유사 문장 검색 전용.

2026-08-05: `clients/pgvector_client.py`가 archive_vectors(내 서랍) 전용으로
축소되며(articles_vectors 테이블 관련 기능은 호출자가 없어 삭제) 이 테스트도
같이 축소했다. archive_vectors 테이블 자체의 생성/스키마 관리는 더 이상 이
클라이언트가 하지 않는다 — 이미 프로비저닝된 환경을 전제로 한다.

Tests PostgreSQL + pgvector: archived-sentence vector insertion, cosine
similarity search.

Prerequisites:
  - RDS instance available with archive_vectors table + pgvector extension
    (run provision_pgvector.sh)
  - PG_HOST and PG_PASSWORD environment variables set
  - Bedrock access (for embedding generation)

Usage:
  PG_HOST=xxx.rds.amazonaws.com PG_PASSWORD=xxx python tests/test_pgvector.py

Test data is cleaned up after all tests.
"""
import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# ── Configuration ────────────────────────────────────────────────────────────

PG_HOST = os.getenv('PG_HOST', '')
PG_PASSWORD = os.getenv('PG_PASSWORD', '')

TEST_PREFIX = f"test_pg_{uuid.uuid4().hex[:8]}"
TEST_NEWS_ID = f"{TEST_PREFIX}_article"
TEST_USER_ID = f"{TEST_PREFIX}_user"


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

pg_client = None
embed_client = None
inserted_archive_id = None


def init_clients():
    global pg_client, embed_client
    try:
        from clients.pgvector_client import PgVectorClient
        pg_client = PgVectorClient(
            host=PG_HOST,
            password=PG_PASSWORD,
        )
        # Test connection
        pg_client.conn
    except Exception as e:
        print(f"  Failed to connect to PostgreSQL: {e}")
        return False

    try:
        from clients.embedding_client import EmbeddingClient
        embed_client = EmbeddingClient()
    except Exception as e:
        print(f"  Failed to init EmbeddingClient: {e}")
        return False

    return True


# ── Test 1: Generate embedding ───────────────────────────────────────────────

def test_generate_embedding():
    """Generate a test embedding via Bedrock Titan (Bedrock access sanity check)."""
    name = 'Generate embedding'

    try:
        embedding = embed_client.embed_text(
            "삼성전자가 1분기 영업이익 6조원을 달성했다. 반도체 부문 호조."
        )

        if len(embedding) != 1024:
            results.fail(name, f'Dimension {len(embedding)}, expected 1024')
            return False

        results.ok(name, f'dim={len(embedding)}')
        return True

    except Exception as e:
        results.fail(name, str(e)[:200])
        return False


# ── Test 2: Insert archive vector ────────────────────────────────────────────

def test_insert_archive_vector():
    """Insert an archived sentence embedding."""
    global inserted_archive_id
    name = 'Insert archive vector'

    try:
        archive_embedding = embed_client.embed_text(
            "반도체 수출이 크게 증가하고 있어 경제 전망이 밝다."
        )

        row_id = pg_client.insert_archive_vector(
            user_id=TEST_USER_ID,
            sentence_text='반도체 수출이 크게 증가하고 있어 경제 전망이 밝다.',
            article_id=TEST_NEWS_ID,
            embedding=archive_embedding,
        )

        inserted_archive_id = row_id

        results.ok(name, f'row_id={row_id[:12]}..., user={TEST_USER_ID}')
        return True

    except Exception as e:
        results.fail(name, str(e)[:200])
        return False


# ── Test 3: Search similar sentences ─────────────────────────────────────────

def test_search_similar_sentences():
    """Cosine similarity search on archived sentences."""
    name = 'Search similar sentences (all users)'

    try:
        query_embedding = embed_client.embed_text('수출 경제 성장')
        hits = pg_client.search_similar_sentences(
            embedding=query_embedding,
            limit=5,
        )

        if not hits:
            results.fail(name, 'No results returned')
            return

        first = hits[0]
        distance = first['distance']

        results.ok(name, f'{len(hits)} hits, top_distance={distance:.4f}, text="{first["sentence_text"][:30]}..."')

    except Exception as e:
        results.fail(name, str(e)[:200])


# ── Test 4: Search sentences filtered by user ────────────────────────────────

def test_search_user_sentences():
    """Search archived sentences for a specific user only."""
    name = 'Search sentences (user-scoped)'

    try:
        query_embedding = embed_client.embed_text('반도체 수출')
        hits = pg_client.search_similar_sentences(
            embedding=query_embedding,
            user_id=TEST_USER_ID,
            limit=5,
        )

        if not hits:
            results.fail(name, 'No results for test user')
            return

        all_correct_user = all(h['user_id'] == TEST_USER_ID for h in hits)
        if not all_correct_user:
            wrong = [h['user_id'] for h in hits if h['user_id'] != TEST_USER_ID]
            results.fail(name, f'Got results from other users: {wrong}')
            return

        results.ok(name, f'{len(hits)} hits, all from user {TEST_USER_ID}')

    except Exception as e:
        results.fail(name, str(e)[:200])


# ── Cleanup ──────────────────────────────────────────────────────────────────

def cleanup():
    """Best-effort cleanup of any remaining test data."""
    if not pg_client:
        return

    print('')
    print('  Cleaning up test data...')

    try:
        pg_client.conn.run(
            "DELETE FROM archive_vectors WHERE user_id = :uid",
            uid=TEST_USER_ID,
        )
        print('  Done.')
    except Exception as e:
        print(f'  [warn] Cleanup error: {e}')
    finally:
        try:
            pg_client.close()
        except Exception:
            pass


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print('')
    print('=' * 60)
    print('  pgvector Integration Tests')
    print(f'  Host: {PG_HOST or "(not set)"}')
    print(f'  Test prefix: {TEST_PREFIX}')
    print('=' * 60)
    print('')

    if not PG_HOST or not PG_PASSWORD:
        print('  PG_HOST and PG_PASSWORD must be set.')
        print('  PG_HOST=xxx.rds.amazonaws.com PG_PASSWORD=xxx python tests/test_pgvector.py')
        print('')
        results.skip('All tests', 'PG_HOST/PG_PASSWORD not set')
        results.summary()
        sys.exit(0)

    if not init_clients():
        results.fail('Init clients', 'Failed to connect')
        results.summary()
        sys.exit(1)

    try:
        # Embedding
        print('── Embedding ──')
        print('')
        embed_ok = test_generate_embedding()
        if not embed_ok:
            return

        # Archive vectors
        print('')
        print('── Archive Vectors (내 서랍) ──')
        print('')
        test_insert_archive_vector()
        test_search_similar_sentences()
        test_search_user_sentences()

    finally:
        cleanup()

    print('')
    all_passed = results.summary()
    print('')
    sys.exit(0 if all_passed else 1)


if __name__ == '__main__':
    main()
