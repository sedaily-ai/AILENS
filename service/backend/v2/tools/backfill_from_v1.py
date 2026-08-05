"""Backfill v1 → v2 — one-shot migration of already-transformed articles.

Scans v1 DynamoDB ``sedaily-mbti-articles-dev`` within a time window,
fetches the S3 body (which holds v1's Opus-transformed ``version_NT/NF/ST/SF``),
re-embeds with Titan V2, and writes the result into v2 pgvector + v2 S3 as
``status='transformed'``. Skips articles already present in v2 (dedup by
``news_id``) and articles missing any of the 4 MBTI versions (those must
be re-transformed fresh via Core 2, not backfilled).

Why re-embed instead of reusing v1 embeddings
---------------------------------------------
v1 stored Titan V2 1024-dim vectors in OpenSearch, not in DynamoDB.
Reading OpenSearch requires the (optional) v1 OpenSearch endpoint; re-
embedding from the v1 body text is simpler, deterministic, and matches
exactly what a fresh Core 1 + Core 2 run would produce. Titan V2 call
cost is negligible (~$0.00002 per article, dominated by S3+pg writes).

Execution environment
---------------------
This script MUST run from inside the v2 VPC so that pgvector
(``sedaily-mbti-pgvector-v2-dev``) is reachable — its security group
``sg-0cddc39619b1d69d9`` admits only the v2 Lambda SG. Options:

* CloudShell inside the v2 VPC subnets (easiest).
* EC2 bastion with SG membership.
* Temporary ``authorize-security-group-ingress`` from your office IP
  (revert after; out of scope for this script).

Env vars required
-----------------
* ``PG_V2_HOST``, ``PG_V2_PASSWORD`` (load from ``backend/.env.v2``)
* ``PG_V2_DATABASE`` (defaults ``ailens_v2``), ``PG_V2_USER`` (``ailens``),
  ``PG_V2_PORT`` (``5432``)
* ``S3_ARTICLE_BODY_V2_BUCKET`` (``sedaily-mbti-article-body-v2-dev``)
* ``BEDROCK_RUNTIME_ENDPOINT_URL`` optional — omit when running outside VPC
  (public Bedrock endpoint used then)
* Standard AWS credentials for v1 DynamoDB / v1 S3 read + v2 Bedrock / S3 write

Usage
-----
    cd backend
    export $(cat .env.v2 | xargs)
    python3 v2/tools/backfill_from_v1.py --dry-run            # plan only
    python3 v2/tools/backfill_from_v1.py --limit 10           # test small batch
    python3 v2/tools/backfill_from_v1.py                      # full backfill
    python3 v2/tools/backfill_from_v1.py --since-days 7       # past week only

Cost estimate
-------------
Per article: ~$0.00002 (Titan V2 re-embed of title+body) + S3 puts + pg
inserts. 30-day backfill at v1's historical rate (~30 articles/day
transformed = ~900 articles) ≈ $0.02 + negligible S3/pg. Far cheaper than
re-running Core 2 Opus.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterator, List, Optional

import boto3
from boto3.dynamodb.conditions import Attr


logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


EXPECTED_ACCOUNT = "887078546492"
V1_ARTICLES_TABLE = "sedaily-mbti-articles-dev"
V1_ARTICLE_BODY_BUCKET = "sedaily-mbti-article-body-dev"
MBTI_GROUPS = ("NT", "NF", "ST", "SF")


# ── AWS account verification ──────────────────────────────────────────────────


def verify_aws_account() -> None:
    sts = boto3.client("sts")
    identity = sts.get_caller_identity()
    if identity["Account"] != EXPECTED_ACCOUNT:
        print(
            f"ERROR: wrong AWS account ({identity['Account']}); "
            f"expected {EXPECTED_ACCOUNT}."
        )
        sys.exit(1)
    logger.info(f"AWS account OK: {identity['Account']} ({identity['Arn']})")


# ── v1 DynamoDB scan ──────────────────────────────────────────────────────────


def scan_v1_articles(
    since_days: int, limit: Optional[int] = None
) -> Iterator[Dict[str, Any]]:
    """Yield v1 article metadata rows with ``published_at`` within the window.

    Uses a paginated scan with FilterExpression on ``published_at``. Scan
    is O(N) on the whole table; for a one-shot backfill with a ~900-row
    expected match, this is fine. If the table grows to millions the
    GSI-per-category query pattern may be faster.

    ``limit`` caps the total returned across all pages (useful for --limit
    testing). None = no cap.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=since_days)).isoformat()
    logger.info(f"Scanning v1 DynamoDB for articles since {cutoff} (UTC)")

    dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
    table = dynamodb.Table(V1_ARTICLES_TABLE)

    filter_expr = Attr("published_at").gte(cutoff)
    count = 0
    scan_kwargs: Dict[str, Any] = {"FilterExpression": filter_expr}
    while True:
        resp = table.scan(**scan_kwargs)
        for item in resp.get("Items", []):
            # Skip settings/config sentinel rows and dedup markers.
            nid = item.get("news_id", "")
            if not nid or nid.startswith("__") or nid == "settings_config":
                continue
            yield item
            count += 1
            if limit is not None and count >= limit:
                logger.info(f"Reached --limit {limit} — stopping scan")
                return
        if "LastEvaluatedKey" not in resp:
            break
        scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    logger.info(f"Scan complete: {count} articles matched window")


# ── v1 body fetch ─────────────────────────────────────────────────────────────


def fetch_v1_body(news_id: str, metadata: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Fetch v1 body from S3 using ``s3_body_uri`` or default key pattern.

    Returns the merged dict containing both metadata-embedded version fields
    (legacy rows) and split-storage version fields from S3. ``None`` if the
    body is unavailable or malformed.
    """
    s3_body_uri = metadata.get("s3_body_uri")
    s3 = boto3.client("s3", region_name="us-east-1")

    if s3_body_uri and s3_body_uri.startswith("s3://"):
        # s3://bucket/key form
        rest = s3_body_uri[5:]
        bucket, _, key = rest.partition("/")
    else:
        # Legacy fallback — v1 default layout.
        bucket = V1_ARTICLE_BODY_BUCKET
        key = f"articles/{news_id}/body.json"

    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        return json.loads(obj["Body"].read().decode("utf-8"))
    except Exception as exc:
        logger.warning(f"fetch_v1_body({news_id}): {type(exc).__name__}: {exc}")
        return None


def extract_versions(body: Dict[str, Any]) -> Optional[Dict[str, Dict[str, Any]]]:
    """Extract 4 MBTI version dicts from v1 body JSON. ``None`` if any missing."""
    versions: Dict[str, Dict[str, Any]] = {}
    for group in MBTI_GROUPS:
        v = body.get(f"version_{group}")
        if not v or not isinstance(v, dict):
            return None
        if not v.get("title") or not v.get("body"):
            return None
        versions[group] = v
    return versions


# ── v2 write ──────────────────────────────────────────────────────────────────


def backfill_one(
    article: Dict[str, Any],
    body: Dict[str, Any],
    versions: Dict[str, Dict[str, Any]],
    *,
    embedder: Any,
    pg: Any,
    s3_v2: Any,
    dry_run: bool,
) -> str:
    """Single-article backfill. Returns news_id on success.

    Writes (skipped in --dry-run mode):
      1. v2 S3 ``original.json``  (article metadata + original content)
      2. v2 S3 ``version_{group}.json`` × 4
      3. v2 pg ``articles`` row with Titan V2 embedding, status='transformed'
      4. v2 pg ``article_versions`` row × 4 with per-version Titan V2 embeddings
    """
    news_id = article["news_id"]
    title = article.get("title_ko") or body.get("title_ko") or ""
    content_ko = body.get("content_ko") or body.get("content_clean") or ""
    embed_text = f"{title}\n\n{content_ko[:6000]}"

    if dry_run:
        logger.info(f"[DRY-RUN] would backfill {news_id} ({len(content_ko)} chars)")
        return news_id

    # Original embedding (for articles.embedding column).
    orig_vec = embedder.embed_text(embed_text)

    # Write original.json mirroring Core 1 layout.
    original_json = {
        "news_id": news_id,
        "nsid": news_id,
        "title_ko": title,
        "sub_title_ko": article.get("sub_title_ko") or body.get("sub_title_ko") or "",
        "content_ko": content_ko,
        "content_raw": body.get("content_raw") or "",
        "category": article.get("category") or body.get("category") or "",
        "published_at": article.get("published_at") or body.get("published_at") or "",
        "press": article.get("press") or "서울경제",
        "url": article.get("url") or body.get("url") or "",
        "images": article.get("images") or body.get("images") or [],
    }
    s3_v2.put_article_file(news_id, "original.json", original_json)

    # Insert articles row first with status='raw', then promote after versions.
    # This mirrors the Core 1 → Core 2 transition and keeps the schema CHECK
    # constraint satisfied if the script aborts mid-row.
    article_metadata = {
        "title": title,
        "category": original_json["category"],
        "published_at": original_json["published_at"],
        "url": original_json["url"],
        "press": original_json["press"],
        "backfilled_from_v1": True,
        "backfilled_at": datetime.now(timezone.utc).isoformat(),
    }
    pg.insert_article(news_id, article_metadata, orig_vec)

    # Per-version embed + S3 + pg insert.
    for group in MBTI_GROUPS:
        v = versions[group]
        body_text = f"{v.get('title','')}\n\n{v.get('body','')}"
        vec = embedder.embed_text(body_text)
        s3_v2.put_article_file(news_id, f"version_{group}.json", v)
        version_metadata = {
            "title": v.get("title", ""),
            "body": v.get("body", ""),
            "subtitle": v.get("subtitle", ""),
            "key_points": v.get("key_points", []),
            "closing_line": v.get("closing_line", ""),
        }
        pg.insert_article_version(news_id, group, version_metadata, vec)

    pg.update_article_status(news_id, "transformed")
    return news_id


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Backfill v1 → v2 transformed articles (one-shot)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="plan only — no Bedrock / S3 / pg writes",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="cap on articles processed (default: all in window)",
    )
    parser.add_argument(
        "--since-days",
        type=int,
        default=30,
        help="time window in days (default: 30)",
    )
    parser.add_argument(
        "--skip-confirm",
        action="store_true",
        help="bypass interactive confirmation prompt",
    )
    args = parser.parse_args()

    print("=== backfill_from_v1.py ===")
    print(f"Window:  last {args.since_days} days")
    print(f"Limit:   {args.limit or 'unlimited'}")
    print(f"Mode:    {'DRY-RUN' if args.dry_run else 'APPLY'}")
    print()

    verify_aws_account()

    if not args.dry_run and not args.skip_confirm:
        response = input("Proceed with real writes? [y/N]: ").strip().lower()
        if response != "y":
            print("Aborted.")
            return 1

    # Lazy imports so --help + --dry-run paths don't require pg8000 / VPC creds.
    from v2.clients.embedding_v2_client import EmbeddingV2Client
    from v2.clients.pgvector_v2_client import PgVectorV2Client
    from v2.clients.s3_article_v2_client import S3ArticleV2Client

    endpoint_url = os.getenv("BEDROCK_RUNTIME_ENDPOINT_URL") or None
    embedder = EmbeddingV2Client(endpoint_url=endpoint_url)
    s3_v2 = S3ArticleV2Client()
    pg = PgVectorV2Client()

    try:
        # Progress bar — tqdm is optional.
        try:
            from tqdm import tqdm  # type: ignore
        except ImportError:
            tqdm = lambda x, **kw: x  # noqa: E731 — inert passthrough

        completed: List[str] = []
        skipped_duplicate: List[str] = []
        skipped_missing_versions: List[str] = []
        failed: List[Dict[str, str]] = []

        # Single scan up front so tqdm has a known total.
        articles_to_process = list(
            scan_v1_articles(since_days=args.since_days, limit=args.limit)
        )
        logger.info(f"Processing {len(articles_to_process)} candidate articles")

        # Dedup candidates against v2 in one batch query (cheaper than per-row).
        candidate_ids = [a["news_id"] for a in articles_to_process]
        existing_in_v2 = (
            pg.filter_existing_news_ids(candidate_ids) if not args.dry_run else set()
        )
        logger.info(f"{len(existing_in_v2)} already in v2 — will skip")

        for article in tqdm(articles_to_process, desc="backfill"):
            news_id = article["news_id"]
            if news_id in existing_in_v2:
                skipped_duplicate.append(news_id)
                continue
            body = fetch_v1_body(news_id, article)
            if not body:
                failed.append({"news_id": news_id, "reason": "body fetch failed"})
                continue
            versions = extract_versions(body)
            if not versions:
                skipped_missing_versions.append(news_id)
                continue
            try:
                backfill_one(
                    article,
                    body,
                    versions,
                    embedder=embedder,
                    pg=pg,
                    s3_v2=s3_v2,
                    dry_run=args.dry_run,
                )
                completed.append(news_id)
            except Exception as exc:
                failed.append(
                    {
                        "news_id": news_id,
                        "reason": f"{type(exc).__name__}: {exc}",
                    }
                )
                logger.warning(f"backfill {news_id} failed: {exc}")

        print()
        print("=== Report ===")
        print(f"  candidates         : {len(articles_to_process)}")
        print(f"  duplicates (skip)  : {len(skipped_duplicate)}")
        print(f"  missing versions   : {len(skipped_missing_versions)}")
        print(f"  completed          : {len(completed)}")
        print(f"  failed             : {len(failed)}")
        if failed:
            print()
            print("  Failure details (first 20):")
            for f in failed[:20]:
                print(f"    - {f['news_id']}: {f['reason']}")
        return 0 if not failed else 2
    finally:
        pg.close()


if __name__ == "__main__":
    sys.exit(main())
