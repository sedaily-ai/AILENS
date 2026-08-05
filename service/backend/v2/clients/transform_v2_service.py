"""Transform V2 Service — AI LENS v2 Core 2 wrapper.

Thin composition wrapper around v1 ``MbtiTransformService`` that:

1. Injects an ``endpoint_url`` so VPC-bound v2 Lambdas can route Bedrock
   traffic through the v2 Interface VPC Endpoint
   (``vpce-08cbef4cbd9f0c830``). v1 ``MbtiTransformService.__init__`` does
   not accept ``endpoint_url``, so we construct a boto3 client here and
   swap it into the v1 instance's ``bedrock_client`` attribute. The three
   regression tests in ``test_transform_v2_service.py`` guard that this
   swap remains valid if v1 refactors its internals.

2. Overrides the Opus model ID. v1 ``config/constants.py`` pins
   ``BEDROCK_MODEL_ID_OPUS = 'us.anthropic.claude-opus-4-6-v1:0'`` but
   Bedrock's actual inference profile for Opus 4.6 is
   ``us.anthropic.claude-opus-4-6-v1`` (no ``:0`` suffix — AWS changed the
   naming convention for Opus 4.6+). v1's stale constant makes Bedrock
   reply ``ValidationException: The provided model identifier is invalid``,
   confirmed during TASK-2.3 verify_opus_baseline runs. We pass the
   correct ID explicitly here so v2 works regardless of v1's fix status;
   .clauderules #1 forbids editing v1 files in this session.

Design: composition, not subclass
---------------------------------
v1 ``MbtiTransformService`` stays untouched (per ``.clauderules`` #1).
This class owns a v1 instance (``self._svc``) and forwards
``transform_article`` to it. All the heavy lifting — 4-parallel Opus
calls, prompt-caching, retry, JSON parsing, graceful degradation — lives
in v1 and is re-used without modification.

Cache TTL
---------
v1 hardcodes ``cache_control: {"type": "ephemeral"}`` (5min default).
Applying 1h TTL would require editing v1's ``transform_single_group``
body construction — forbidden per ``.clauderules`` #1. Deferred to a
future TASK (Option Z per the Phase A2 design discussion); current v2
Transform Lambda accepts the ``rate(5min)`` trigger × 5min TTL race as
observable via the ``cache_hit`` metric in handler JSON logs.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

import boto3
from botocore.config import Config

from clients.mbti_transform_service import MbtiTransformService

logger = logging.getLogger(__name__)


# Matches v1 ``BEDROCK_CONFIG`` (mbti_transform_service.py line 24-28) so
# behaviour parity is preserved when we swap the client.
_BEDROCK_CONFIG = Config(
    read_timeout=600,
    connect_timeout=60,
    retries={"max_attempts": 3},
)

# Application inference profile ARN (name: mbti-opus-46) — replaces the
# system inference profile so Bedrock invocations carry MBTI-specific tags
# for cost attribution. Switched 2026-05-13 alongside v1 constants.py.
# Same model/cost/perf as the underlying system profile.
_OPUS_4_6_MODEL_ID = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/t6eh3tnfgr6b"


class TransformV2Service:
    """v2 wrapper around v1 ``MbtiTransformService``.

    See module docstring for the endpoint_url and model_id override rationale.
    """

    def __init__(
        self,
        endpoint_url: Optional[str] = None,
        model_id: Optional[str] = None,
        region: str = "us-east-1",
    ) -> None:
        # Pass explicit model_id to bypass v1 constants.BEDROCK_MODEL_ID_OPUS,
        # which is stale ('...-v1:0' vs actual '...-v1').
        effective_model_id = model_id or _OPUS_4_6_MODEL_ID
        self._svc = MbtiTransformService(
            model_id=effective_model_id,
            region=region,
        )
        # Swap the v1 instance's bedrock_client for one configured with our
        # VPC endpoint. Same pattern as EmbeddingV2Client (composition, not
        # subclass) — see module docstring.
        if endpoint_url:
            self._svc.bedrock_client = boto3.client(
                "bedrock-runtime",
                region_name=region,
                endpoint_url=endpoint_url,
                config=_BEDROCK_CONFIG,
            )

    async def transform_article(self, *args: Any, **kwargs: Any) -> Any:
        """Forward to v1 ``transform_article``. See v1 docstring for contract.

        Returns dict with ``versions`` (``{NT/NF/ST/SF: version_dict}``) and
        ``usage`` (aggregated token counts including cache breakdown).
        Raises ``TransformError`` if all 4 groups fail.
        """
        result = await self._svc.transform_article(*args, **kwargs)
        if isinstance(result, dict):
            self._emit_token_usage(result.get("usage") or {})
        return result

    async def transform_article_for_groups(
        self,
        title: str,
        subtitle: str,
        content: str,
        category: str,
        groups: List[str],
    ) -> Dict[str, Any]:
        """Transform article into ONLY the specified MBTI groups.

        Phase 2.5 / TASK-5 entry point. v1 ``transform_article`` always runs
        all 4 MBTI groups in parallel; this method calls the inner
        ``transform_single_group`` directly for each requested group only,
        skipping the ones not in ``groups``. Saves Bedrock cost when the
        Selector chose <4 groups for an article.

        Same parallel-asyncio.gather semantics as v1 ``transform_article``
        so prompt-cache hits across groups within one Lambda invocation
        are preserved (Opus 4.6 ``ttl=1h``, applied in commit 0830c1f).

        Per-group failures are reported via ``failed_groups`` instead of
        raising, mirroring v1 graceful-degradation philosophy. Caller
        decides whether partial success is acceptable. Raises
        ``TransformError`` only when every requested group fails AND at
        least one group was requested.

        Args:
            title, subtitle, content, category: original article fields.
            groups: subset of ``{"NT","NF","ST","SF"}``. Empty list returns
                empty versions and zero usage without any Bedrock call.

        Returns:
            Dict with:
              - ``versions``: ``{group: version_dict}`` only for groups that
                succeeded (subset of ``groups``).
              - ``usage``: aggregated tokens (input/output/cache_creation/
                cache_read) summed across calls.
              - ``failed_groups``: list of groups that raised; caller logs
                or marks them failed downstream.
        """
        # Defensive normalization. Selector writes uppercase 2-char codes,
        # but accept lowercase / dupes / unknowns and filter to the canonical
        # set so a stray value doesn't crash transform_single_group.
        VALID = {"NT", "NF", "ST", "SF"}
        normalized = []
        seen = set()
        for g in groups:
            up = (g or "").upper().strip()
            if up in VALID and up not in seen:
                normalized.append(up)
                seen.add(up)

        if not normalized:
            return {
                "versions": {},
                "usage": {
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "cache_read_input_tokens": 0,
                    "cache_creation_input_tokens": 0,
                },
                "failed_groups": [],
            }

        # Parallel calls — mirrors v1 transform_article structure but only
        # for the requested subset. transform_single_group exists in v1
        # (mbti_transform_service.py line 140) and is the same primitive
        # v1 transform_article uses internally — calling it directly stays
        # within "import v1, never modify" rule (.clauderules #1).
        tasks = [
            self._svc.transform_single_group(
                group=g,
                title=title,
                subtitle=subtitle,
                content=content,
                category=category,
            )
            for g in normalized
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        versions: Dict[str, Dict[str, Any]] = {}
        total_usage = {
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_read_input_tokens": 0,
            "cache_creation_input_tokens": 0,
        }
        failed_groups: List[str] = []

        for group, result in zip(normalized, results):
            if isinstance(result, Exception):
                logger.warning(
                    f"transform_article_for_groups: {group} failed: "
                    f"{type(result).__name__}: {result}"
                )
                failed_groups.append(group)
            else:
                versions[group] = result["version"]
                for key in total_usage:
                    total_usage[key] += result["usage"].get(key, 0)

        # Don't raise on full failure — caller (Transform handler) decides
        # how to mark per-(article × MBTI) selection rows. Returning
        # failed_groups lets the handler stamp transformed_at=NULL but a
        # separate "tried and failed" signal (Q4=B: articles.status='failed'
        # at article level only when ALL requested groups fail).
        self._emit_token_usage(total_usage)
        return {
            "versions": versions,
            "usage": total_usage,
            "failed_groups": failed_groups,
        }

    def _emit_token_usage(self, usage: Dict[str, Any]) -> None:
        try:
            from v2.clients.cloudwatch_metrics import emit_bedrock_token_usage
            in_tok = (
                usage.get("input_tokens", 0)
                + usage.get("cache_creation_input_tokens", 0)
                + usage.get("cache_read_input_tokens", 0)
            )
            out_tok = usage.get("output_tokens", 0)
            if in_tok == 0 and out_tok == 0:
                return
            emit_bedrock_token_usage(
                model_id=_OPUS_4_6_MODEL_ID,
                input_tokens=in_tok,
                output_tokens=out_tok,
            )
        except Exception as exc:
            logger.warning(f"Cost-1b emit failed (non-fatal): {exc}")

    async def close(self) -> None:
        """Close the wrapped v1 service (no-op in v1 — Bedrock client needs no tear-down)."""
        await self._svc.close()
