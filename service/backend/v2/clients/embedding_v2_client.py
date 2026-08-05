"""Embedding V2 Client — AI LENS v2 Storage Hub.

Standalone Bedrock Titan V2 embedding client for v2 Lambdas. Unlike
``clients.embedding_client.EmbeddingClient`` (v1), this class accepts an
``endpoint_url`` so VPC-bound v2 Lambdas can route Bedrock traffic
through a dedicated Interface VPC Endpoint instead of the public
runtime hostname.

Design: composition, not subclass
---------------------------------
v1 ``EmbeddingClient`` is left untouched (per ``.clauderules`` #1) and
this class is **not** a subclass — v2 evolves independently. The model
constants are imported from ``config.constants`` (read-only import,
allowed by Rule 1) so version pins stay in one place; everything else
(retry config, chunking, averaging, error handling) lives here.

Why endpoint_url
----------------
The default Bedrock VPC Interface Endpoint in this VPC
(``vpce-05b2907fcbbf0f4aa``, owned by another team) has Private DNS
enabled, claiming the public hostname ``bedrock-runtime.us-east-1.amazonaws.com``
for VPC-internal resolution, but its security group does not admit our
Lambda SG. Per AWS, only one endpoint per service per VPC may have
Private DNS enabled, so our v2 endpoint (``vpce-08cbef4cbd9f0c830``)
runs with Private DNS *disabled* and exposes its own VPCE-specific DNS
name. ``endpoint_url`` lets boto3 target that name directly.

When ``endpoint_url`` is None or empty (e.g. local dev outside the VPC),
the client falls back to the standard public Bedrock endpoint via boto3
defaults — same behavior as v1.

Behaviour parity with v1
------------------------
* ``embed_text(text)``        — short text → one Bedrock call; long
                                text → paragraph chunks, embed each,
                                element-wise mean, L2-normalize
* ``embed_batch(texts)``      — iterates ``embed_text`` (Titan has no
                                native batching)
* ``get_embedding`` / ``get_embeddings_batch`` — alias methods kept for
                                naming-spec compatibility
* Empty / whitespace input    → zero vector (1024-dim)
* Bedrock failure             → logged, zero vector returned
                                (Core 1 collector additionally guards
                                against zero-vector storage via
                                ``_is_zero_vector`` in the handler)

Constants are imported from ``config.constants`` to keep the model
pin (``amazon.titan-embed-text-v2:0``) in one place across v1 and v2.
"""
from __future__ import annotations

import json
import logging
import math
import re
from typing import List, Optional

import boto3
from botocore.config import Config

from config.constants import (
    BEDROCK_EMBEDDING_DIMENSION,
    BEDROCK_EMBEDDING_MODEL_ID,
    BEDROCK_REGION,
    EMBEDDING_CHARS_PER_CHUNK,
)

logger = logging.getLogger(__name__)


# Same retry/timeout policy as v1: short connect_timeout to fail fast on
# network misconfig (catches VPC endpoint SG blocks quickly), generous
# read_timeout so a single Titan call can fully complete, three retries
# absorbing transient throttling.
_BEDROCK_CONFIG = Config(
    read_timeout=30,
    connect_timeout=10,
    retries={"max_attempts": 3},
)


class EmbeddingV2Client:
    """Standalone Bedrock Titan V2 client for v2 Lambdas.

    See module docstring for the endpoint_url rationale and parity notes.
    """

    def __init__(
        self,
        endpoint_url: Optional[str] = None,
        model_id: str = BEDROCK_EMBEDDING_MODEL_ID,
        region: str = BEDROCK_REGION,
        dimension: int = BEDROCK_EMBEDDING_DIMENSION,
    ) -> None:
        self.model_id = model_id
        self.dimension = dimension
        # Empty string treated as None (env var fallback friendly).
        self.endpoint_url = endpoint_url or None
        client_kwargs = {"region_name": region, "config": _BEDROCK_CONFIG}
        if self.endpoint_url:
            client_kwargs["endpoint_url"] = self.endpoint_url
        self._client = boto3.client("bedrock-runtime", **client_kwargs)

    # ── Public API ───────────────────────────────────────────────────────────

    def embed_text(self, text: str) -> List[float]:
        """Embed a single text. Long texts auto-chunk + mean-aggregate.

        Returns a 1024-dim list of floats (matches ``self.dimension``).
        Empty/whitespace input returns a zero vector — callers needing
        to detect that should use the handler-side ``_is_zero_vector``
        check rather than relying on the value here.
        """
        if not text or not text.strip():
            return [0.0] * self.dimension

        text = text.strip()

        try:
            if len(text) <= EMBEDDING_CHARS_PER_CHUNK:
                return self._call_bedrock(text)

            chunks = _split_into_chunks(text, EMBEDDING_CHARS_PER_CHUNK)
            logger.info(
                f"Long text ({len(text)} chars) split into {len(chunks)} chunks"
            )

            vectors = []
            for chunk in chunks:
                vec = self._call_bedrock(chunk)
                vectors.append(vec)

            return _average_vectors(vectors)

        except EmbeddingError:
            # Already wrapped (throttling, malformed Bedrock response, etc.) —
            # propagate so callers can decide. Returning a zero vector here
            # silently corrupted pgvector rows in earlier versions; v2 callers
            # (Collector, backfill, Selector) all handle EmbeddingError now.
            raise
        except Exception as e:
            logger.error(
                f"Embedding failed for text ({len(text)} chars): {e}",
                exc_info=True,
            )
            raise EmbeddingError(f"Embedding failed: {e}") from e

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Embed multiple texts independently (no native batching at Titan)."""
        results: List[List[float]] = []
        for i, text in enumerate(texts):
            try:
                results.append(self.embed_text(text))
            except EmbeddingError:
                logger.warning(
                    f"Embedding failed for batch item {i}, using zero vector"
                )
                results.append([0.0] * self.dimension)
        return results

    # ── Aliases (match spec naming, parity with v1) ─────────────────────────

    def get_embedding(self, text: str) -> List[float]:
        """Alias for ``embed_text``."""
        return self.embed_text(text)

    def get_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Alias for ``embed_batch``."""
        return self.embed_batch(texts)

    # ── Bedrock call ─────────────────────────────────────────────────────────

    def _call_bedrock(self, text: str) -> List[float]:
        """Invoke Titan V2 for a single chunk that fits in the token limit.

        Request format mirrors v1: ``{"inputText": ..., "dimensions": 1024}``.
        Throttling raises ``EmbeddingError`` so the outer ``embed_text``
        retry/fallback logic kicks in. Other Bedrock errors propagate to
        the same try/except.
        """
        try:
            body = json.dumps(
                {"inputText": text, "dimensions": self.dimension}
            )

            response = self._client.invoke_model(
                modelId=self.model_id,
                contentType="application/json",
                accept="application/json",
                body=body,
            )

            result = json.loads(response["body"].read())

            try:
                from v2.clients.cloudwatch_metrics import (
                    emit_bedrock_token_usage,
                    parse_bedrock_response_tokens,
                )
                in_tok, out_tok = parse_bedrock_response_tokens(response)
                emit_bedrock_token_usage(
                    model_id=self.model_id,
                    input_tokens=in_tok,
                    output_tokens=out_tok,
                )
            except Exception as metric_exc:
                logger.warning(f"Cost-1b emit failed (non-fatal): {metric_exc}")

            embedding = result.get("embedding")

            if not embedding:
                raise EmbeddingError(
                    f"No embedding in response: {list(result.keys())}"
                )

            token_count = result.get("inputTextTokenCount", 0)
            logger.debug(
                f"Embedded {token_count} tokens -> {len(embedding)}-dim vector"
            )

            return embedding

        except self._client.exceptions.ThrottlingException as e:
            logger.error(f"Bedrock throttling on embedding: {e}")
            raise EmbeddingError(f"Throttled: {e}")

        except EmbeddingError:
            raise

        except Exception as e:
            logger.error(f"Embedding failed: {e}", exc_info=True)
            raise EmbeddingError(str(e))


class EmbeddingError(Exception):
    """Raised when embedding generation fails."""


# ── Chunking utilities (logic mirrors v1, kept v2-local for independence) ───


def _split_into_chunks(text: str, max_chars: int) -> List[str]:
    """Split text into <= ``max_chars`` chunks.

    Greedy paragraph-merge (``\\n\\n`` separated). If a single paragraph
    exceeds the limit, falls back to sentence-level split via
    ``_split_paragraph``.
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    if not paragraphs:
        paragraphs = [text]

    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    for para in paragraphs:
        if len(para) > max_chars:
            if current:
                chunks.append("\n\n".join(current))
                current = []
                current_len = 0
            chunks.extend(_split_paragraph(para, max_chars))
            continue

        added_len = len(para) + (2 if current else 0)  # \n\n separator
        if current_len + added_len > max_chars:
            chunks.append("\n\n".join(current))
            current = [para]
            current_len = len(para)
        else:
            current.append(para)
            current_len += added_len

    if current:
        chunks.append("\n\n".join(current))

    return chunks


def _split_paragraph(paragraph: str, max_chars: int) -> List[str]:
    """Split an oversized paragraph along Korean/general sentence endings.

    Falls back to a hard character split when no sentence boundaries are
    found (e.g., wall-of-text inputs).
    """
    sentences = re.split(r"(?<=[.!?다요까니죠])\s+", paragraph)

    if len(sentences) <= 1:
        return [
            paragraph[i : i + max_chars]
            for i in range(0, len(paragraph), max_chars)
        ]

    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    for sent in sentences:
        added_len = len(sent) + (1 if current else 0)
        if current_len + added_len > max_chars:
            if current:
                chunks.append(" ".join(current))
            current = [sent]
            current_len = len(sent)
        else:
            current.append(sent)
            current_len += added_len

    if current:
        chunks.append(" ".join(current))

    return chunks


def _average_vectors(vectors: List[List[float]]) -> List[float]:
    """Element-wise mean of vectors, then L2-normalize.

    Mirrors v1: cosine similarity downstream depends on unit vectors,
    so normalization is part of the contract, not a callsite concern.
    """
    if not vectors:
        return []

    n = len(vectors)
    dim = len(vectors[0])

    avg = [0.0] * dim
    for vec in vectors:
        for i in range(dim):
            avg[i] += vec[i]

    for i in range(dim):
        avg[i] /= n

    magnitude = math.sqrt(sum(x * x for x in avg))
    if magnitude > 0:
        avg = [x / magnitude for x in avg]

    return avg
