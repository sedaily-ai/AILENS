"""Core 1 Collector Lambda — fetch sedaily XML, dedup, embed, persist.

EventBridge triggers every 3 hours (rule configured in TASK-2.2). For a
given date (default: today KST), this Lambda pulls every article from the
v1 source XML feed, filters duplicates against pgvector v2, embeds each
new article with Titan V2, writes ``articles/{news_id}/original.json`` to
the v2 S3 bucket, and inserts a ``status='raw'`` row into pgvector v2 for
Core 2 Transform to pick up.

Intentionally simpler than v1 ``handlers/pipeline/step1_select.py``: no
Nova-based scoring, no per-category quota, no "best 30" selection.
Core 1 is pure ingest — selection happens at Core 3 personalization time.

Concurrency
-----------
Article processing fans out via ``asyncio.gather`` with two guards:

* ``asyncio.Semaphore(10)`` bounds concurrent Bedrock Titan V2 calls so
  we stay under the per-minute on-demand quota. 10 × ~400ms latency per
  call = ~25 batches/sec headroom, far under the documented ~2000 RPM
  Titan V2 limit for us-east-1.
* ``asyncio.Lock`` serializes pgvector inserts because
  ``pg8000.native.Connection`` is **not** thread-safe — a single
  connection instance cannot service concurrent ``run()`` calls. Since
  the Bedrock call dominates wall-clock (~400ms) and pg inserts take
  ~10ms, serializing writes is cheap.
* S3 ``put_object`` runs unlocked; boto3 low-level clients are documented
  thread-safe.

Partial failures are swallowed per-article: a bad article (malformed
XML field, Bedrock throttling, transient S3 error) never aborts the
rest of the batch. The response payload lists ``failed_ids`` for
post-mortem; CloudWatch records full stack traces via
``logger.exception``.

Action handling
---------------
The v1 sedaily XML feed marks each row with ``action = 'I' | 'U' | 'D'``
(Insert / Update / Delete). Currently only ``'I'`` rows are persisted;
``'U'`` and ``'D'`` are counted but skipped. See ``backend/v2/TASKS.md``
Phase 2 TODO for the Phase 5 review of this policy.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from clients.s3_xml_client import S3Article, S3XMLClient
from common import feature_flag
from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import success_response

from clients.cloudwatch_metrics import emit_count
from clients.embedding_v2_client import EmbeddingV2Client
from clients.pgvector_v2_client import PgVectorV2Client
from clients.s3_article_v2_client import S3ArticleV2Client

logger = logging.getLogger(__name__)
# Lambda 기본 root logger level 이 WARNING — 이 모듈의 collector_paper_mode_run /
# Collector run started/complete 등 INFO JSON 이벤트가 CloudWatch 에 안 찍히는
# 문제. 같은 패턴으로 core1_5_selector 도 INFO 강제 (line 69).
logging.getLogger().setLevel(logging.INFO)

_KST = timezone(timedelta(hours=9))

# Titan V2 accepts up to 8192 tokens. 6000 chars leaves headroom for Korean
# (~1.5 char/token typical) and matches the v1 EMBEDDING_CHARS_PER_CHUNK
# constant so single-call no-chunk embedding is guaranteed.
_EMBED_MAX_BODY_CHARS = 6000

# Garbage filter: articles shorter than this are typically breaking-news
# snippets that get replaced by a longer follow-up, or raw-feed stubs.
_MIN_BODY_LENGTH = 300

# Body preview stored in metadata for the Selector Lambda. 200 chars is the
# v1 step1_select.CONTENT_PREVIEW_CHARS value — preserves the prompt-token
# budget Nova Lite was tuned against. Longer previews don't help selection
# accuracy and inflate Bedrock cost linearly.
_CONTENT_PREVIEW_CHARS = 200

# Korean newspaper convention: personnel announcements ([인사]) and
# obituaries ([부고]) are news items by XML format but not news to read.
_GARBAGE_TITLE_MARKERS = ("[인사]", "[부고]")

# Concurrent Bedrock Titan V2 calls. Raising past 10 risks on-demand
# throttling on large-batch runs. See module docstring.
_EMBED_CONCURRENCY = 10


# ── Pure helpers (unit-testable) ─────────────────────────────────────────────


def _today_kst() -> str:
    """Today in KST as YYYYMMDD. Isolated for monkeypatching in tests."""
    return datetime.now(_KST).strftime("%Y%m%d")


def _yesterday_kst() -> str:
    """Yesterday in KST as YYYYMMDD. Phase 4-A paper-mode default."""
    return (datetime.now(_KST) - timedelta(days=1)).strftime("%Y%m%d")


def _extract_date(event: Dict[str, Any]) -> str:
    """Date precedence: ``event.date`` > ``event.detail.date`` > paper-mode? yesterday : today.

    * Manual invoke: ``{"date": "20260419"}``.
    * EventBridge rule with input transformer: ``{"detail": {"date": ...}}``.
    * EventBridge default (no transformer): neither key. paper-mode flag
      enabled → yesterday KST (paper articles 가 D-1 daily-xml 에 push 됨).
      flag disabled → legacy today KST.
    """
    raw = event.get("date") or (event.get("detail") or {}).get("date")
    if raw:
        return str(raw)
    if feature_flag.is_enabled("collector-paper-mode"):
        return _yesterday_kst()
    return _today_kst()


def _is_front_page(article: S3Article) -> bool:
    """지면 1면(paperNumber == '1') 기사 여부.

    포맷은 plain '1' — 7일치 2,165건 실측에서 0-패딩("01")·알파벳("A1")
    0건 (2026-07-23, spec §2.2). 변하면 run 로그 front_page_pass=0 으로 감지.
    """
    return (
        article.paper is not None
        and (article.paper.paper_number or "").strip() == "1"
    )


def _passes_paper_filter(article: S3Article) -> Tuple[bool, str]:
    """paper-mode 일 때 ``paragraph == 'TOP'`` **또는 1면 기사** 통과.

    paragraph 의 의미 (정찰 5d aggregate, 377 paper articles):
      ``'TOP'`` = 각 지면 (paperNumber=1..31) 의 메인 기사 — 113건 (30%)
      ``'9'``   = 각 지면의 sub article (페이지 단 위치) — 264건 (70%)
      그 외 값 부재 (정확히 2종류만)

    2026-07-23 확대 (front-page-live-data spec §5.1): '오늘의 1면' 표시용으로
    1면(paperNumber=='1')은 paragraph 무관 전부 수집 — 순증 +4~5건/일.
    reason 'paragraph-not-TOP' 은 이제 "TOP 도 1면도 아님"을 뜻한다.

    Returns ``(ok, reason)``: legacy mode 면 ``(True, 'legacy-mode')``,
    paper mode 면 ``article.paper`` 유무 + paragraph/1면 값으로 결정.
    """
    if not feature_flag.is_enabled("collector-paper-mode"):
        return True, "legacy-mode"
    if article.paper is None:
        return False, "no-paper-element"
    paragraph = (article.paper.paragraph or "").strip()
    if paragraph == "TOP":
        return True, "paragraph-TOP"
    if _is_front_page(article):
        return True, "front-page"
    return False, "paragraph-not-TOP"


def _is_collectible(article: S3Article) -> Tuple[bool, str]:
    """Garbage + paper filter. Returns ``(ok, reason)``.

    Reasons: ``body-too-short`` / ``title-garbage`` / ``no-paper-element``
    (rejects), ``pass`` (accepts). Caller aggregates reasons for the
    ``collector_paper_mode_run`` log event.
    """
    if len(article.content_clean) < _MIN_BODY_LENGTH:
        return False, "body-too-short"
    if any(m in article.title for m in _GARBAGE_TITLE_MARKERS):
        return False, "title-garbage"
    ok, reason = _passes_paper_filter(article)
    if not ok:
        return False, reason
    return True, "pass"


def _build_embedding_text(article: S3Article) -> str:
    """``title + "\\n\\n" + body[:6000]``. Deterministic so tests can assert it."""
    body = article.content_clean[:_EMBED_MAX_BODY_CHARS]
    return f"{article.title}\n\n{body}"


def _build_metadata(article: S3Article) -> Dict[str, Any]:
    """Map ``S3Article`` → metadata dict for ``insert_article``.

    ``title``, ``category``, ``published_at`` are promoted to top-level
    columns by ``PgVectorV2Client.insert_article``; everything else lands
    in the ``metadata`` JSONB column for later ad-hoc queries.

    Note: image_url is intentionally NOT captured here (Path 2 design).
    Image extraction happens at Transform time so we only do the work
    for articles that actually surface to users (~13% of raw ingest).
    See core2_transform._extract_image_url.
    """
    base: Dict[str, Any] = {
        "title": article.title,
        "category": article.main_category,
        "published_at": article.published_at,
        "url": article.url,
        "author_name": article.author_name,
        "author_email": article.author_email,
        "press": article.press,
        "sub_title": article.sub_title or "",
        "content_preview": article.content_clean[:_CONTENT_PREVIEW_CHARS],
    }
    if article.paper is not None:
        base["paper_number"] = article.paper.paper_number or ""
        base["paper_date"] = article.paper.publish_date or ""
        base["paper_paragraph"] = article.paper.paragraph or ""
    return base


def _is_zero_vector(embedding: List[float], tol: float = 1e-9) -> bool:
    """True when every component is within ``tol`` of zero.

    Defensive check kept after commit ``9d4d657`` (2026-04-29) which made
    ``EmbeddingV2Client.embed_text`` raise ``EmbeddingError`` instead of
    returning ``[0.0] * dim`` on Bedrock failures. The outer
    ``try/except`` in ``_process_one`` now catches that. However, this
    check guards against a future Bedrock API change that legitimately
    returns a near-zero vector (e.g. embedding of an empty string) — such
    rows would poison cosine-distance ranking with NaN distances on
    zero-magnitude vectors (the same trap documented in the test fixture
    ``_embedding``). Treat zero as failure at this layer regardless of
    upstream behavior.
    """
    return all(abs(v) < tol for v in embedding)


# ── Per-article processing (called from asyncio.gather) ──────────────────────


async def _process_one(
    article: S3Article,
    *,
    s3_xml: S3XMLClient,
    embedder: EmbeddingV2Client,
    pg: PgVectorV2Client,
    s3_v2: S3ArticleV2Client,
    embed_semaphore: asyncio.Semaphore,
    db_lock: asyncio.Lock,
) -> Optional[str]:
    """Embed + S3 put + pg insert for one article.

    Returns ``article.nsid`` on success, ``None`` on any failure (logged
    at exception level with full traceback). See module docstring for the
    semaphore/lock rationale.
    """
    try:
        text = _build_embedding_text(article)

        async with embed_semaphore:
            embedding = await asyncio.to_thread(embedder.embed_text, text)

        if _is_zero_vector(embedding):
            # Upstream silently returned zero-vec → Bedrock failed.
            # Raise so the outer except counts this as a failure.
            raise RuntimeError(
                f"Titan V2 returned zero vector for {article.nsid!r} — "
                "Bedrock likely throttled or errored"
            )

        # article_to_dict is pure CPU work — no offload needed.
        article_dict = s3_xml.article_to_dict(article)
        await asyncio.to_thread(
            s3_v2.put_article_file, article.nsid, "original.json", article_dict
        )

        metadata = _build_metadata(article)
        async with db_lock:
            await asyncio.to_thread(
                pg.insert_article, article.nsid, metadata, embedding
            )

        return article.nsid
    except Exception:
        logger.exception(f"Collector failed on article {article.nsid}")
        return None


# ── Handler ──────────────────────────────────────────────────────────────────


@handler_decorator
async def lambda_handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    method = (
        event.get("httpMethod")
        or (event.get("requestContext") or {}).get("http", {}).get("method")
        or "GET"
    )
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    date_str = _extract_date(event)
    logger.info(f"Collector run started for date={date_str}")

    s3_xml = S3XMLClient()
    embedder = EmbeddingV2Client(
        endpoint_url=os.getenv("BEDROCK_RUNTIME_ENDPOINT_URL", "")
    )
    pg = PgVectorV2Client()
    s3_v2 = S3ArticleV2Client()

    all_articles = await s3_xml.get_articles_by_date(date_str)

    action_counts: Dict[str, int] = {"I": 0, "U": 0, "D": 0}
    for a in all_articles:
        action_counts[a.action] = action_counts.get(a.action, 0) + 1

    paper_mode_enabled = feature_flag.is_enabled("collector-paper-mode")
    # paper-mode: action 무관 — 정찰 결과 paragraph='TOP' 의 paper article 87%
    # 가 action=U (online published 후 신문 인쇄판 metadata 추가). action=I
    # only 필터 시 1면 articles 의 100% 누락. legacy mode 만 action=I 유지.
    if paper_mode_enabled:
        inserts = list(all_articles)
    else:
        inserts = [a for a in all_articles if a.action == "I"]
    filter_reasons: Dict[str, int] = {
        "pass": 0,
        "body-too-short": 0,
        "title-garbage": 0,
        "no-paper-element": 0,
        "paragraph-not-TOP": 0,
        "front-page": 0,
    }
    after_garbage: List[S3Article] = []
    for a in inserts:
        ok, reason = _is_collectible(a)
        filter_reasons[reason] = filter_reasons.get(reason, 0) + 1
        if ok:
            after_garbage.append(a)
    garbage_count = len(inserts) - len(after_garbage)
    # 통과분 중 1면 기사 수 — '오늘 1면 0건' 감지용 (spec §5.1)
    front_page_pass = sum(1 for a in after_garbage if _is_front_page(a))
    logger.info(json.dumps({
        "event": "collector_paper_mode_run",
        "target_date": date_str,
        "paper_mode": paper_mode_enabled,
        "total_inserts": len(inserts),
        "paper_pass": filter_reasons["pass"],
        "front_page_pass": front_page_pass,
        "paper_fail_no_element": filter_reasons["no-paper-element"],
        "paper_fail_paragraph_not_TOP": filter_reasons["paragraph-not-TOP"],
        "other_filtered": filter_reasons["body-too-short"] + filter_reasons["title-garbage"],
    }, ensure_ascii=False))
    emit_count(
        "CollectorPaperPass",
        filter_reasons["pass"],
        dimensions={"mode": "paper" if paper_mode_enabled else "legacy"},
    )

    candidate_ids = [a.nsid for a in after_garbage]
    existing = pg.filter_existing_news_ids(candidate_ids)
    new_articles = [a for a in after_garbage if a.nsid not in existing]
    duplicate_count = len(after_garbage) - len(new_articles)

    embed_semaphore = asyncio.Semaphore(_EMBED_CONCURRENCY)
    db_lock = asyncio.Lock()

    results = await asyncio.gather(
        *(
            _process_one(
                a,
                s3_xml=s3_xml,
                embedder=embedder,
                pg=pg,
                s3_v2=s3_v2,
                embed_semaphore=embed_semaphore,
                db_lock=db_lock,
            )
            for a in new_articles
        )
    )

    collected_ids = [r for r in results if r is not None]
    failed_ids = [
        a.nsid for a, r in zip(new_articles, results) if r is None
    ]

    metrics = {
        "date": date_str,
        "total_in_xml": len(all_articles),
        "action_i": action_counts["I"],
        "action_u": action_counts["U"],
        "action_d": action_counts["D"],
        "garbage": garbage_count,
        "duplicates": duplicate_count,
        "attempted": len(new_articles),
        "collected": len(collected_ids),
        "failed": len(failed_ids),
        "failed_ids": failed_ids,
    }
    logger.info(
        f"Collector run complete: {metrics['collected']} collected, "
        f"{metrics['duplicates']} duplicates, "
        f"{metrics['garbage']} garbage, "
        f"{metrics['failed']} failed (date={date_str})"
    )
    return success_response(metrics)
