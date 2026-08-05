"""
API clients for MBTI transformation services
"""
from .mbti_transform_service import MbtiTransformService
from .s3_article_client import S3ArticleClient
from .personal_db_client import PersonalDBClient
from .embedding_client import EmbeddingClient

# OpenSearchClient and PgVectorClient are imported lazily by the handlers
# that need them (_init_opensearch / _init_pgvector) to avoid pulling in
# opensearch-py + pg8000 at module load time. This keeps the Lambda zip
# small enough for direct upload when S3 is unreachable.

__all__ = [
    "MbtiTransformService",
    "S3ArticleClient",
    "PersonalDBClient",
    "EmbeddingClient",
]
