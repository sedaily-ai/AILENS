"""S3 Article Body Client — AI LENS v2.

Writes per-file under ``articles/{news_id}/{filename}`` in the v2 bucket
(``sedaily-mbti-article-body-v2-dev``). Supports Core 1 Collector's
``original.json`` and Core 2 Transform's ``version_{NT,NF,ST,SF}.json``
fan-out without needing four separate keys baked into the client.

Differences from v1 ``clients.s3_article_client.S3ArticleClient``:

* v1 hardcodes the object key to ``articles/{news_id}/body.json`` — fine
  for the v1 merged layout but incompatible with v2's per-file split.
* v1 targets a different bucket (``sedaily-mbti-article-body-dev``); v2
  uses its own bucket to keep storage accounting and lifecycle rules
  cleanly separated during the parallel run.

Like ``PgVectorV2Client``, this falls back to **no-op mode** when
``S3_ARTICLE_BODY_V2_BUCKET`` is unset so local unit tests and
``--dry-run`` flows can exercise wiring without touching AWS.

Error policy
------------
``put_article_file`` raises the underlying boto3 error on failure —
callers (Core 1 ``_process_one``, Core 2 equivalent) wrap each article
in its own try/except so a single bad write never aborts the batch.
``get_article_file`` catches ``NoSuchKey`` and returns ``None`` (a
missing file is a normal outcome). ``delete_article_file`` logs and
returns ``False`` on failure so test cleanup never crashes the session.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


_DEFAULT_PREFIX = "articles"


class S3ArticleV2Client:
    """Client for the v2 article body bucket — per-file under
    ``articles/{news_id}/``.

    Single object per MBTI version (plus ``original.json`` from Core 1).
    No DynamoDB-style size tradeoff here: S3 charges per-object and per-
    byte, and we control read patterns explicitly in Core 3.
    """

    def __init__(
        self,
        bucket_name: Optional[str] = None,
        prefix: str = _DEFAULT_PREFIX,
        region: str = "us-east-1",
    ) -> None:
        self.bucket_name = (
            bucket_name
            if bucket_name is not None
            else os.getenv("S3_ARTICLE_BODY_V2_BUCKET", "")
        )
        self.prefix = prefix.rstrip("/")
        self.region = region
        self._enabled = bool(self.bucket_name)
        if not self._enabled:
            logger.warning(
                "S3_ARTICLE_BODY_V2_BUCKET is empty — "
                "S3ArticleV2Client running in no-op mode"
            )
            self._client = None
        else:
            self._client = boto3.client("s3", region_name=region)

    # ---- key helpers --------------------------------------------------------

    def _build_key(self, news_id: str, filename: str) -> str:
        """Join prefix + news_id + filename into an S3 object key."""
        return f"{self.prefix}/{news_id}/{filename}"

    def build_uri(self, news_id: str, filename: str) -> str:
        """Return ``s3://bucket/key`` for logs and metadata rows.

        Exposed for callers that want to record the URI in pgvector metadata
        without re-implementing the join. Safe to call in no-op mode — the
        bucket segment will be empty, which mirrors how metadata reads
        handle absent uploads.
        """
        return f"s3://{self.bucket_name}/{self._build_key(news_id, filename)}"

    # ---- operations ---------------------------------------------------------

    def put_article_file(
        self, news_id: str, filename: str, data: Dict[str, Any]
    ) -> str:
        """Upload one JSON document. Returns the ``s3://`` URI on success.

        The body is encoded with ``ensure_ascii=False`` so Korean content
        is stored as UTF-8 instead of ``\\uXXXX`` escapes — roughly 3×
        smaller for Korean articles. ``default=str`` covers datetime and
        other non-JSON types that the collector may pass through from
        ``S3XMLClient.article_to_dict``.

        No-op mode returns ``""`` without making an AWS call.
        """
        if not self._enabled:
            return ""
        key = self._build_key(news_id, filename)
        body = json.dumps(data, ensure_ascii=False, default=str)
        self._client.put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=body.encode("utf-8"),
            ContentType="application/json",
        )
        uri = f"s3://{self.bucket_name}/{key}"
        logger.info(f"Put {uri} ({len(body)} chars)")
        return uri

    def get_article_file(
        self, news_id: str, filename: str
    ) -> Optional[Dict[str, Any]]:
        """Read one JSON document. ``None`` on NoSuchKey or no-op mode.

        Other boto3 errors propagate so callers can distinguish "file
        absent" from "S3 unreachable". Tests that want to verify
        delete-after-write round-trips rely on this NoSuchKey → ``None``
        behaviour.
        """
        if not self._enabled:
            return None
        key = self._build_key(news_id, filename)
        try:
            resp = self._client.get_object(Bucket=self.bucket_name, Key=key)
            return json.loads(resp["Body"].read().decode("utf-8"))
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "NoSuchKey":
                return None
            logger.error(f"get_article_file({key}) failed: {exc}", exc_info=True)
            raise

    def delete_article_file(self, news_id: str, filename: str) -> bool:
        """Delete one file. ``True`` on success, ``False`` on any failure.

        Used primarily by test cleanup fixtures. Errors are logged at
        ``WARNING`` and swallowed — a cleanup glitch should never
        surface as a test failure, and the next run's prefix wipe will
        catch any residue.
        """
        if not self._enabled:
            return False
        key = self._build_key(news_id, filename)
        try:
            self._client.delete_object(Bucket=self.bucket_name, Key=key)
            return True
        except Exception as exc:
            logger.warning(f"delete_article_file({key}) failed: {exc}")
            return False
