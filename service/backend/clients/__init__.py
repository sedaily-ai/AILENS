"""
API clients for MBTI transformation services
"""
from .mbti_transform_service import MbtiTransformService
from .s3_article_client import S3ArticleClient
from .personal_db_client import PersonalDBClient
from .embedding_client import EmbeddingClient
from .bigkinds_client import (
    BigKindsClient,
    BigKindsError,
    BigKindsAuthError,
    BigKindsNotConfiguredError,
    BigKindsArticle,
    BigKindsSearchResult,
    BigKindsTrend,
    BigKindsTopic,
    standard_to_bigkinds_categories,
)

# OpenSearchClient and PgVectorClient are imported lazily by the handlers
# that need them (_init_opensearch / _init_pgvector) to avoid pulling in
# opensearch-py + pg8000 at module load time. This keeps the Lambda zip
# small enough for direct upload when S3 is unreachable.

__all__ = [
    "MbtiTransformService",
    "S3ArticleClient",
    "PersonalDBClient",
    "EmbeddingClient",
    "BigKindsClient",
    "BigKindsError",
    "BigKindsAuthError",
    "BigKindsNotConfiguredError",
    "BigKindsArticle",
    "BigKindsSearchResult",
    "BigKindsTrend",
    "BigKindsTopic",
    "standard_to_bigkinds_categories",
]
