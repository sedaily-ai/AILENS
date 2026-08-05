"""
Embedding Client
Generates text vector embeddings via Amazon Bedrock Titan Embeddings V2.

Used by both OpenSearch (RAG/hybrid search) and pgvector (similarity search)
integrations. Handles:
  - Single text embedding
  - Batch embedding (multiple texts)
  - Long-text chunking (split by paragraphs, embed each, average into one vector)

Model: amazon.titan-embed-text-v2:0
  - Dimension: 1024
  - Max input: 8192 tokens (~6000 Korean chars)
  - Cost: $0.00002 / 1K input tokens
"""
import json
import logging
import math
from typing import List, Optional

import boto3
from botocore.config import Config

from config.constants import (
    BEDROCK_EMBEDDING_MODEL_ID,
    BEDROCK_EMBEDDING_DIMENSION,
    BEDROCK_REGION,
    EMBEDDING_CHARS_PER_CHUNK,
)

logger = logging.getLogger(__name__)

_BEDROCK_CONFIG = Config(
    read_timeout=30,
    connect_timeout=10,
    retries={'max_attempts': 3},
)


class EmbeddingClient:
    """
    Client for generating text embeddings via Amazon Bedrock.

    Usage:
        client = EmbeddingClient()
        vec = client.embed_text("삼성전자 1분기 실적 발표")
        vecs = client.embed_batch(["text1", "text2"])
    """

    def __init__(
        self,
        model_id: str = BEDROCK_EMBEDDING_MODEL_ID,
        region: str = BEDROCK_REGION,
        dimension: int = BEDROCK_EMBEDDING_DIMENSION,
    ):
        self.model_id = model_id
        self.dimension = dimension
        self._client = boto3.client(
            'bedrock-runtime',
            region_name=region,
            config=_BEDROCK_CONFIG,
        )

    # ── Public API ───────────────────────────────────────────────────────────

    def embed_text(self, text: str) -> List[float]:
        """
        Generate an embedding vector for a single text.

        If the text exceeds the model's token limit, it is split into
        paragraph-level chunks, each chunk is embedded separately, and
        the results are averaged into a single vector.

        Args:
            text: Input text (Korean or English)

        Returns:
            List of floats with length == self.dimension (1024)

        Raises:
            EmbeddingError: If the Bedrock call fails
        """
        if not text or not text.strip():
            return [0.0] * self.dimension

        text = text.strip()

        try:
            if len(text) <= EMBEDDING_CHARS_PER_CHUNK:
                return self._call_bedrock(text)

            # Long text → chunk, embed each, average
            chunks = _split_into_chunks(text, EMBEDDING_CHARS_PER_CHUNK)
            logger.info(f"Long text ({len(text)} chars) split into {len(chunks)} chunks")

            vectors = []
            for chunk in chunks:
                vec = self._call_bedrock(chunk)
                vectors.append(vec)

            return _average_vectors(vectors)

        except EmbeddingError:
            # Already wrapped (throttling, malformed Bedrock response, etc.) —
            # let the caller decide how to handle. Returning a zero vector
            # silently corrupts vector indexes.
            raise
        except Exception as e:
            # Wrap unexpected errors so the caller can distinguish "embed
            # failed" from any other exception type. NOTE: previously this
            # branch returned `[0.0] * self.dimension` which silently wrote
            # zero vectors into OpenSearch / pgvector. That made similarity
            # search return random results for any item that hit a transient
            # Bedrock error during ingestion.
            logger.error(f"Embedding failed for text ({len(text)} chars): {e}", exc_info=True)
            raise EmbeddingError(f"Embedding failed: {e}") from e

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.

        Each text is independently embedded (with chunking if needed).
        Titan Embeddings does not support native batching, so this
        iterates and calls embed_text for each.

        Args:
            texts: List of input texts

        Returns:
            List of embedding vectors (same order as input)
        """
        results = []
        for i, text in enumerate(texts):
            try:
                vec = self.embed_text(text)
                results.append(vec)
            except EmbeddingError:
                logger.warning(f"Embedding failed for batch item {i}, using zero vector")
                results.append([0.0] * self.dimension)
        return results

    # ── Aliases (match spec naming) ─────────────────────────────────────────

    def get_embedding(self, text: str) -> List[float]:
        """Alias for embed_text."""
        return self.embed_text(text)

    def get_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Alias for embed_batch."""
        return self.embed_batch(texts)

    # ── Bedrock call ─────────────────────────────────────────────────────────

    def _call_bedrock(self, text: str) -> List[float]:
        """
        Call Bedrock Titan Embeddings for a single chunk.

        Request format (Titan Embeddings V2):
          { "inputText": "...", "dimensions": 1024 }

        Response format:
          { "embedding": [0.1, 0.2, ...], "inputTextTokenCount": 42 }
        """
        try:
            body = json.dumps({
                'inputText': text,
                'dimensions': self.dimension,
            })

            response = self._client.invoke_model(
                modelId=self.model_id,
                contentType='application/json',
                accept='application/json',
                body=body,
            )

            result = json.loads(response['body'].read())
            embedding = result.get('embedding')

            if not embedding:
                raise EmbeddingError(f"No embedding in response: {list(result.keys())}")

            token_count = result.get('inputTextTokenCount', 0)
            logger.debug(f"Embedded {token_count} tokens → {len(embedding)}-dim vector")

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
    pass


# ── Chunking utilities ───────────────────────────────────────────────────────

def _split_into_chunks(text: str, max_chars: int) -> List[str]:
    """
    Split text into chunks that fit within the embedding model's token limit.

    Strategy:
      1. Split by double-newline (paragraphs)
      2. Greedily merge consecutive paragraphs until max_chars is reached
      3. If a single paragraph exceeds max_chars, hard-split by sentences

    Args:
        text: Full input text
        max_chars: Maximum characters per chunk

    Returns:
        List of text chunks, each <= max_chars
    """
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]

    if not paragraphs:
        paragraphs = [text]

    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    for para in paragraphs:
        if len(para) > max_chars:
            # Flush current buffer
            if current:
                chunks.append('\n\n'.join(current))
                current = []
                current_len = 0
            # Hard-split this oversized paragraph by sentences
            chunks.extend(_split_paragraph(para, max_chars))
            continue

        # Would adding this paragraph exceed the limit?
        added_len = len(para) + (2 if current else 0)  # \n\n separator
        if current_len + added_len > max_chars:
            chunks.append('\n\n'.join(current))
            current = [para]
            current_len = len(para)
        else:
            current.append(para)
            current_len += added_len

    if current:
        chunks.append('\n\n'.join(current))

    return chunks


def _split_paragraph(paragraph: str, max_chars: int) -> List[str]:
    """
    Split an oversized paragraph by sentence boundaries.

    Korean sentence endings: 다. 요. 까. 니. 죠. etc.
    Falls back to hard character split if no sentence boundaries found.
    """
    import re

    # Split by Korean/general sentence endings
    sentences = re.split(r'(?<=[.!?다요까니죠])\s+', paragraph)

    if len(sentences) <= 1:
        # No sentence boundaries — hard split
        return [paragraph[i:i + max_chars] for i in range(0, len(paragraph), max_chars)]

    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    for sent in sentences:
        added_len = len(sent) + (1 if current else 0)
        if current_len + added_len > max_chars:
            if current:
                chunks.append(' '.join(current))
            current = [sent]
            current_len = len(sent)
        else:
            current.append(sent)
            current_len += added_len

    if current:
        chunks.append(' '.join(current))

    return chunks


def _average_vectors(vectors: List[List[float]]) -> List[float]:
    """
    Average multiple embedding vectors into a single vector.

    Used when a long text is split into chunks — each chunk gets its own
    embedding, and the final representation is the element-wise mean.

    The result is L2-normalized so cosine similarity works correctly.
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

    # L2 normalize
    magnitude = math.sqrt(sum(x * x for x in avg))
    if magnitude > 0:
        avg = [x / magnitude for x in avg]

    return avg
