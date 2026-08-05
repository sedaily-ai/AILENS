"""
S3 Article Body Client
Stores and retrieves article body content (original + MBTI versions) as JSON in S3.

This separates large text data from DynamoDB, which stores only metadata + S3 URI pointer.
Follows the Article Database architecture: DynamoDB (Article Pointer) + S3 (MBTI 기사 DB).

Key pattern: {prefix}/{news_id}/body.json
S3 URI format: s3://{bucket}/{prefix}/{news_id}/body.json

Body JSON contains:
  - content_ko: Original Korean article text
  - content_raw: Raw HTML content
  - content_blocks: Structured content blocks (text + image positions)
  - version_NT: NT strategic analyst version
  - version_NF: NF value interpreter version
  - version_ST: ST practical editor version
  - version_SF: SF empathy communicator version
"""
import json
import logging
from typing import Optional, Dict, Any

import boto3
from botocore.exceptions import ClientError

from config.constants import S3_ARTICLE_BODY_BUCKET_DEV, S3_ARTICLE_BODY_PREFIX, S3_BODY_FIELDS

logger = logging.getLogger(__name__)


class S3ArticleClient:
    """
    Client for storing/retrieving article body content in S3.

    Separates large text fields (body, MBTI versions) from DynamoDB metadata,
    reducing DynamoDB item size and cost while keeping fast metadata lookups.
    """

    def __init__(
        self,
        bucket_name: str = S3_ARTICLE_BODY_BUCKET_DEV,
        prefix: str = S3_ARTICLE_BODY_PREFIX,
        region: str = "us-east-1",
    ):
        self.bucket_name = bucket_name
        self.prefix = prefix
        self.s3 = boto3.client('s3', region_name=region)

    def _build_key(self, news_id: str) -> str:
        """Build S3 object key for an article body."""
        return f"{self.prefix}/{news_id}/body.json"

    def _build_uri(self, news_id: str) -> str:
        """Build full S3 URI for an article body."""
        return f"s3://{self.bucket_name}/{self._build_key(news_id)}"

    def put_body(self, news_id: str, body_data: Dict[str, Any]) -> str:
        """
        Store article body content in S3.

        Args:
            news_id: Article ID
            body_data: Dict containing body fields (content_ko, content_raw,
                       content_blocks, version_NT/NF/ST/SF)

        Returns:
            S3 URI string (s3://bucket/prefix/news_id/body.json)

        Raises:
            Exception: If S3 put fails after logging
        """
        key = self._build_key(news_id)

        try:
            self.s3.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=json.dumps(body_data, ensure_ascii=False, default=str),
                ContentType='application/json',
            )

            uri = self._build_uri(news_id)
            logger.info(f"Stored article body: {uri}")
            return uri

        except Exception as e:
            logger.error(f"Failed to store article body for {news_id}: {e}", exc_info=True)
            raise

    def get_body(self, news_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve article body content from S3.

        Args:
            news_id: Article ID

        Returns:
            Dict containing body fields, or None if not found
        """
        key = self._build_key(news_id)

        try:
            response = self.s3.get_object(Bucket=self.bucket_name, Key=key)
            content = response['Body'].read().decode('utf-8')
            return json.loads(content)

        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                logger.warning(f"Article body not found in S3: {key}")
                return None
            logger.error(f"Failed to get article body for {news_id}: {e}", exc_info=True)
            return None

        except Exception as e:
            logger.error(f"Failed to get article body for {news_id}: {e}", exc_info=True)
            return None

    def delete_body(self, news_id: str) -> bool:
        """
        Delete article body content from S3.

        Args:
            news_id: Article ID

        Returns:
            True if deleted successfully, False otherwise
        """
        key = self._build_key(news_id)

        try:
            self.s3.delete_object(Bucket=self.bucket_name, Key=key)
            logger.info(f"Deleted article body: {key}")
            return True

        except Exception as e:
            logger.error(f"Failed to delete article body for {news_id}: {e}", exc_info=True)
            return False

    @staticmethod
    def extract_body_fields(article: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract body fields from a full article dict.

        Used during save to split an article into metadata (DynamoDB) and body (S3).

        Args:
            article: Full article dict

        Returns:
            Dict containing only the body fields
        """
        return {field: article.get(field) for field in S3_BODY_FIELDS if article.get(field) is not None}

    @staticmethod
    def strip_body_fields(article: Dict[str, Any]) -> Dict[str, Any]:
        """
        Return a copy of article dict with body fields removed.

        Used during save to produce the metadata-only dict for DynamoDB.

        Args:
            article: Full article dict

        Returns:
            New dict with body fields removed
        """
        return {k: v for k, v in article.items() if k not in S3_BODY_FIELDS}
