#!/usr/bin/env python3
"""
pgvector Integration Tests
============================
Tests PostgreSQL + pgvector: table creation, vector insertion,
cosine similarity search for articles and archived sentences.

Prerequisites:
  - RDS instance available (run provision_pgvector.sh, wait ~10 min)
  - pgvector extension enabled (provision_pgvector.sh --init-ext)
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
test_embedding = None
inserted_article_id = None
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


# ── Test 1: Init tables ─────────────────────────────────────────────────────

def test_init_tables():
    """Create articles_vectors and archive_vectors tables + indexes."""
    name = 'Init tables (CREATE TABLE IF NOT EXISTS)'

    try:
        pg_client.init_tables()

        # Verify tables exist
        tables = pg_client.conn.run(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' "
            "AND tablename IN ('articles_vectors', 'archive_vectors')"
        )
        table_names = [row[0] for row in tables]

        if 'articles_vectors' not in table_names:
            results.fail(name, 'articles_vectors table not created')
            return False

        if 'archive_vectors' not in table_names:
            results.fail(name, 'archive_vectors table not created')
            return False

        # Verify vector extension
        ext = pg_client.conn.run(
            "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'"
        )
        if not ext:
            results.fail(name, 'pgvector extension not installed')
            return False

        ext_version = ext[0][1]

        # Verify indexes
        indexes = pg_client.conn.run(
            "SELECT indexname FROM pg_indexes WHERE tablename IN ('articles_vectors', 'archive_vectors')"
        )
        idx_names = [row[0] for row in indexes]

        results.ok(name, f'2 tables, pgvector v{ext_version}, {len(idx_names)} indexes')
        return True

    except Exception as e:
        results.fail(name, str(e)[:200])
        return False


# ── Test 2: Generate embedding ───────────────────────────────────────────────

def test_generate_embedding():
    """Generate test embeddings via Bedrock Titan."""
    global test_embedding
    name = 'Generate embedding'

    try:
        test_embedding = embed_client.embed_text(
            "삼성전자가 1분기 영업이익 6조원을 달성했다. 반도체 부문 호조."
        )

        if len(test_embedding) != 1024:
            results.fail(name, f'Dimension {len(test_embedding)}, expected 1024')
            return False

        results.ok(name, f'dim={len(test_embedding)}')
        return True

    except Exception as e:
        results.fail(name, str(e)[:200])
        return False


# ── Test 3: Insert article vector ────────────────────────────────────────────

def test_insert_article_vector():
    """Insert an article chunk embedding."""
    global inserted_article_id
    name = 'Insert article vector'

    try:
        row_id = pg_client.insert_article_vector(
            news_id=TEST_NEWS_ID,
            mbti_group='NT',
            chunk_text='삼성전자가 1분기 영업이익 6조원을 달성했다.',
            embedding=test_embedding,
        )

        inserted_article_id = row_id

        if not row_id:
            results.fail(name, 'No row ID returned')
            return False

        # Verify by direct query
        rows = pg_client.conn.run(
            "SELECT id, news_id, mbti_group FROM articles_vectors WHERE id = :id",
            id=row_id,
        )

        if not rows:
            results.fail(name, 'Row not found after insert')
            return False

        results.ok(name, f'row_id={row_id[:12]}..., news_id={TEST_NEWS_ID}, group=NT')
        return True

    except Exception as e:
        results.fail(name, str(e)[:200])
        return False


# ── Test 4: Insert second article vector (different group) ───────────────────

def test_insert_second_vector():
    """Insert a second vector for the same article (NF version)."""
    name = 'Insert second vector (NF)'

    try:
        nf_embedding = embed_client.embed_text(
            "삼성전자의 실적이 한국 경제에 어떤 의미를 가지는지 생각해 보아야 한다."
        )

        row_id = pg_client.insert_article_vector(
            news_id=TEST_NEWS_ID,
            mbti_group='NF',
            chunk_text='삼성전자의 실적이 한국 경제에 어떤 의미를 가지는지.',
            embedding=nf_embedding,
        )

        results.ok(name, f'row_id={row_id[:12]}...')
        return True

    except Exception as e:
        results.fail(name, str(e)[:200])
        return False


# ── Test 5: Search similar articles ──────────────────────────────────────────

def test_search_similar_articles():
    """Cosine similarity search across article vectors."""
    name = 'Search similar articles'

    try:
        query_embedding = embed_client.embed_text('경제 관련 뉴스')
        hits = pg_client.search_similar_articles(
            embedding=query_embedding,
            limit=5,
        )

        if not hits:
            results.fail(name, 'No results returned')
            return

        first = hits[0]
        distance = first['distance']
        found_test = any(h['news_id'] == TEST_NEWS_ID for h in hits)

        results.ok(name, f'{len(hits)} hits, top_distance={distance:.4f}, test_article_found={found_test}')

    except Exception as e:
        results.fail(name, str(e)[:200])


# ── Test 6: Insert archive vector ────────────────────────────────────────────

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


# ── Test 7: Search similar sentences ─────────────────────────────────────────

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


# ── Test 8: Search sentences filtered by user ────────────────────────────────

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


# ── Test 9: Delete and verify ────────────────────────────────────────────────

def test_delete_vectors():
    """Delete test vectors and verify they're gone."""
    name = 'Delete vectors'

    try:
        # Delete article vectors
        pg_client.delete_article_vectors(TEST_NEWS_ID)

        # Verify
        rows = pg_client.conn.run(
            "SELECT COUNT(*) FROM articles_vectors WHERE news_id = :nid",
            nid=TEST_NEWS_ID,
        )
        count = rows[0][0] if rows else -1

        if count != 0:
            results.fail(name, f'{count} article vectors still exist after delete')
            return

        # Delete archive vector
        if inserted_archive_id:
            pg_client.delete_archive_vector(inserted_archive_id)

        results.ok(name, 'Article + archive vectors deleted')

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
            "DELETE FROM articles_vectors WHERE news_id = :nid",
            nid=TEST_NEWS_ID,
        )
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
        # Schema
        print('── Schema ──')
        print('')
        tables_ok = test_init_tables()
        if not tables_ok:
            return

        # Embedding
        print('')
        print('── Embedding ──')
        print('')
        embed_ok = test_generate_embedding()
        if not embed_ok:
            return

        # Article vectors
        print('')
        print('── Article Vectors ──')
        print('')
        test_insert_article_vector()
        test_insert_second_vector()
        test_search_similar_articles()

        # Archive vectors
        print('')
        print('── Archive Vectors (내 서랍) ──')
        print('')
        test_insert_archive_vector()
        test_search_similar_sentences()
        test_search_user_sentences()

        # Cleanup
        print('')
        print('── Cleanup ──')
        print('')
        test_delete_vectors()

    finally:
        cleanup()

    print('')
    all_passed = results.summary()
    print('')
    sys.exit(0 if all_passed else 1)


if __name__ == '__main__':
    main()
