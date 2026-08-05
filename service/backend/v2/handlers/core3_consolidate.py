"""Core 3 Consolidation Lambda — daily batch update of user_profiles.

Triggered by EventBridge schedule cron(0 18 * * ? *) — UTC 18:00 ==
KST 03:00 (Korea is UTC+9, no DST). The schedule and rule are
created manually in the AWS console (per .clauderules #11); this
file only defines the handler.

Per fire
--------
1. Compute the 30-day cutoff (now - 30d, UTC).
2. ``find_active_users_since(cutoff)`` — users with at least one
   interaction in the window.
3. For each active user, call ``MemoryManager.consolidate(user_id)``:
     - If distinct news count < 10 → skip (seed stays).
     - Else → EWMA preference_embedding + recompute category_weights.
4. Aggregate per-user statuses into a per-fire metrics dict.

What this Lambda intentionally does NOT do
------------------------------------------
* No article-level engagement aggregate (Q4 = B in Round 5-D
  planning — deferred to a later round).
* No Bedrock calls. Embedding centroid is computed via SQL AVG.
  No EmbeddingV2Client needed at all (small win — eliminates the
  endpoint_url footgun for this Lambda).
* No incremental state. Every fire reads the full 30-day window
  for every active user; runs are independent.

Idempotency
-----------
Re-running the Lambda (same UTC day) yields the same final
``preference_embedding`` only modulo a single additional EWMA
application — i.e. running twice is "tomorrow happened today".
Re-running within the same fire window before the prior write
commits would yield indeterminate results, but EventBridge fires
are far enough apart that this isn't a real concern.

Observability (JSON log events)
-------------------------------
* ``consolidate_run_started`` — at start, with cutoff
* ``consolidate_run_complete`` — totals at end
* ``consolidate_user_error`` — per-user exception (caller continues)
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import success_response

from v2.clients.pgvector_v2_client import PgVectorV2Client
from v2.core3.memory_manager import MemoryManager


logger = logging.getLogger(__name__)
logging.getLogger().setLevel(logging.INFO)


# Match MemoryManager.CONSOLIDATE_WINDOW_DAYS — duplicated as a
# module-level constant so the handler's reference doesn't leak the
# class internal. If the class constant changes, update both
# (intentional — they are conceptually distinct: the lambda's "look
# at active users in this window" vs the manager's "compute over
# this window").
_ACTIVE_WINDOW_DAYS = 30


@handler_decorator
async def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    method = (
        event.get("httpMethod")
        or (event.get("requestContext") or {}).get("http", {}).get("method")
        or "GET"
    )
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    now = datetime.now(timezone.utc)
    cutoff = now - _timedelta_days(_ACTIVE_WINDOW_DAYS)

    logger.info(json.dumps({
        "event": "consolidate_run_started",
        "now": now.isoformat(),
        "cutoff": cutoff.isoformat(),
    }))

    pg = PgVectorV2Client()
    memory = MemoryManager(pg_client=pg)
    # Note: no EmbeddingV2Client needed — consolidation never embeds.
    # This means BEDROCK_RUNTIME_ENDPOINT_URL env var is not strictly
    # required for this Lambda, but include it anyway for consistency
    # with other v2 Lambdas (in case future code paths add Bedrock).

    active_users = pg.find_active_users_since(cutoff)
    logger.info(f"consolidate: {len(active_users)} active users to process")

    counts = {
        "applied": 0,
        "skipped_below_threshold": 0,
        "skipped_no_profile": 0,
        "skipped_no_centroid": 0,
        "errored": 0,
    }
    per_user_status: list = []

    for uid in active_users:
        try:
            result = memory.consolidate(uid, now=now)
            status = result["status"]
            counts[status] = counts.get(status, 0) + 1
            per_user_status.append(result)
        except Exception as exc:
            counts["errored"] += 1
            logger.error(json.dumps({
                "event": "consolidate_user_error",
                "user_id": uid,
                "error": repr(exc),
            }))
            # Continue; one bad user shouldn't fail the whole batch.

    metrics = {
        "now": now.isoformat(),
        "cutoff": cutoff.isoformat(),
        "active_users": len(active_users),
        "counts": counts,
        # Per-user list capped to 200 entries — for a dev environment
        # we want to inspect; in production this should be sampled
        # or routed to S3.
        "sample_results": per_user_status[:200],
    }
    logger.info(json.dumps({
        "event": "consolidate_run_complete",
        "active_users": len(active_users),
        "counts": counts,
    }))
    return success_response(metrics)


def _timedelta_days(n: int):
    """Tiny helper isolated for monkeypatching in tests if ever needed.
    Importing timedelta directly from datetime would be just as fine;
    this exists purely as a future-proofing seam."""
    from datetime import timedelta
    return timedelta(days=n)
