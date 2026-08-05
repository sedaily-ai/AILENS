"""S3 Article Body Client — front-page(지면 1면) 본문 조회 전용.

2026-08-05: 원래 Core 1 Collector의 ``original.json`` 쓰기와 Core 2 Transform의
``version_{NT,NF,ST,SF}.json`` 팬아웃까지 지원하던 클라이언트였다. 두 파이프라인이
전부 폐기되며 쓰기 메서드(``put_article_file``/``delete_article_file``/``build_uri``)를
삭제했다 — 남은 건 ``handlers/front_page.py``가 쓰는 읽기 전용 ``get_article_file``뿐.

Reads per-file under ``articles/{news_id}/{filename}`` in the v2 bucket
(``sedaily-mbti-article-body-v2-dev``) — a different bucket from v1's
``clients.s3_article_client.S3ArticleClient`` (``sedaily-mbti-article-body-dev``,
merged single-key layout).

Like ``PgVectorV2Client``, this falls back to **no-op mode** when
``S3_ARTICLE_BODY_V2_BUCKET`` is unset so local unit tests and
``--dry-run`` flows can exercise wiring without touching AWS.

Error policy
------------
``get_article_file`` catches ``NoSuchKey`` and returns ``None`` (a
missing file is a normal outcome); other boto3 errors propagate.
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

    # ---- operations ---------------------------------------------------------

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
