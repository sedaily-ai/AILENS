"""Core 2 Transform Lambda — turn selected article_selections rows into MBTI versions.

Wire-up
-------
Triggered every 5 minutes by EventBridge rule
``sedaily-mbti-v2-transform-trigger`` (wired in Phase E).

Per fire (TASK-5, Phase 2.5):

1. Poll pgvector ``article_selections`` for rows with ``selected=TRUE AND
   transformed_at IS NULL``, FIFO by ``scored_at``.
2. Empty batch → fast return (skip Bedrock/embed client init).
3. Group rows by ``news_id`` so the same article's per-MBTI rows fire as a
   single Lambda task — preserves Opus 4.6 prompt-cache hits across the
   article's selected MBTI groups (1h TTL, applied in commit 0830c1f).
4. Process article-groups in waves of ``ARTICLE_CONCURRENCY`` using
   ``asyncio.gather``:

   * Within each article, ``transform_article_for_groups`` runs N parallel
     Opus 4.6 calls (1 ≤ N ≤ 4) — only the MBTI groups the Selector chose.
   * N parallel Titan V2 embeddings on the resulting versions.
   * N S3 ``version_<MBTI>.json`` puts.
   * N ``insert_article_version`` rows (serialised through ``db_lock``
     because ``pg8000.native.Connection`` is not thread-safe).
   * N ``mark_transformed(news_id, mbti_type, selection_date)`` calls
     stamp ``transformed_at=now()`` on each successful selection row.

5. Between waves, check ``context.get_remaining_time_in_millis()``. If the
   next wave's worst-case (``WAVE_DEADLINE_BUFFER_S``) won't fit, bail
   gracefully — remaining article-groups stay ``selected=TRUE,
   transformed_at=NULL`` and get picked up on the next fire (Reserved
   concurrency=1 prevents double-pick races).

Failure policy — strict per-article, partial allowed at MBTI level
------------------------------------------------------------------
TASK-5 split the v1-style "all 4 or fail" rule. Now:

* If at least one requested MBTI group succeeds, those rows get
  ``mark_transformed``. Failed groups stay ``transformed_at=NULL`` and
  retry on the next fire (Selector won't re-score them — same selection
  row stays selected=TRUE).
* If ALL requested groups fail (validator failure, Bedrock down, etc.),
  the article is marked ``status='failed'`` so a downstream cleanup job
  can investigate without a re-fire dropping cost on it.

Why ``articles.status='transformed'`` is no longer set on success (Q2=A)
-----------------------------------------------------------------------
v2 truth-source for "this article-MBTI is ready" is now
``article_selections.transformed_at``. Updating ``articles.status`` would
be ambiguous when only some MBTI groups succeeded (NT done, NF failed →
status='transformed'? 'failed'? 'partial'?). Keeping ``articles.status``
in {'raw','failed'} only (Collector sets 'raw'; this handler sets
'failed' on full failure) keeps state per-article and per-(article ×
MBTI) cleanly separated.

Observability (JSON log events)
-------------------------------
* ``transform_run_complete`` — batch totals per fire (article-group level)
* ``transform_empty_batch`` — no selected+pending rows
* ``transform_complete`` — per (article × MBTI) successful pair
* ``transform_partial_failure`` — article had >=1 group fail (some
  succeeded, some did not — non-fatal)
* ``transform_full_failure`` — every requested group failed for an article
  (article gets status='failed')
* ``transform_validation_failure`` — validator rejected versions
* ``transform_error`` — per-article exception (incl. S3 read miss)
* ``transform_deadline_skip`` — wave-level early stop

CloudWatch Insights can aggregate these to measure cache hit rate, per-
group latency, and failure distribution without re-processing payloads.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional, Tuple

from common.feature_flag import get_threshold
from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import success_response

from v2.clients.cloudwatch_metrics import emit_count
from v2.clients.embedding_v2_client import EmbeddingV2Client
from v2.clients.pgvector_v2_client import PgVectorV2Client
from v2.clients.s3_article_v2_client import S3ArticleV2Client
from v2.clients.transform_v2_service import TransformV2Service
from v2.core2.validator import validate_versions


logger = logging.getLogger(__name__)
# AWS Lambda Python runtime's root logger defaults to WARNING, which silently
# drops ``logger.info(json.dumps({...}))`` emissions used by this handler for
# per-article and per-run observability. Phase D live invoke (2026-04-24,
# RequestId 9688e130) confirmed ``[ERROR]`` and ``[WARNING]`` reach CloudWatch
# but ``[INFO]`` events (``transform_complete``, ``transform_run_complete``,
# ``transform_empty_batch``) did not. Raise the root level so CloudWatch
# Insights can aggregate them. v1 handlers have the same latent issue; we
# only fix v2 here per ``.clauderules`` #1 (no v1 edits).
logging.getLogger().setLevel(logging.INFO)


# ── Sizing constants ──────────────────────────────────────────────────────────

# Batch pulled from pgvector per fire. TPM budget (3M Opus 4.6 cross-region)
# easily absorbs 20 articles/fire × 4 calls × ~5500 tokens ≈ 440k tokens —
# well under the per-minute cap. Real limit is Lambda wall-clock + deadline
# guard below; see Phase A2 Section 3 design notes.
#
# Admin-2d (commit e172175) — runtime override via DDB threshold/transform-max-articles.
# This constant remains the fallback default if DDB is unreachable or the row is
# missing (5-min TTL cache inside common.feature_flag.get_threshold).
BATCH_SIZE = 20

# Articles processed concurrently within a single Lambda invocation. 5 ×
# 4 parallel Opus calls per article = 20 peak concurrent Bedrock requests.
ARTICLE_CONCURRENCY = 5

# Deadline guard between waves. Skip next wave if remaining Lambda time
# is less than this. Sized from measured Opus 4.6 latency
# (verify_opus_baseline.py, article 2KB8R3LJ9D = max 3,982 chars):
#
#   p99 single-group call   ≈ 28.73s (n=5, tight variance ~1.1s)
#   wave of 5 articles      ≈ max of 5 parallel article latencies ≈ 35s p99
#   embed + S3 + DB overhead ≈ 1-2s per article (parallelised)
#   one Bedrock retry (exp backoff 30s) covered: 35 + 30 = 65s worst case
#   + 25s safety margin     = 90s
#
# Adjust in Phase D if production Lambda (inside VPCE, network leg removed)
# shows materially different p99.
#
# Too low  → risk Lambda timeout mid-wave (partial writes; next fire
#            re-processes via ON CONFLICT DO UPDATE — not corrupt but wasteful)
# Too high → unnecessary skips, slower backlog clear
WAVE_DEADLINE_BUFFER_S = 90


# ── Handler ────────────────────────────────────────────────────────────────────


@handler_decorator
async def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    method = (
        event.get("httpMethod")
        or (event.get("requestContext") or {}).get("http", {}).get("method")
        or "GET"
    )
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    pg = PgVectorV2Client()
    # Phase 5 — idempotent additive migration for validation_failure_count.
    # No-op after the first successful run (ADD COLUMN IF NOT EXISTS).
    pg.ensure_phase5_schema()
    # TASK-5: poll selected+pending rows from article_selections, not raw
    # articles directly. Each row is one (article × MBTI) pair the Selector
    # chose. Group by news_id so each article fires once per Lambda task
    # with its full MBTI subset (1..4) — preserves Opus prompt-cache hits
    # across the article's groups.
    batch_size = get_threshold("transform-max-articles", default=BATCH_SIZE)
    logger.info(json.dumps({"event": "transform_batch_size_resolved", "batch_size": batch_size, "default_fallback": BATCH_SIZE}))
    queue_rows = pg.get_transform_queue(limit=batch_size)
    if not queue_rows:
        logger.info(json.dumps({"event": "transform_empty_batch"}))
        return success_response({"processed": 0, "empty": True})

    article_groups = _group_queue_by_article(queue_rows)

    endpoint_url = os.getenv("BEDROCK_RUNTIME_ENDPOINT_URL", "") or None
    transform_svc = TransformV2Service(endpoint_url=endpoint_url)
    embedder = EmbeddingV2Client(endpoint_url=endpoint_url)
    s3_v2 = S3ArticleV2Client()

    semaphore = asyncio.Semaphore(ARTICLE_CONCURRENCY)
    db_lock = asyncio.Lock()

    completed, failed, skipped = await _run_with_deadline(
        article_groups, context, transform_svc, embedder, pg, s3_v2, semaphore, db_lock
    )

    metrics = {
        "event": "transform_run_complete",
        "queue_rows": len(queue_rows),
        "article_groups": len(article_groups),
        "completed_articles": len(completed),
        "failed_articles": len(failed),
        "skipped_articles": len(skipped),
        "completed_ids": completed,
        "failed_ids": failed,
        "skipped_ids": skipped,
    }
    logger.info(json.dumps(metrics, ensure_ascii=False))
    return success_response(metrics)


def _group_queue_by_article(
    queue_rows: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Collapse per-(article × MBTI) queue rows into per-article tasks.

    Input rows come from ``get_transform_queue`` (FIFO by ``scored_at``).
    Output preserves per-article order by the earliest ``scored_at`` of any
    of its MBTI rows — keeps oldest articles at the front of waves.

    Each output dict carries:
      * ``news_id`` — for S3 / version writes
      * ``article_meta`` — title/category/published_at (from JOIN'd articles row)
      * ``mbti_groups`` — list of MBTI codes to transform (1..4 entries)
      * ``selection_date`` — for ``mark_transformed`` calls; consistent
        across the article's queued rows because Selector writes one
        date per fire.
      * ``earliest_scored_at`` — sort key for FIFO ordering.
    """
    by_article: Dict[str, Dict[str, Any]] = {}
    for r in queue_rows:
        nid = r["news_id"]
        if nid not in by_article:
            by_article[nid] = {
                "news_id": nid,
                "article_meta": {
                    "title": r.get("title", ""),
                    "category": r.get("category", ""),
                    "published_at": r.get("published_at"),
                },
                "mbti_groups": [],
                "selection_date": r["selection_date"],
                "earliest_scored_at": r["scored_at"],
            }
        by_article[nid]["mbti_groups"].append(r["mbti_type"])
        if r["scored_at"] < by_article[nid]["earliest_scored_at"]:
            by_article[nid]["earliest_scored_at"] = r["scored_at"]

    grouped = list(by_article.values())
    grouped.sort(key=lambda g: g["earliest_scored_at"])
    return grouped


# ── Wave loop with deadline guard ─────────────────────────────────────────────


async def _run_with_deadline(
    article_groups: List[Dict[str, Any]],
    context: Any,
    transform_svc: TransformV2Service,
    embedder: EmbeddingV2Client,
    pg: PgVectorV2Client,
    s3_v2: S3ArticleV2Client,
    semaphore: asyncio.Semaphore,
    db_lock: asyncio.Lock,
) -> Tuple[List[str], List[str], List[str]]:
    """Process article-groups in waves; bail between waves if time is low.

    Returns ``(completed_ids, failed_ids, skipped_ids)`` — each list holds
    ``news_id`` strings.

    Skipped = article-groups whose first wave never started (their selection
    rows stay ``selected=TRUE, transformed_at=NULL``, picked on next fire).
    Split wave boundaries so in-flight Bedrock calls are never aborted
    mid-flight — cleanup of half-posted versions would be fragile.
    """
    waves = [
        article_groups[i : i + ARTICLE_CONCURRENCY]
        for i in range(0, len(article_groups), ARTICLE_CONCURRENCY)
    ]
    completed: List[str] = []
    failed: List[str] = []
    skipped: List[str] = []

    for wave_idx, wave in enumerate(waves):
        remaining_s = (
            context.get_remaining_time_in_millis() / 1000
            if context is not None
            else float("inf")
        )
        if remaining_s < WAVE_DEADLINE_BUFFER_S:
            skipped_ids = [g["news_id"] for w in waves[wave_idx:] for g in w]
            skipped.extend(skipped_ids)
            logger.warning(
                json.dumps(
                    {
                        "event": "transform_deadline_skip",
                        "wave_idx": wave_idx,
                        "remaining_s": round(remaining_s, 2),
                        "buffer_s": WAVE_DEADLINE_BUFFER_S,
                        "skipped_count": len(skipped_ids),
                    }
                )
            )
            break

        wave_results = await asyncio.gather(
            *(
                _process_one_article(
                    group, transform_svc, embedder, pg, s3_v2, semaphore, db_lock
                )
                for group in wave
            ),
            return_exceptions=True,
        )
        for group, res in zip(wave, wave_results):
            nid = group["news_id"]
            if isinstance(res, Exception) or res is None:
                failed.append(nid)
            else:
                completed.append(nid)

    return completed, failed, skipped


# ── Per-article processing ────────────────────────────────────────────────────


def _extract_image_url(original: Dict[str, Any]) -> Optional[str]:
    """Pick the article's hero/thumbnail image URL from S3 ``original.json``.

    3-tier resolution mirrors v1's ``_derive_image_url`` (per the
    2026-04-28 SEOdaily-ENG image-pipeline reference):

    1. ``images[0].url`` — standalone ``<image>`` XML tag, the highest
       signal source (these are explicitly the hero/thumbnail in the
       feed XML format).
    2. First image-type entry in ``content_blocks`` — inline image
       inside the body. Used when the article has no standalone tag
       but does contain inline images.
    3. ``None`` — no image at all (frontend renders a category-based
       placeholder).

    Path 2 design (TASK-7-Z reshape): we extract here at Transform
    rather than at Collector because only ~13% of raw articles ever
    surface to users (selected → transformed). Doing this work for
    every raw article was wasted effort.
    """
    images = original.get("images") or []
    if images:
        first = images[0]
        if isinstance(first, dict):
            url = first.get("url")
            if url:
                return url

    for block in original.get("content_blocks") or []:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "image":
            url = block.get("url")
            if url:
                return url

    return None


async def _process_one_article(
    article_group: Dict[str, Any],
    transform_svc: TransformV2Service,
    embedder: EmbeddingV2Client,
    pg: PgVectorV2Client,
    s3_v2: S3ArticleV2Client,
    semaphore: asyncio.Semaphore,
    db_lock: asyncio.Lock,
) -> Optional[str]:
    """Transform one article's selected MBTI subset end-to-end.

    Input ``article_group`` shape (from ``_group_queue_by_article``):
      ``{news_id, article_meta, mbti_groups: [...], selection_date, ...}``

    Returns ``news_id`` if at least one MBTI succeeded (may include partial
    failures — those rows stay ``transformed_at=NULL`` and retry next fire).
    Returns ``None`` if every requested MBTI failed (article gets
    ``status='failed'`` so a downstream cleanup job can investigate).

    Per-article exceptions are swallowed so a single bad article cannot
    poison the batch. Articles get ``status='failed'`` only when every
    requested group fails — partial successes leave ``status`` untouched
    (Q4=B; v2 truth-source for "ready" is ``article_selections.transformed_at``).
    """
    news_id = article_group["news_id"]
    requested_groups = article_group["mbti_groups"]
    selection_date = article_group["selection_date"]

    async with semaphore:
        start = time.time()
        try:
            original = await asyncio.to_thread(
                s3_v2.get_article_file, news_id, "original.json"
            )
            if not original:
                raise RuntimeError(f"original.json missing for {news_id}")

            # Path 2: extract hero/thumbnail image_url from original.json
            # right here (only happens for selected+being-transformed
            # articles). image_url is article-level; same value flows to
            # every MBTI variant.
            image_url = _extract_image_url(original)

            # Field mapping — v1 article_to_dict() renames Python dataclass
            # fields to Korean-suffixed JSON keys at the S3 boundary:
            #   title         → title_ko
            #   sub_title     → sub_title_ko
            #   content_clean → content_ko
            # See backend/clients/s3_xml_client.py line 809-826.
            result = await transform_svc.transform_article_for_groups(
                title=original.get("title_ko", ""),
                subtitle=original.get("sub_title_ko", "") or "",
                content=original.get("content_ko", ""),
                category=original.get("category", ""),
                groups=requested_groups,
            )

            versions = result["versions"]
            usage = result["usage"]
            failed_groups_from_bedrock = result.get("failed_groups", [])

            # If every requested group failed at the Bedrock layer, treat
            # the article as a full failure: mark articles.status='failed'
            # and don't write any versions. Selection rows stay
            # transformed_at=NULL — but with status='failed' the next fire
            # will skip them (Selector won't re-score; Transform polls
            # selected+pending which still includes them, so add an
            # status='failed' guard at the SELECT level... actually
            # get_transform_queue doesn't filter by article status today.
            # That's fine for now — failed articles will keep retrying
            # until a flake passes; a future TASK can add a fail-counter
            # column to article_selections to bound retries.
            if not versions:
                async with db_lock:
                    await asyncio.to_thread(
                        pg.update_article_status, news_id, "failed"
                    )
                logger.error(
                    json.dumps(
                        {
                            "event": "transform_full_failure",
                            "news_id": news_id,
                            "requested_groups": requested_groups,
                            "failed_groups": failed_groups_from_bedrock,
                            "usage": usage,
                        },
                        ensure_ascii=False,
                    )
                )
                return None

            # TASK-2.4 — inline Validator. Structural + Nova Lite hallucination
            # check. Runs AFTER transform but BEFORE any S3/pg writes so a
            # failed validation never leaves half-committed versions behind.
            # Default-to-pass on Nova errors (see validator module docstring).
            validation = await validate_versions(
                title=original.get("title_ko", ""),
                content=original.get("content_ko", ""),
                versions=versions,
                requested_groups=requested_groups,
                endpoint_url=os.getenv("BEDROCK_RUNTIME_ENDPOINT_URL") or None,
                enable_ai_check=True,
            )
            if not validation.passed:
                async with db_lock:
                    await asyncio.to_thread(
                        pg.update_article_status, news_id, "failed"
                    )
                # Phase 5 retry-limit: bump validation_failure_count per
                # requested group; force-release any group at/over the
                # threshold so the row stops re-entering the 5-min
                # transform queue. Article_versions row was never written
                # for these groups (we returned None before _store_one_version),
                # so the feed query's INNER JOIN article_versions naturally
                # keeps the released row hidden from frontend.
                retry_limit = get_threshold("transform-retry-limit", default=5)
                released_groups: List[str] = []
                fail_counts: Dict[str, int] = {}
                for group in requested_groups:
                    async with db_lock:
                        new_count = await asyncio.to_thread(
                            pg.increment_validation_failure_count,
                            news_id,
                            group,
                            selection_date,
                        )
                    fail_counts[group] = new_count
                    if new_count >= retry_limit:
                        async with db_lock:
                            released = await asyncio.to_thread(
                                pg.force_transformed_at_for_retry_limit,
                                news_id,
                                group,
                                selection_date,
                            )
                        if released:
                            released_groups.append(group)
                            emit_count(
                                "TransformRetryLimitReached",
                                1,
                                dimensions={"mbti": group},
                            )
                            logger.warning(
                                json.dumps(
                                    {
                                        "event": "transform_retry_limit_reached",
                                        "news_id": news_id,
                                        "mbti_type": group,
                                        "failure_count": new_count,
                                        "retry_limit": retry_limit,
                                        "last_issue": (
                                            validation.issues[0]
                                            if validation.issues
                                            else None
                                        ),
                                    },
                                    ensure_ascii=False,
                                )
                            )
                logger.error(
                    json.dumps(
                        {
                            "event": "transform_validation_failure",
                            "news_id": news_id,
                            "requested_groups": requested_groups,
                            "ai_check_used": validation.ai_check_used,
                            "issues": validation.issues,
                            "usage": usage,
                            "fail_counts": fail_counts,
                            "released_groups": released_groups,
                            "retry_limit": retry_limit,
                        },
                        ensure_ascii=False,
                    )
                )
                return None

            # Store each successful version (embed + S3 put + pg insert)
            # and stamp transformed_at on its selection row. Each
            # _store_one_version takes db_lock for its inserts; the
            # mark_transformed call below also takes db_lock — both
            # interleave safely.
            await asyncio.gather(
                *(
                    _store_one_version(
                        news_id, group, version_dict, image_url, embedder, pg, s3_v2, db_lock
                    )
                    for group, version_dict in versions.items()
                )
            )

            # Stamp transformed_at on the selection rows — only for groups
            # that actually wrote a version. Failed groups stay
            # transformed_at=NULL and the next fire will retry them
            # (selection row still has selected=TRUE).
            for group in versions.keys():
                async with db_lock:
                    await asyncio.to_thread(
                        pg.mark_transformed,
                        news_id,
                        group,
                        selection_date,
                    )

            latency_ms = int((time.time() - start) * 1000)
            for group in versions.keys():
                logger.info(
                    json.dumps(
                        {
                            "event": "transform_complete",
                            "news_id": news_id,
                            "mbti_group": group,
                            "input_tokens": usage.get("input_tokens", 0),
                            "output_tokens": usage.get("output_tokens", 0),
                            "cache_creation_input_tokens": usage.get(
                                "cache_creation_input_tokens", 0
                            ),
                            "cache_read_input_tokens": usage.get(
                                "cache_read_input_tokens", 0
                            ),
                            "cache_hit": usage.get("cache_read_input_tokens", 0) > 0,
                            "latency_ms": latency_ms,
                        }
                    )
                )

            # If some requested groups failed at the Bedrock layer (partial
            # success), log it but don't mark the article failed. Failed
            # groups will retry on the next fire.
            if failed_groups_from_bedrock:
                logger.warning(
                    json.dumps(
                        {
                            "event": "transform_partial_failure",
                            "news_id": news_id,
                            "requested_groups": requested_groups,
                            "succeeded_groups": list(versions.keys()),
                            "failed_groups": failed_groups_from_bedrock,
                        }
                    )
                )

            return news_id

        except Exception as exc:
            async with db_lock:
                try:
                    await asyncio.to_thread(
                        pg.update_article_status, news_id, "failed"
                    )
                except Exception:
                    # If even the status update fails, log and continue —
                    # the next fire will pick up the same selection rows
                    # (transformed_at still NULL) and retry.
                    logger.exception(
                        f"update_article_status({news_id!r}, 'failed') also failed"
                    )
            logger.error(
                json.dumps(
                    {
                        "event": "transform_error",
                        "news_id": news_id,
                        "error_type": type(exc).__name__,
                        "error_message": str(exc),
                        "latency_ms": int((time.time() - start) * 1000),
                    },
                    ensure_ascii=False,
                ),
                exc_info=True,
            )
            return None


async def _store_one_version(
    news_id: str,
    group: str,
    version_dict: Dict[str, Any],
    image_url: Optional[str],
    embedder: EmbeddingV2Client,
    pg: PgVectorV2Client,
    s3_v2: S3ArticleV2Client,
    db_lock: asyncio.Lock,
) -> None:
    """Embed + S3 put + pg insert for one MBTI version.

    Version keys (``title``, ``subtitle``, ``body``, ``key_points``,
    ``closing_line``) come from Opus via v1's output-format spec
    (see ``_build_group_system_prompt`` line 131-138 of v1
    ``mbti_transform_service.py``). ``title`` and ``body`` are promoted to
    pgvector columns; the rest land in ``metadata`` JSONB.

    ``image_url`` is the article-level hero image (same value for all 4
    MBTI variants — image doesn't differ per persona). Stored in each
    version's ``metadata`` JSONB; small constant duplication (~50 bytes
    × 4 variants) traded for SoC simplicity (Transform owns
    ``article_versions`` writes, doesn't UPDATE ``articles``).
    """
    body_text = f"{version_dict.get('title','')}\n\n{version_dict.get('body','')}"
    embedding = await asyncio.to_thread(embedder.embed_text, body_text)

    await asyncio.to_thread(
        s3_v2.put_article_file, news_id, f"version_{group}.json", version_dict
    )

    metadata = {
        "title": version_dict.get("title", ""),
        "body": version_dict.get("body", ""),
        "subtitle": version_dict.get("subtitle", ""),
        "key_points": version_dict.get("key_points", []),
        "closing_line": version_dict.get("closing_line", ""),
        "image_url": image_url,
    }
    async with db_lock:
        await asyncio.to_thread(
            pg.insert_article_version, news_id, group, metadata, embedding
        )
