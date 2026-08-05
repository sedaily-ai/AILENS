"""
OpenSearch Client
RAG search using both full-text and kNN vector search.

Replaces DynamoDB GSI-based search for semantic queries (chatbot RAG,
article similarity). DynamoDB GSI search remains for date+category listing.

Index: sedaily-articles (configurable via OPENSEARCH_INDEX env var)
Fields:
  - news_id (keyword): article ID, unique
  - title (text, Korean analyzer): searchable title
  - body_text (text, Korean analyzer): full article body for text search
  - category (keyword): 경제, IT_과학, etc.
  - published_at (date): ISO 8601
  - mbti_group (keyword): NT/NF/ST/SF — which version this doc represents
  - embedding_vector (knn_vector): 1024-dim Titan embedding

Env vars:
  OPENSEARCH_ENDPOINT — e.g. https://xxx.us-east-1.es.amazonaws.com
  OPENSEARCH_INDEX — default: sedaily-articles
"""
import json
import logging
from typing import Optional, Dict, Any, List

import boto3
from botocore.config import Config as BotoConfig
from requests_aws4auth import AWS4Auth
from opensearchpy import OpenSearch, RequestsHttpConnection

from config.constants import BEDROCK_EMBEDDING_DIMENSION

logger = logging.getLogger(__name__)


class OpenSearchClient:
    """
    Client for OpenSearch full-text + kNN vector search.

    Supports three search modes:
      - search_by_text: BM25 full-text search (Korean analyzer)
      - search_by_vector: kNN approximate nearest-neighbor search
      - hybrid_search: combined text + vector with score normalization
    """

    def __init__(
        self,
        endpoint: str,
        index_name: str = 'sedaily-articles',
        region: str = 'us-east-1',
        dimension: int = BEDROCK_EMBEDDING_DIMENSION,
    ):
        """
        Args:
            endpoint: OpenSearch domain endpoint (https://xxx.us-east-1.es.amazonaws.com).
                      If empty, all methods return empty results (no-op mode).
            index_name: Index name for articles
            region: AWS region
            dimension: Embedding vector dimension (must match EmbeddingClient)
        """
        self.index_name = index_name
        self.dimension = dimension
        self._enabled = bool(endpoint and endpoint.strip())
        self._client = None

        if not self._enabled:
            logger.warning("OpenSearch endpoint is empty — running in no-op mode")
            return

        try:
            credentials = boto3.Session().get_credentials()
            auth = AWS4Auth(
                credentials.access_key,
                credentials.secret_key,
                region,
                'es',
                session_token=credentials.token,
            )

            self._client = OpenSearch(
                hosts=[endpoint],
                http_auth=auth,
                use_ssl=True,
                verify_certs=True,
                connection_class=RequestsHttpConnection,
                timeout=30,
            )
        except Exception as e:
            logger.warning(f"Failed to initialize OpenSearch client: {e}")
            self._enabled = False

    # =========================================================================
    # Index Management
    # =========================================================================

    def create_article_index(self) -> bool:
        """
        Create the article index with text + kNN vector mappings.

        Uses nmslib engine with cosine similarity for kNN. The index is
        created only if it doesn't already exist.

        Returns:
            True if created or already exists
        """
        if not self._enabled:
            return False
        if self._client.indices.exists(index=self.index_name):
            logger.info(f"Index '{self.index_name}' already exists")
            return True

        body = {
            'settings': {
                'index': {
                    'knn': True,
                    'number_of_shards': 2,
                    'number_of_replicas': 1,
                },
                'analysis': {
                    'analyzer': {
                        'korean': {
                            'type': 'custom',
                            'tokenizer': 'nori_tokenizer',
                            'filter': ['lowercase', 'nori_readingform'],
                        },
                    },
                },
            },
            'mappings': {
                'properties': {
                    'news_id': {'type': 'keyword'},
                    'title': {
                        'type': 'text',
                        'analyzer': 'korean',
                        'fields': {
                            'keyword': {'type': 'keyword', 'ignore_above': 256},
                        },
                    },
                    'body_text': {
                        'type': 'text',
                        'analyzer': 'korean',
                    },
                    'category': {'type': 'keyword'},
                    'published_at': {'type': 'date'},
                    'mbti_group': {'type': 'keyword'},
                    'embedding_vector': {
                        'type': 'knn_vector',
                        'dimension': self.dimension,
                        'method': {
                            'name': 'hnsw',
                            'space_type': 'cosinesimil',
                            'engine': 'nmslib',
                            'parameters': {
                                'ef_construction': 256,
                                'm': 48,
                            },
                        },
                    },
                },
            },
        }

        try:
            self._client.indices.create(index=self.index_name, body=body)
            logger.info(f"Created index '{self.index_name}'")
            return True
        except Exception as e:
            logger.error(f"Failed to create index '{self.index_name}': {e}", exc_info=True)
            return False

    def delete_article_index(self) -> bool:
        """Delete the article index. Use with caution."""
        if not self._enabled:
            return False
        try:
            self._client.indices.delete(index=self.index_name)
            logger.info(f"Deleted index '{self.index_name}'")
            return True
        except Exception as e:
            logger.error(f"Failed to delete index: {e}")
            return False

    # =========================================================================
    # Document Operations
    # =========================================================================

    def index_article(
        self,
        article: Dict[str, Any],
        embedding: List[float],
        mbti_group: str = '',
    ) -> bool:
        """
        Index an article with its vector embedding.

        Args:
            article: Dict with news_id, title (or title_ko), content (or content_ko),
                     category, published_at
            embedding: 1024-dim vector from EmbeddingClient
            mbti_group: MBTI group this text belongs to (empty = original)

        Returns:
            True if indexed successfully
        """
        if not self._enabled:
            return False

        news_id = article.get('news_id', '')
        doc_id = f"{news_id}_{mbti_group}" if mbti_group else news_id

        doc = {
            'news_id': news_id,
            'title': article.get('title') or article.get('title_ko', ''),
            'body_text': article.get('content') or article.get('content_ko', ''),
            'category': article.get('category', ''),
            'published_at': article.get('published_at', ''),
            'mbti_group': mbti_group,
            'embedding_vector': embedding,
        }

        try:
            self._client.index(
                index=self.index_name,
                id=doc_id,
                body=doc,
                refresh='false',
            )
            logger.debug(f"Indexed article {doc_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to index article {doc_id}: {e}", exc_info=True)
            return False

    def bulk_index_articles(
        self,
        articles: List[Dict[str, Any]],
        embeddings: List[List[float]],
        mbti_groups: Optional[List[str]] = None,
    ) -> int:
        """
        Bulk index multiple articles.

        Args:
            articles: List of article dicts
            embeddings: Matching list of embedding vectors
            mbti_groups: Optional matching list of MBTI groups

        Returns:
            Number of successfully indexed documents
        """
        if not self._enabled or not articles:
            return 0

        if mbti_groups is None:
            mbti_groups = [''] * len(articles)

        actions = []
        for article, embedding, group in zip(articles, embeddings, mbti_groups):
            news_id = article.get('news_id', '')
            doc_id = f"{news_id}_{group}" if group else news_id

            actions.append({'index': {'_index': self.index_name, '_id': doc_id}})
            actions.append({
                'news_id': news_id,
                'title': article.get('title') or article.get('title_ko', ''),
                'body_text': article.get('content') or article.get('content_ko', ''),
                'category': article.get('category', ''),
                'published_at': article.get('published_at', ''),
                'mbti_group': group,
                'embedding_vector': embedding,
            })

        try:
            body = '\n'.join(json.dumps(a, ensure_ascii=False) for a in actions) + '\n'
            response = self._client.bulk(body=body)

            errors = response.get('errors', False)
            items = response.get('items', [])
            success_count = sum(
                1 for item in items
                if item.get('index', {}).get('status', 500) < 300
            )

            if errors:
                failed = [
                    item for item in items
                    if item.get('index', {}).get('status', 500) >= 300
                ]
                logger.warning(f"Bulk index: {success_count} ok, {len(failed)} failed")

            return success_count

        except Exception as e:
            logger.error(f"Bulk index failed: {e}", exc_info=True)
            return 0

    def delete_article(self, news_id: str, mbti_group: str = '') -> bool:
        """Delete a single article document."""
        if not self._enabled:
            return False
        doc_id = f"{news_id}_{mbti_group}" if mbti_group else news_id
        try:
            self._client.delete(index=self.index_name, id=doc_id, ignore=[404])
            return True
        except Exception as e:
            logger.error(f"Failed to delete {doc_id}: {e}")
            return False

    # =========================================================================
    # Search
    # =========================================================================

    def search_by_text(
        self,
        query: str,
        filters: Optional[Dict[str, Any]] = None,
        size: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Full-text BM25 search using the Korean (nori) analyzer.

        Args:
            query: Search query in Korean
            filters: Optional filters:
                - category (str): exact match
                - published_from (str): ISO date, >= filter
                - published_until (str): ISO date, <= filter
                - mbti_group (str): exact match
            size: Max results

        Returns:
            List of hits with _score, each containing news_id, title, etc.
        """
        must = [
            {
                'multi_match': {
                    'query': query,
                    'fields': ['title^3', 'body_text'],
                    'type': 'best_fields',
                },
            },
        ]

        filter_clauses = _build_filters(filters)

        body = {
            'size': size,
            'query': {
                'bool': {
                    'must': must,
                    'filter': filter_clauses,
                },
            },
            '_source': {
                'excludes': ['embedding_vector'],
            },
        }

        return self._execute_search(body)

    def search_by_vector(
        self,
        embedding: List[float],
        k: int = 10,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Approximate kNN vector search.

        Args:
            embedding: 1024-dim query vector
            k: Number of nearest neighbors
            filters: Optional category/date/mbti_group filters

        Returns:
            List of hits sorted by cosine similarity
        """
        filter_clauses = _build_filters(filters)

        body: Dict[str, Any] = {
            'size': k,
            'query': {
                'knn': {
                    'embedding_vector': {
                        'vector': embedding,
                        'k': k,
                    },
                },
            },
            '_source': {
                'excludes': ['embedding_vector'],
            },
        }

        # Apply post-filter (kNN doesn't support pre-filter in nmslib)
        if filter_clauses:
            body['post_filter'] = {'bool': {'filter': filter_clauses}}

        return self._execute_search(body)

    def hybrid_search(
        self,
        query: str,
        embedding: List[float],
        filters: Optional[Dict[str, Any]] = None,
        size: int = 10,
        text_weight: float = 0.3,
        vector_weight: float = 0.7,
    ) -> List[Dict[str, Any]]:
        """
        Combined text + vector search with weighted score normalization.

        Runs both searches, normalizes scores to [0, 1], applies weights,
        and returns merged results sorted by combined score.

        Args:
            query: Text search query
            embedding: Query vector
            filters: Optional filters
            size: Max results
            text_weight: Weight for BM25 score (default 0.3)
            vector_weight: Weight for kNN score (default 0.7)

        Returns:
            List of hits with combined_score, sorted descending
        """
        # Fetch more candidates from each leg to ensure good merge quality
        fetch_size = size * 2

        text_hits = self.search_by_text(query, filters=filters, size=fetch_size)
        vector_hits = self.search_by_vector(embedding, k=fetch_size, filters=filters)

        # Normalize and merge
        text_scores = {h['news_id']: h['_score'] for h in text_hits}
        vector_scores = {h['news_id']: h['_score'] for h in vector_hits}

        text_max = max(text_scores.values()) if text_scores else 1.0
        vector_max = max(vector_scores.values()) if vector_scores else 1.0

        # Collect all unique documents
        all_docs: Dict[str, Dict[str, Any]] = {}
        for h in text_hits + vector_hits:
            nid = h['news_id']
            if nid not in all_docs:
                all_docs[nid] = h

        # Compute combined scores
        results = []
        for nid, doc in all_docs.items():
            t_score = text_scores.get(nid, 0.0) / text_max if text_max else 0.0
            v_score = vector_scores.get(nid, 0.0) / vector_max if vector_max else 0.0
            combined = (t_score * text_weight) + (v_score * vector_weight)

            result = dict(doc)
            result['_score'] = round(combined, 4)
            result['_text_score'] = round(t_score, 4)
            result['_vector_score'] = round(v_score, 4)
            results.append(result)

        results.sort(key=lambda x: x['_score'], reverse=True)
        return results[:size]

    # =========================================================================
    # Internal
    # =========================================================================

    def search_similar(
        self,
        embedding: List[float],
        k: int = 10,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Alias for search_by_vector."""
        return self.search_by_vector(embedding, k=k, filters=filters)

    def _execute_search(self, body: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute a search query and return normalized hits."""
        if not self._enabled:
            return []
        try:
            response = self._client.search(index=self.index_name, body=body)

            hits = []
            for hit in response.get('hits', {}).get('hits', []):
                doc = hit.get('_source', {})
                doc['_score'] = hit.get('_score', 0.0)
                doc['_id'] = hit.get('_id', '')
                hits.append(doc)

            return hits

        except Exception as e:
            logger.error(f"OpenSearch query failed: {e}", exc_info=True)
            return []


def _build_filters(filters: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build OpenSearch filter clauses from a filters dict."""
    if not filters:
        return []

    clauses = []

    if filters.get('category'):
        clauses.append({'term': {'category': filters['category']}})

    if filters.get('mbti_group'):
        clauses.append({'term': {'mbti_group': filters['mbti_group']}})

    date_range: Dict[str, str] = {}
    if filters.get('published_from'):
        date_range['gte'] = filters['published_from']
    if filters.get('published_until'):
        date_range['lte'] = filters['published_until']
    if date_range:
        clauses.append({'range': {'published_at': date_range}})

    return clauses
