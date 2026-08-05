"""Core 3 Feed API — GET /api/v2/feed?mbti=...&user_id=...&limit=...&since=...

Phase 3 endpoint. Two-mode operation:

* **Anonymous (no ``user_id``)** — Phase 2.5 selection feed unchanged.
  Reads ``article_selections`` rows where ``selected=TRUE`` AND
  ``transformed_at IS NOT NULL``, joined to articles + versions.
  Sorted (selection_date DESC, composite_score DESC).

* **Personalized (``user_id`` present)** — runs the Round 5-A/B
  personalization pipeline:
    1. ``MemoryManager.get_or_create_profile`` lazy-creates the user's
       profile row + seeds preference_embedding (only when caller
       passes a 4-char MBTI like ``INTJ``; 2-char ``NT`` is not enough
       to seed because user_profiles.mbti_type stores the full code).
    2. ``ContextBroker.get_user_context`` assembles UserContext from
       the four memory layers.
    3. ``RecommendAgent.recommend`` routes:
         - cold path (no profile / no embedding): wraps Phase 2.5
           selection feed in RankedArticle, no re-ranking.
         - warm path: 3-Stage scoring (cosine + category + recency)
           plus MMR diversity + per-category cap.

Response shape is identical across both modes — frontend doesn't have
to branch on whether the user is anonymous, cold, or warm. The cold
path's ``selection_date`` / ``transformed_at`` are populated; the warm
path's are ``None`` (the personalized pick wasn't part of today's
Phase 2.5 selection).

Body preview, not full body
---------------------------
Each item carries a 200-char ``body_preview``. The full body lives
behind ``GET /api/v2/article/{id}?mbti=...`` to keep the feed payload
small (a 20-item feed is ~6 KB metadata vs ~60 KB embedded full
bodies).

Auth (Q2 = NONE, v1 parity)
---------------------------
``AuthorizationType: NONE`` at API Gateway. ``user_id`` is a query
parameter (not a JWT claim) — anyone can call with any user_id, which
is acceptable for v2 personalization (worst case is seeing someone
else's personalized feed; no sensitive data exposure). Cognito
integration is a separate later round.
"""
from __future__ import annotations

import logging
from datetime import date as _date
from typing import Any, Dict, List, Optional

from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, success_response

from v2.clients.pgvector_v2_client import PgVectorV2Client
from v2.core3.context_broker import ContextBroker
from v2.core3.memory_manager import MemoryManager
from v2.core3.recommend_agent import RankedArticle, RecommendAgent


logger = logging.getLogger(__name__)
logging.getLogger().setLevel(logging.INFO)


# ── Sizing constants ──────────────────────────────────────────────────────────

DEFAULT_LIMIT = 20
MAX_LIMIT = 50
BODY_PREVIEW_CHARS = 200

# Valid MBTI groups — 2-char.
_VALID_MBTI = {"NT", "NF", "ST", "SF"}

# Valid full MBTI — 16 entries. Used for profile-create gating.
_VALID_FULL_MBTI = frozenset({
    "INTJ", "INTP", "ENTJ", "ENTP",
    "INFJ", "INFP", "ENFJ", "ENFP",
    "ISTJ", "ISTP", "ESTJ", "ESTP",
    "ISFJ", "ISFP", "ESFJ", "ESFP",
})


# ── Pure helpers (unit-testable) ──────────────────────────────────────────────


def _extract_query_params(event: Dict[str, Any]) -> Dict[str, str]:
    """Normalize ``queryStringParameters`` to a plain dict."""
    return event.get("queryStringParameters") or {}


def _validate_mbti(raw: Optional[str]) -> Optional[str]:
    """Return canonical 2-char MBTI group or ``None``.

    Accepts both ``NT`` and ``INTJ``. Returns ``None`` on any failure
    so the handler can return a uniform 400.
    """
    if not raw:
        return None
    cleaned = raw.strip().upper()
    if len(cleaned) == 4:
        cleaned = cleaned[1:3]
    if cleaned in _VALID_MBTI:
        return cleaned
    return None


def _extract_full_mbti(raw: Optional[str]) -> Optional[str]:
    """Return canonical 4-char full MBTI or ``None``.

    The full code is required to seed a user profile (the
    ``user_profiles.mbti_type`` column is CHAR(4) with a 16-value CHECK).
    Frontend may pass either ``NT`` (group) or ``INTJ`` (full); only
    the latter triggers profile creation.
    """
    if not raw:
        return None
    cleaned = raw.strip().upper()
    if cleaned in _VALID_FULL_MBTI:
        return cleaned
    return None


def _parse_limit(raw: Optional[str]) -> int:
    """Parse ``limit`` query param. Out-of-range falls back to default."""
    if not raw:
        return DEFAULT_LIMIT
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_LIMIT
    if n < 1:
        return DEFAULT_LIMIT
    return min(n, MAX_LIMIT)


def _parse_since_date(raw: Optional[str]) -> Optional[_date]:
    """Parse ``since`` query param (ISO ``YYYY-MM-DD``) or ``None``."""
    if not raw:
        return None
    try:
        return _date.fromisoformat(raw.strip())
    except (TypeError, ValueError):
        return None


def _isoformat_or_none(value: Any) -> Optional[str]:
    """date/datetime → ISO string. str → unchanged. None → None."""
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


# ── Item builders — one per path, unified output shape ───────────────────────


def _build_item_from_cold(row: Dict[str, Any]) -> Dict[str, Any]:
    """Map a ``pg.get_feed`` row to the public feed item shape.

    get_feed returns rich rows joined through article_selections —
    selection_date / transformed_at populated, version_title /
    version_body present.
    """
    body = row.get("version_body") or ""
    article_metadata = row.get("article_metadata") or {}
    version_metadata = row.get("version_metadata") or {}
    return {
        "news_id": row.get("news_id"),
        "category": row.get("category"),
        "published_at": _isoformat_or_none(row.get("published_at")),
        "selection_date": _isoformat_or_none(row.get("selection_date")),
        "transformed_at": _isoformat_or_none(row.get("transformed_at")),
        "title": row.get("version_title"),
        "body_preview": body[:BODY_PREVIEW_CHARS],
        "press": article_metadata.get("press"),
        "sub_title": article_metadata.get("sub_title"),
        "url": article_metadata.get("url"),
        "byline": article_metadata.get("author_name"),
        "image_url": version_metadata.get("image_url"),
    }


def _build_item_from_warm(row: Dict[str, Any]) -> Dict[str, Any]:
    """Map a ``find_feed_candidates`` row to the public feed item shape.

    find_feed_candidates returns leaner rows — title / body (not
    version_title / version_body), no selection_date / transformed_at.
    article_metadata / version_metadata are present as separate keys
    after the Round 5-C SQL extension.
    """
    body = row.get("body") or ""
    article_metadata = row.get("article_metadata") or {}
    version_metadata = row.get("version_metadata") or {}
    return {
        "news_id": row.get("news_id"),
        "category": row.get("category"),
        "published_at": _isoformat_or_none(row.get("published_at")),
        "selection_date": None,  # personalized pick — not in today's selection
        "transformed_at": _isoformat_or_none(row.get("created_at")),
        "title": row.get("title"),
        "body_preview": body[:BODY_PREVIEW_CHARS],
        "press": article_metadata.get("press"),
        "sub_title": article_metadata.get("sub_title"),
        "url": article_metadata.get("url"),
        "byline": article_metadata.get("author_name"),
        "image_url": version_metadata.get("image_url"),
    }


def _build_item_from_ranked(ranked: RankedArticle) -> Dict[str, Any]:
    """Dispatch on RankedArticle.path — cold vs warm payload shape differs."""
    if ranked.path == "cold":
        return _build_item_from_cold(ranked.payload)
    return _build_item_from_warm(ranked.payload)


# ── Path-level helpers ────────────────────────────────────────────────────────


def _serve_anonymous(
    pg: PgVectorV2Client,
    mbti_group: str,
    limit: int,
    since: Optional[_date],
) -> List[Dict[str, Any]]:
    """No user_id → Phase 2.5 selection feed unchanged.

    Same code path as Phase 2.5 — bypasses the personalization
    machinery entirely so anonymous calls don't pay the
    MemoryManager / ContextBroker / RecommendAgent overhead.
    """
    rows = pg.get_feed(mbti_group, limit=limit, since_date=since)
    return [_build_item_from_cold(r) for r in rows]


def _serve_personalized(
    pg: PgVectorV2Client,
    user_id: str,
    mbti_group: str,
    mbti_full: Optional[str],
    limit: int,
) -> List[Dict[str, Any]]:
    """user_id present → personalization pipeline.

    Profile lazy-create happens here (Q1 = C decision): when the
    request includes a 4-char MBTI, we seed the profile so the very
    first feed request can use the warm path. 2-char-only requests
    don't trigger seeding (we'd need the full MBTI for the
    user_profiles row's CHAR(4) column).
    """
    memory = MemoryManager(pg_client=pg)

    if mbti_full:
        try:
            memory.get_or_create_profile(user_id, mbti_full)
        except ValueError as exc:
            # _extract_full_mbti already validated, but defensive.
            logger.warning(
                f"feed: get_or_create_profile({user_id!r}, {mbti_full!r}) "
                f"rejected: {exc}"
            )

    broker = ContextBroker(memory_manager=memory)
    ctx = broker.get_user_context(user_id, request_type="feed")

    # Defensive: ContextBroker uses semantic mbti, not the request's.
    # When ctx.mbti_group is empty (no profile, no seed), fall back to
    # the request's group so the agent can still run cold path.
    if not ctx.mbti_group:
        # Inject group from request — has_profile stays False so agent
        # routes to cold path with this group.
        ctx.mbti_group = mbti_group

    agent = RecommendAgent(pg_client=pg)
    ranked = agent.recommend(ctx, limit=limit)
    return [_build_item_from_ranked(r) for r in ranked]


# ── Handler ───────────────────────────────────────────────────────────────────


@handler_decorator
async def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    method = (
        event.get("httpMethod")
        or (event.get("requestContext") or {}).get("http", {}).get("method")
        or "GET"
    )
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    qs = _extract_query_params(event)

    mbti_raw = qs.get("mbti")
    mbti_group = _validate_mbti(mbti_raw)
    if mbti_group is None:
        return error_response(
            "mbti query parameter is required and must be one of "
            "NT/NF/ST/SF (or full 4-char MBTI like INTJ)",
            status_code=400,
            code="invalid_mbti",
        )

    mbti_full = _extract_full_mbti(mbti_raw)  # None if 2-char only
    limit = _parse_limit(qs.get("limit"))
    since = _parse_since_date(qs.get("since"))
    user_id_raw = qs.get("user_id") or ""
    user_id = user_id_raw.strip()

    pg = PgVectorV2Client()

    # V1 simplification (2026-05-13): Core 3 personalization disabled.
    # Both anonymous and logged-in users get the same anonymous-path feed
    # (simple SQL, no MemoryManager / ContextBroker / RecommendAgent).
    # Rationale: gating hypothesis "same-MBTI-group users want same content"
    # not yet validated (< 100 subscribers). Personalization re-enabled in V2
    # by reverting this commit. Background: user_interactions table still
    # accumulates from ArticleView clicks, so Consolidation Lambda has data
    # ready when Core 3 is re-activated.
    items = _serve_anonymous(pg, mbti_group, limit, since)
    logger.info(
        f"feed: v1-simplified mbti={mbti_group} user={user_id or '-'} "
        f"limit={limit} since={since} returned={len(items)}"
    )

    return success_response({
        "mbti_type": mbti_group,
        "count": len(items),
        "items": items,
    })
