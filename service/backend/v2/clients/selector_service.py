"""Selector Service — Bedrock Nova Lite article scoring for v2 Selection.

Called from ``v2.handlers.core1_5_selector`` to score candidate articles on
4 MBTI dimensions (NT/NF/ST/SF) plus quality. Mirrors v1
``handlers/pipeline/step1_select`` scoring logic but writes into
``article_selections`` (per-MBTI rows) instead of DynamoDB
``__type_assignments__{date}``.

Design: composition, not subclass
---------------------------------
v1 ``step1_select`` is left untouched (per ``.clauderules`` #1). The
``article_scorer`` prompt under ``backend/prompts/selection/`` is shared —
this module loads it through the existing ``services.prompt_loader``.
That's a read-only import of a v1 utility, allowed by Rule 1.

Composite score
---------------
``composite_score = mbti_score * 0.7 + quality_score * 0.3`` exactly
matches v1 ``_select_per_type``. The 0.7/0.3 weights are tuned for
"per-MBTI relevance dominates, but cap on outright low-quality articles".
Don't change without the 6 months of v1 production data behind that
choice.

Default-to-mid on Nova errors
-----------------------------
If Nova throttles, times out, or returns malformed JSON, every article
in the failing batch falls back to score 5.0 across all dimensions
(``DEFAULT_SCORES``). Same v1 philosophy: scoring failure should not
remove an article from the candidate pool, just ranked by neutral score.
The handler still calls ``upsert_selection_score`` for these so they
appear in ``article_selections`` and can be re-ranked later if a
re-scoring pass is added.

Why no embedding
----------------
v2 Phase 3 personalization will use ``user_profiles.preference_embedding``
× ``articles.embedding`` for cosine ranking. Selection (Phase 2.5)
operates upstream of that and doesn't need embeddings — Nova Lite
classifies on text directly. Saves a Titan call per article per MBTI.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional

import boto3
from botocore.config import Config

logger = logging.getLogger(__name__)


# ── Constants ────────────────────────────────────────────────────────────────

_NOVA_LITE_MODEL_ID = "amazon.nova-lite-v1:0"
_REGION = "us-east-1"

# v1 step1_select.SCORING_BATCH_SIZE. 20 is the v1-tuned sweet spot:
# fits comfortably in Nova Lite's 8K input window with prompt + 20×200ch
# previews + reasoning headroom, and big enough that prompt overhead is
# amortized across many articles.
SCORING_BATCH_SIZE = 20

# Nova Lite reasoning + 20-article output JSON. v1 used 3072.
_NOVA_MAX_TOKENS = 3072

# Bedrock retry/timeout. Selector runs on a 3h schedule; if Nova is
# briefly throttled, return defaults for that batch and let the next
# Selector run pick up unscored articles. Don't spend Lambda wall-clock
# on heroic retry loops.
_BEDROCK_CONFIG = Config(
    read_timeout=120,
    connect_timeout=10,
    retries={"max_attempts": 2, "mode": "standard"},
)

# Default mid-score per dimension when Nova fails or omits an article.
# 5.0 is the midpoint of the 1-10 rubric — neutral, neither prioritizes
# nor disqualifies. Caller still UPSERTs these so the article shows up
# in article_selections.
DEFAULT_SCORE = 5.0

# Composite score weights (v1 step1_select line 362). 0.7 mbti + 0.3 quality.
_W_MBTI = 0.7
_W_QUALITY = 0.3

# 4 MBTI groups + quality. Names match v1 article_scorer.md output schema.
_SCORE_KEYS = ("nt_score", "nf_score", "st_score", "sf_score", "quality")
_MBTI_GROUPS = ("NT", "NF", "ST", "SF")


# ── Pure helpers (unit-testable) ─────────────────────────────────────────────


def make_default_scores() -> Dict[str, float]:
    """Fresh dict of {nt_score: 5.0, nf_score: 5.0, ..., quality: 5.0}.

    Returned by reference, so each caller gets its own mutable copy
    (avoids the classic "mutable default argument" bug).
    """
    return {k: DEFAULT_SCORE for k in _SCORE_KEYS}


def composite_score(scores: Dict[str, float], mbti: str) -> float:
    """0.7 * mbti_score + 0.3 * quality. Matches v1 _select_per_type.

    ``mbti`` is one of ``NT``, ``NF``, ``ST``, ``SF`` (case-insensitive).
    Missing keys fall back to ``DEFAULT_SCORE`` so partial Nova responses
    never crash the caller — they just produce neutral composites.

    The earlier Phase 4-A boost arg (``paper_number``, +DDB threshold) was
    reverted after reconnaissance: paragraph='TOP' (각 지면 메인 기사) is
    already curated by the collector filter, so selector ranking stays
    pure mbti_score × 0.7 + quality × 0.3.
    """
    key = f"{mbti.lower()}_score"
    mbti_val = float(scores.get(key, DEFAULT_SCORE))
    quality_val = float(scores.get("quality", DEFAULT_SCORE))
    return mbti_val * _W_MBTI + quality_val * _W_QUALITY


def build_user_message(
    system_prompt: str, articles: List[Dict[str, Any]]
) -> str:
    """Build the Nova Lite user message for one batch.

    Each article line: ``N. [news_id] (category) title\\n   preview...``
    The numeric prefix is local to the batch (``1..len(articles)``) for
    Nova's own bookkeeping; news_id is the canonical join key the
    response is expected to echo back.
    """
    lines = []
    for i, a in enumerate(articles, start=1):
        preview = (a.get("content_preview") or "")
        title = a.get("title") or ""
        category = a.get("category") or "기타"
        nid = a.get("news_id") or ""
        lines.append(
            f"{i}. [{nid}] ({category}) {title}\n   {preview}..."
        )
    return (
        f"{system_prompt}\n\n"
        f"## 후보 기사 ({len(articles)}건)\n\n"
        + "\n\n".join(lines)
        + "\n\nJSON 배열만 출력하세요. 다른 텍스트는 포함하지 마세요."
    )


def parse_nova_response(
    text: str, expected_news_ids: List[str]
) -> Dict[str, Dict[str, float]]:
    """Extract per-news_id scores from a Nova response.

    Nova may wrap the JSON array in prose, markdown fences, or chain-of-
    thought. We greedy-match the outermost ``[...]``. Anything that
    doesn't parse, or news_ids not in ``expected_news_ids``, is dropped
    silently — the caller fills with ``make_default_scores()`` so every
    expected article gets a score record.

    Each entry in the returned dict has the same shape as
    ``make_default_scores()``: 5 float keys. Missing fields per entry
    fall back to ``DEFAULT_SCORE``.
    """
    if not text:
        return {}
    match = re.search(r"\[\s*\{[\s\S]*\}\s*\]", text)
    if not match:
        return {}
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, list):
        return {}

    expected_set = set(expected_news_ids)
    result: Dict[str, Dict[str, float]] = {}
    for entry in parsed:
        if not isinstance(entry, dict):
            continue
        nid = entry.get("news_id") or ""
        if nid not in expected_set:
            continue
        scores = make_default_scores()
        for k in _SCORE_KEYS:
            v = entry.get(k)
            if v is None:
                continue
            try:
                scores[k] = float(v)
            except (TypeError, ValueError):
                continue
        result[nid] = scores
    return result


# ── Bedrock Nova Lite client ─────────────────────────────────────────────────


def make_nova_client(endpoint_url: Optional[str] = None) -> Any:
    """Construct a boto3 Bedrock runtime client for Nova Lite.

    ``endpoint_url`` lets VPC-bound Lambdas hit a private VPCE
    (same pattern as ``EmbeddingV2Client`` and ``validator``). Falls
    back to public Bedrock when None — for local dev.
    """
    kwargs: Dict[str, Any] = {
        "region_name": _REGION,
        "config": _BEDROCK_CONFIG,
    }
    if endpoint_url:
        kwargs["endpoint_url"] = endpoint_url
    return boto3.client("bedrock-runtime", **kwargs)


async def score_one_batch(
    client: Any,
    articles: List[Dict[str, Any]],
    system_prompt: str,
) -> Dict[str, Dict[str, float]]:
    """Score one batch of up to ``SCORING_BATCH_SIZE`` articles via Nova Lite.

    Returns a complete map ``{news_id: {nt_score, nf_score, st_score,
    sf_score, quality}}`` covering every input article. Articles Nova
    didn't score (timeout, malformed JSON, omitted from response) get
    ``make_default_scores()`` so the caller always has a row to upsert.

    Default-to-mid (5.0) keeps a failing-Nova batch from silently
    dropping articles out of the candidate pool. The Selector
    re-runs every 3 hours; a temporarily-mid-scored article will be
    picked up by the next pass IF it's not already scored — but with
    Q4=(B) it stays at the default until manually re-scored.
    """
    # Initialize every article with defaults — overwritten on success.
    by_id: Dict[str, Dict[str, float]] = {
        a["news_id"]: make_default_scores() for a in articles
    }
    if not articles:
        return by_id

    user_message = build_user_message(system_prompt, articles)
    body = json.dumps(
        {
            "schemaVersion": "messages-v1",
            "messages": [
                {"role": "user", "content": [{"text": user_message}]}
            ],
            "inferenceConfig": {
                "maxTokens": _NOVA_MAX_TOKENS,
                "temperature": 0.1,
            },
        }
    )

    try:
        response = await asyncio.to_thread(
            client.invoke_model,
            modelId=_NOVA_LITE_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=body,
        )
        payload = json.loads(response["body"].read())
        text = (
            payload.get("output", {})
            .get("message", {})
            .get("content", [{}])[0]
            .get("text", "")
        )
    except Exception as exc:
        logger.warning(
            f"score_one_batch failed (default-to-mid for "
            f"{len(articles)} articles): {type(exc).__name__}: {exc}"
        )
        return by_id

    expected_ids = [a["news_id"] for a in articles]
    parsed = parse_nova_response(text, expected_ids)
    # Overwrite defaults with successfully parsed scores.
    for nid, scores in parsed.items():
        by_id[nid] = scores

    parsed_count = len(parsed)
    if parsed_count < len(articles):
        logger.info(
            f"score_one_batch: Nova returned {parsed_count}/{len(articles)} "
            f"scores; the rest fall back to default 5.0"
        )
    return by_id


async def score_articles(
    client: Any,
    articles: List[Dict[str, Any]],
    system_prompt: str,
    *,
    max_concurrency: int = 5,
) -> Dict[str, Dict[str, float]]:
    """Score an arbitrary number of articles by chunking into batches.

    Splits ``articles`` into chunks of ``SCORING_BATCH_SIZE`` and runs
    up to ``max_concurrency`` batches in parallel via ``asyncio.gather``.
    The default 5 keeps Nova Lite call-rate well under the on-demand
    throttle and matches v1's tuned concurrency.

    Empty input returns an empty dict — the caller treats this as
    "nothing to score", not an error.
    """
    if not articles:
        return {}

    chunks = [
        articles[i : i + SCORING_BATCH_SIZE]
        for i in range(0, len(articles), SCORING_BATCH_SIZE)
    ]

    semaphore = asyncio.Semaphore(max_concurrency)

    async def _run(chunk: List[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
        async with semaphore:
            return await score_one_batch(client, chunk, system_prompt)

    batch_results = await asyncio.gather(
        *(_run(c) for c in chunks), return_exceptions=False
    )
    merged: Dict[str, Dict[str, float]] = {}
    for r in batch_results:
        merged.update(r)
    return merged
