"""Core 3 Record Interaction API — POST /api/v2/interactions

Phase 3 endpoint. Frontend POSTs here every time a user clicks,
dwells on, scrolls, skips, reacts to, or rates an article. The handler:

1. Validates body fields.
2. Lazy-creates the user profile (if 4-char MBTI provided) so the
   user has a seeded preference_embedding for future feed requests.
3. Inserts a row into ``user_interactions``.

Lazy profile creation (Q1 = C, "user-first")
--------------------------------------------
Same gating as the feed handler: when the request body's
``mbti_type`` is a 4-char code (``INTJ``), the handler calls
``MemoryManager.get_or_create_profile`` before recording the
interaction. The profile row holds the full code in ``mbti_type
CHAR(4)`` plus the seeded preference_embedding. 2-char-only
``mbti_type`` (``NT``) skips the profile-create — sufficient for
``user_interactions.mbti_type CHAR(2)`` but not enough to materialize
a profile row.

Body shape
----------
::

    {
      "user_id":          "user-abc",          // required
      "news_id":          "2KBA6I5K9J",        // required
      "interaction_type": "click",             // required, enum
      "mbti_type":        "INTJ",              // optional
      "dwell_ms":         5000,                // optional, int >= 0
      "scroll_pct":       80,                  // optional, int 0-100
      "rating":           5,                   // optional, int 1-5
      "reaction_type":    "like"               // optional, free-form
    }

``interaction_type`` must be one of: click, dwell, scroll, skip,
react, rate (matches ``user_interactions.interaction_type`` CHECK).

Response
--------
* 200 OK: ``{"ok": true}`` plus ``{"profile_created": bool}`` so the
  frontend can refresh "personalized" indicators after the first click.
* 400: missing required field, invalid interaction_type, malformed JSON.

Auth (Q2 = NONE, v1 parity)
---------------------------
``AuthorizationType: NONE``. Same security posture as the feed
handler — anyone can record any user_id's interaction. Acceptable
for v2 (no privacy-sensitive payloads). Rate limiting / Cognito
integration are a later round.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional, Tuple

from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, success_response

from v2.clients.pgvector_v2_client import PgVectorV2Client
from v2.core3.memory_manager import MemoryManager


logger = logging.getLogger(__name__)
logging.getLogger().setLevel(logging.INFO)


# ── Validation constants ──────────────────────────────────────────────────────

# Mirror of pgvector_v2_client._INTERACTION_TYPES; duplicated here to
# avoid importing a private (underscore-prefixed) name across module
# boundaries. If the schema CHECK changes, update both.
_INTERACTION_TYPES = frozenset({
    "click", "dwell", "scroll", "skip", "react", "rate",
})

_VALID_FULL_MBTI = frozenset({
    "INTJ", "INTP", "ENTJ", "ENTP",
    "INFJ", "INFP", "ENFJ", "ENFP",
    "ISTJ", "ISTP", "ESTJ", "ESTP",
    "ISFJ", "ISFP", "ESFJ", "ESFP",
})

_VALID_GROUP_MBTI = frozenset({"NT", "NF", "ST", "SF"})


# ── Pure helpers ──────────────────────────────────────────────────────────────


def _parse_body(event: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Decode the request body. Returns (parsed_dict, error_message).

    API Gateway HTTP API v2 delivers the body as a string under
    ``event.body``. Empty body (None or '') is an error — POST
    requires a JSON object. Any non-dict JSON also rejected.
    """
    raw = event.get("body")
    if raw is None or raw == "":
        return None, "request body is required"
    if isinstance(raw, dict):
        # Direct invocation pattern (e.g. local test)
        return raw, None
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None, "request body must be valid JSON"
    if not isinstance(parsed, dict):
        return None, "request body must be a JSON object"
    return parsed, None


def _extract_full_mbti(raw: Optional[str]) -> Optional[str]:
    """Return 4-char full MBTI or None. Profile-create gating."""
    if not raw or not isinstance(raw, str):
        return None
    cleaned = raw.strip().upper()
    if cleaned in _VALID_FULL_MBTI:
        return cleaned
    return None


def _extract_group_mbti(raw: Optional[str]) -> Optional[str]:
    """Return 2-char group (or None). Used as the value passed to
    ``record_interaction`` — accepts either the 4-char form (reduced)
    or the 2-char form. None and invalid inputs return None (which is
    a valid value for record_interaction; 'skip' events have no
    version)."""
    if not raw or not isinstance(raw, str):
        return None
    cleaned = raw.strip().upper()
    if len(cleaned) == 4 and cleaned in _VALID_FULL_MBTI:
        return cleaned[1:3]
    if cleaned in _VALID_GROUP_MBTI:
        return cleaned
    return None


def _coerce_int(value: Any, *, min_val: Optional[int] = None, max_val: Optional[int] = None) -> Optional[int]:
    """Best-effort int coercion with bounds. Returns None on any
    failure or out-of-bounds — caller decides how to handle."""
    if value is None:
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    if min_val is not None and n < min_val:
        return None
    if max_val is not None and n > max_val:
        return None
    return n


# ── Handler ───────────────────────────────────────────────────────────────────


@handler_decorator
async def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    method = (
        event.get("httpMethod")
        or (event.get("requestContext") or {}).get("http", {}).get("method")
        or "POST"
    )
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    body, parse_err = _parse_body(event)
    if parse_err:
        return error_response(parse_err, status_code=400, code="invalid_body")

    # Required fields
    user_id_raw = body.get("user_id")
    if not user_id_raw or not isinstance(user_id_raw, str) or not user_id_raw.strip():
        return error_response(
            "user_id is required (non-empty string)",
            status_code=400, code="missing_user_id",
        )
    user_id = user_id_raw.strip()

    news_id_raw = body.get("news_id")
    if not news_id_raw or not isinstance(news_id_raw, str) or not news_id_raw.strip():
        return error_response(
            "news_id is required (non-empty string)",
            status_code=400, code="missing_news_id",
        )
    news_id = news_id_raw.strip()

    itype_raw = body.get("interaction_type")
    if not itype_raw or not isinstance(itype_raw, str):
        return error_response(
            "interaction_type is required",
            status_code=400, code="missing_interaction_type",
        )
    itype = itype_raw.strip().lower()
    if itype not in _INTERACTION_TYPES:
        return error_response(
            f"interaction_type must be one of "
            f"{sorted(_INTERACTION_TYPES)}",
            status_code=400, code="invalid_interaction_type",
        )

    # Optional fields
    mbti_raw = body.get("mbti_type")
    mbti_full = _extract_full_mbti(mbti_raw)        # for profile-create
    mbti_group = _extract_group_mbti(mbti_raw)      # for interaction row

    dwell_ms = _coerce_int(body.get("dwell_ms"), min_val=0)
    scroll_pct = _coerce_int(body.get("scroll_pct"), min_val=0, max_val=100)
    rating = _coerce_int(body.get("rating"), min_val=1, max_val=5)
    reaction_type = body.get("reaction_type")
    if reaction_type is not None and not isinstance(reaction_type, str):
        reaction_type = None

    # Pipeline
    pg = PgVectorV2Client()
    profile_created = False

    if mbti_full:
        # Lazy profile-create. Distinguish "newly created" from
        # "already existed" by checking before/after — the frontend
        # may want to surface a "Welcome, your profile is ready!"
        # toast on the first call.
        existed_before = pg.get_user_profile(user_id) is not None
        memory = MemoryManager(pg_client=pg)
        try:
            memory.get_or_create_profile(user_id, mbti_full)
            profile_created = not existed_before
        except ValueError as exc:
            # Defensive — _extract_full_mbti already validated.
            logger.warning(
                f"interaction: get_or_create_profile({user_id!r}, "
                f"{mbti_full!r}) rejected: {exc}"
            )

    # Record interaction row
    pg.record_interaction(
        user_id=user_id,
        news_id=news_id,
        mbti_type=mbti_group,
        interaction_type=itype,
        dwell_ms=dwell_ms,
        scroll_pct=scroll_pct,
        rating=rating,
        reaction_type=reaction_type,
    )

    logger.info(
        f"interaction: user={user_id} news={news_id} type={itype} "
        f"mbti={mbti_group} profile_created={profile_created}"
    )

    return success_response({
        "ok": True,
        "profile_created": profile_created,
    })
