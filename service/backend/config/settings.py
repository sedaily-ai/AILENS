"""
Enhanced Settings class for centralized configuration management.
Replaces scattered os.getenv() calls throughout the codebase.
"""

import os
from dataclasses import dataclass, field
from typing import Optional
from functools import lru_cache

from .constants import (
    AWS_REGION_DEFAULT,
    AWS_REGION_S3,
    DYNAMODB_TABLE_ARTICLES_DEV,
    DYNAMODB_TABLE_PERSONAL_DEV,
    DYNAMODB_TABLE_PODCAST_DEV,
    S3_ARTICLE_BODY_BUCKET_DEV,
    S3_AUDIO_BUCKET_DEV,
    OPENSEARCH_INDEX_DEFAULT,
    BEDROCK_MODEL_ID_DEFAULT,
    BEDROCK_MODEL_ID_OPUS,
    BEDROCK_MODEL_ID_NOVA_LITE,
    BEDROCK_EMBEDDING_MODEL_ID,
    BIGKINDS_API_URL_DEFAULT,
    FRONTEND_URL_DEFAULT,
    CACHE_TTL_DEFAULT,
)


@dataclass
class Settings:
    """Application settings loaded from environment variables."""

    # BigKinds API
    bigkinds_api_key: str = ''
    bigkinds_api_url: str = BIGKINDS_API_URL_DEFAULT

    # Anthropic API (legacy direct API — prefer Bedrock)
    anthropic_api_key: str = ''
    anthropic_model_id: str = BEDROCK_MODEL_ID_DEFAULT

    # ── AWS General ──────────────────────────────────────────────────────────

    region: str = AWS_REGION_DEFAULT
    s3_region: str = AWS_REGION_S3
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None

    # ── DynamoDB Tables ──────────────────────────────────────────────────────

    dynamodb_table_articles: str = DYNAMODB_TABLE_ARTICLES_DEV
    dynamodb_table_personal: str = DYNAMODB_TABLE_PERSONAL_DEV
    dynamodb_table_podcast: str = DYNAMODB_TABLE_PODCAST_DEV

    # ── S3 Buckets ───────────────────────────────────────────────────────────

    s3_article_body_bucket: str = S3_ARTICLE_BODY_BUCKET_DEV
    s3_article_body_region: str = AWS_REGION_DEFAULT
    s3_audio_bucket: str = S3_AUDIO_BUCKET_DEV

    # ── AI Models (Bedrock) ──────────────────────────────────────────────────

    claude_model_id: str = BEDROCK_MODEL_ID_OPUS
    nova_model_id: str = BEDROCK_MODEL_ID_NOVA_LITE
    embedding_model_id: str = BEDROCK_EMBEDDING_MODEL_ID

    # ── OpenSearch ───────────────────────────────────────────────────────────

    opensearch_endpoint: str = ''
    opensearch_index: str = OPENSEARCH_INDEX_DEFAULT

    # ── PostgreSQL (pgvector) ────────────────────────────────────────────────

    pg_host: str = ''
    pg_port: int = 5432
    pg_database: str = 'ailens'
    pg_user: str = 'ailens'
    pg_password: str = ''

    # ── Redis Cache ──────────────────────────────────────────────────────────

    redis_host: str = 'localhost'
    redis_port: int = 6379
    redis_password: Optional[str] = None
    redis_db: int = 0
    cache_ttl: int = CACHE_TTL_DEFAULT

    # ── API Server ───────────────────────────────────────────────────────────

    api_host: str = '0.0.0.0'
    api_port: int = 8000
    log_level: str = 'INFO'

    # ── Frontend ─────────────────────────────────────────────────────────────

    frontend_url: str = FRONTEND_URL_DEFAULT
    revalidate_secret: Optional[str] = None

    # ── Cognito (JWT verification) ──────────────────────────────────────────
    # Defaults match the production pool (see frontend-next/src/shared/config/auth.ts).
    # Override via env when standing up dev/staging pools.
    cognito_region: str = 'us-east-1'
    cognito_user_pool_id: str = 'us-east-1_ZS8PgF3iX'
    cognito_app_client_id: str = '66c9bq3ovmk007d0eepkle92k3'

    # ── Google Analytics ─────────────────────────────────────────────────────

    ga4_property_id: Optional[str] = None
    search_console_site_url: Optional[str] = None
    adsense_account_id: Optional[str] = None
    google_credentials_json: Optional[str] = None

    @classmethod
    def from_env(cls) -> 'Settings':
        """Create Settings instance from environment variables."""
        return cls(
            # BigKinds
            bigkinds_api_key=os.getenv('BIGKINDS_API_KEY', ''),
            bigkinds_api_url=os.getenv('BIGKINDS_API_URL', BIGKINDS_API_URL_DEFAULT),

            # Anthropic (legacy)
            anthropic_api_key=os.getenv('ANTHROPIC_API_KEY', ''),
            anthropic_model_id=os.getenv('ANTHROPIC_MODEL_ID', BEDROCK_MODEL_ID_DEFAULT),

            # AWS General
            region=os.getenv('AWS_REGION', os.getenv('REGION', AWS_REGION_DEFAULT)),
            s3_region=os.getenv('S3_REGION', AWS_REGION_S3),
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),

            # DynamoDB Tables
            dynamodb_table_articles=os.getenv('DYNAMODB_TABLE_ARTICLES', DYNAMODB_TABLE_ARTICLES_DEV),
            dynamodb_table_personal=os.getenv('DYNAMODB_TABLE_PERSONAL', DYNAMODB_TABLE_PERSONAL_DEV),
            dynamodb_table_podcast=os.getenv('DYNAMODB_TABLE_PODCAST', DYNAMODB_TABLE_PODCAST_DEV),

            # S3 Buckets
            s3_article_body_bucket=os.getenv('S3_ARTICLE_BODY_BUCKET', S3_ARTICLE_BODY_BUCKET_DEV),
            s3_article_body_region=os.getenv('S3_ARTICLE_BODY_REGION', AWS_REGION_DEFAULT),
            s3_audio_bucket=os.getenv('S3_AUDIO_BUCKET', S3_AUDIO_BUCKET_DEV),

            # AI Models
            claude_model_id=os.getenv('CLAUDE_MODEL_ID', BEDROCK_MODEL_ID_OPUS),
            nova_model_id=os.getenv('NOVA_MODEL_ID', BEDROCK_MODEL_ID_NOVA_LITE),
            embedding_model_id=os.getenv('EMBEDDING_MODEL_ID', BEDROCK_EMBEDDING_MODEL_ID),

            # OpenSearch
            opensearch_endpoint=os.getenv('OPENSEARCH_ENDPOINT', ''),
            opensearch_index=os.getenv('OPENSEARCH_INDEX', OPENSEARCH_INDEX_DEFAULT),

            # PostgreSQL (pgvector)
            pg_host=os.getenv('PG_HOST', ''),
            pg_port=int(os.getenv('PG_PORT', '5432')),
            pg_database=os.getenv('PG_DATABASE', 'ailens'),
            pg_user=os.getenv('PG_USER', 'ailens'),
            pg_password=os.getenv('PG_PASSWORD', ''),

            # Redis
            redis_host=os.getenv('REDIS_HOST', 'localhost'),
            redis_port=int(os.getenv('REDIS_PORT', '6379')),
            redis_password=os.getenv('REDIS_PASSWORD'),
            redis_db=int(os.getenv('REDIS_DB', '0')),
            cache_ttl=int(os.getenv('CACHE_TTL', str(CACHE_TTL_DEFAULT))),

            # API
            api_host=os.getenv('API_HOST', '0.0.0.0'),
            api_port=int(os.getenv('API_PORT', '8000')),
            log_level=os.getenv('LOG_LEVEL', 'INFO'),

            # Frontend
            frontend_url=os.getenv('FRONTEND_URL', FRONTEND_URL_DEFAULT),
            revalidate_secret=os.getenv('REVALIDATE_SECRET'),

            # Cognito
            cognito_region=os.getenv('COGNITO_REGION', 'us-east-1'),
            cognito_user_pool_id=os.getenv('COGNITO_USER_POOL_ID', 'us-east-1_ZS8PgF3iX'),
            cognito_app_client_id=os.getenv('COGNITO_APP_CLIENT_ID', '66c9bq3ovmk007d0eepkle92k3'),

            # Google Analytics
            ga4_property_id=os.getenv('GA4_PROPERTY_ID'),
            search_console_site_url=os.getenv('SEARCH_CONSOLE_SITE_URL'),
            adsense_account_id=os.getenv('ADSENSE_ACCOUNT_ID'),
            google_credentials_json=os.getenv('GOOGLE_CREDENTIALS_JSON'),
        )

    def is_production(self) -> bool:
        """Check if running in production environment."""
        return 'prod' in self.dynamodb_table_articles.lower()

    def get_dynamodb_table(self) -> str:
        """Get DynamoDB table name."""
        return self.dynamodb_table_articles


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached Settings instance.
    Uses lru_cache to ensure settings are loaded only once.
    """
    return Settings.from_env()


# Global settings instance for backward compatibility
settings = get_settings()
