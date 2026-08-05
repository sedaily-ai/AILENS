"""Unit + integration tests for Core 1 Collector (TASK-2.1).

Tiers
-----
* **Unit**        — pure helpers + handler dispatch. No AWS, no DB.
* **Integration** — live pgvector v2 + live S3 v2 bucket; Bedrock Titan V2
  and the v1 XML feed are **always** mocked (Bedrock for cost, XML so tests
  are reproducible). Requires ``PG_V2_HOST``, ``PG_V2_PASSWORD``, and
  ``S3_ARTICLE_BODY_V2_BUCKET``. Auto-skipped when any is unset.

Run from ``backend/``::

    python3 -m pytest v2/tests/test_core1_collector.py -v -m 'not integration'
    python3 -m pytest v2/tests/test_core1_collector.py -v -m integration
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import random
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from clients.s3_xml_client import PaperInfo, S3Article

from v2.handlers import core1_collector
from v2.handlers.core1_collector import (
    _MIN_BODY_LENGTH,
    _build_embedding_text,
    _build_metadata,
    _extract_date,
    _is_collectible,
    _is_front_page,
    _is_zero_vector,
    _passes_paper_filter,
    _today_kst,
    lambda_handler,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Shared fixtures / helpers
# =============================================================================

IT_PREFIX = "test_v2_2_1_"


def _make_article(
    nsid: str = "test_v2_2_1_001",
    title: str = "삼성전자 1분기 실적 발표",
    action: str = "I",
    content_clean: Optional[str] = None,
    **overrides: Any,
) -> S3Article:
    """Build an ``S3Article`` fixture with defaults tuned for Core 1 tests.

    Default ``content_clean`` is 400 chars — above ``_MIN_BODY_LENGTH`` so
    the article passes the garbage filter by default. Pass
    ``content_clean=``... to override.
    """
    body = content_clean if content_clean is not None else "본문텍스트입니다. " * 50
    article = S3Article(
        nsid=nsid,
        action=action,
        item_type="text",
        press="서울경제",
        title=title,
        sub_title=None,
        content_raw=body,
        content_clean=body,
        content_blocks=[],
        content_images=[],
        author="홍길동 기자(hong@sedaily.com)",
        author_name="홍길동 기자",
        author_email="hong@sedaily.com",
        date="2026-04-20",
        time="10:00:00",
        published_at="2026-04-20T10:00:00+09:00",
        categories=[],
        main_category="경제",
        url=f"https://www.sedaily.com/NewsView/{nsid}",
        images=[],
        related_news=[],
        leverage=[],
        push=None,
        is_breaking_news=False,
        paper=None,
    )
    for k, v in overrides.items():
        setattr(article, k, v)
    return article


def _deterministic_embedding(text: str) -> List[float]:
    """SHA-256-seeded 1024-dim vector in [-1, 1]. Non-zero by construction.

    Replaces Bedrock Titan V2 calls in integration tests. Same text →
    same vector so assertions are reproducible across runs. Full
    [-1, 1] range keeps cosine distance between different articles
    non-trivial — TASK-1.3 found that uniform/parallel vectors collapse
    to distance 0, masking ranking bugs.
    """
    seed_bytes = hashlib.sha256(text.encode("utf-8")).digest()[:8]
    seed = int.from_bytes(seed_bytes, "big") % (2**32)
    rng = random.Random(seed)
    return [rng.uniform(-1.0, 1.0) for _ in range(1024)]


# =============================================================================
# Unit — paper filter (collector-paper-mode 확대: TOP OR 1면)
# =============================================================================


def _paper(paper_number: str, paragraph: str) -> PaperInfo:
    return PaperInfo(
        publish_date="20260723",
        number="",
        print_number="35",
        paper_number=paper_number,
        paragraph=paragraph,
        position="",
        detail_position="",
    )


def _enable_paper_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        core1_collector.feature_flag,
        "is_enabled",
        lambda name: name == "collector-paper-mode",
    )


def _disable_paper_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    """모든 feature flag 를 끈 상태로 고정한다.

    끄지 않으면 ``feature_flag.is_enabled`` 가 **실제 DynamoDB** 를 읽어
    운영 플래그 상태를 그대로 가져온다(``collector-paper-mode`` 는 현재
    운영에서 enabled). 그러면 ``paper`` 가 없는 fixture 가
    ``no-paper-element`` 로 거부돼, garbage 필터를 검증하려던 테스트가
    엉뚱한 이유로 실패한다 — 테스트 결과가 운영 설정에 좌우된다.
    """
    monkeypatch.setattr(
        core1_collector.feature_flag, "is_enabled", lambda name: False
    )


def test_paper_mode_accepts_top_article_on_any_page(monkeypatch) -> None:
    _enable_paper_mode(monkeypatch)
    ok, reason = _passes_paper_filter(_make_article(paper=_paper("3", "TOP")))
    assert ok and reason == "paragraph-TOP"


def test_paper_mode_accepts_front_page_non_top(monkeypatch) -> None:
    _enable_paper_mode(monkeypatch)
    ok, reason = _passes_paper_filter(_make_article(paper=_paper("1", "9")))
    assert ok and reason == "front-page"


def test_paper_mode_strips_whitespace_in_paper_number(monkeypatch) -> None:
    _enable_paper_mode(monkeypatch)
    ok, _ = _passes_paper_filter(_make_article(paper=_paper(" 1 ", "9")))
    assert ok


def test_paper_mode_rejects_non_front_page_sub_article(monkeypatch) -> None:
    _enable_paper_mode(monkeypatch)
    ok, reason = _passes_paper_filter(_make_article(paper=_paper("2", "9")))
    assert not ok and reason == "paragraph-not-TOP"


def test_paper_mode_rejects_online_only(monkeypatch) -> None:
    _enable_paper_mode(monkeypatch)
    ok, reason = _passes_paper_filter(_make_article(paper=None))
    assert not ok and reason == "no-paper-element"


def test_is_front_page_true_only_for_page_1() -> None:
    assert _is_front_page(_make_article(paper=_paper("1", "9")))
    assert _is_front_page(_make_article(paper=_paper("1", "TOP")))
    assert not _is_front_page(_make_article(paper=_paper("2", "TOP")))
    assert not _is_front_page(_make_article(paper=None))


# =============================================================================
# Unit — garbage filter
# =============================================================================


# _is_collectible 은 (ok, reason) 튜플을 반환한다. reason 까지 단언해야
# "거부는 됐는데 의도한 이유가 아닌" 경우를 잡을 수 있다 — 실제로 paper 필터가
# 끼어들어 garbage 필터가 검증되지 않던 기간이 있었다.


def test_rejects_body_just_below_min_length(monkeypatch) -> None:
    _disable_paper_mode(monkeypatch)
    article = _make_article(content_clean="가" * (_MIN_BODY_LENGTH - 1))
    assert _is_collectible(article) == (False, "body-too-short")


def test_accepts_body_at_exact_min_length(monkeypatch) -> None:
    _disable_paper_mode(monkeypatch)
    article = _make_article(content_clean="가" * _MIN_BODY_LENGTH)
    assert _is_collectible(article) == (True, "pass")


def test_rejects_personnel_notice_title(monkeypatch) -> None:
    _disable_paper_mode(monkeypatch)
    article = _make_article(
        title="[인사] 삼성전자 임원 인사", content_clean="본문" * 200
    )
    assert _is_collectible(article) == (False, "title-garbage")


def test_rejects_obituary_title(monkeypatch) -> None:
    _disable_paper_mode(monkeypatch)
    article = _make_article(
        title="[부고] 김아무개 별세", content_clean="본문" * 200
    )
    assert _is_collectible(article) == (False, "title-garbage")


def test_rejects_marker_anywhere_in_title(monkeypatch) -> None:
    # Marker as substring (not just prefix) is still filtered.
    _disable_paper_mode(monkeypatch)
    article = _make_article(
        title="임원 인사 [인사] 공시", content_clean="본문" * 200
    )
    assert _is_collectible(article) == (False, "title-garbage")


def test_accepts_normal_article(monkeypatch) -> None:
    _disable_paper_mode(monkeypatch)
    article = _make_article(title="삼성전자 실적 발표", content_clean="본문" * 200)
    assert _is_collectible(article) == (True, "pass")


def test_body_length_checked_before_title_garbage(monkeypatch) -> None:
    """짧은 본문 + garbage 제목이면 body 사유가 먼저 나온다 — 검사 순서 고정."""
    _disable_paper_mode(monkeypatch)
    article = _make_article(title="[부고] 김아무개 별세", content_clean="짧음")
    assert _is_collectible(article) == (False, "body-too-short")


# =============================================================================
# Unit — embedding text construction
# =============================================================================


def test_embedding_text_combines_title_and_body() -> None:
    article = _make_article(title="제목", content_clean="본문")
    assert _build_embedding_text(article) == "제목\n\n본문"


def test_embedding_text_truncates_long_body_at_6000_chars() -> None:
    long_body = "가" * 7000
    article = _make_article(title="T", content_clean=long_body)
    text = _build_embedding_text(article)
    assert text == "T\n\n" + "가" * 6000


def test_embedding_text_preserves_short_body() -> None:
    article = _make_article(title="T", content_clean="짧은본문")
    assert _build_embedding_text(article) == "T\n\n짧은본문"


# =============================================================================
# Unit — date extraction
# =============================================================================


def test_extract_date_defaults_to_today_kst_when_paper_mode_off(monkeypatch) -> None:
    """legacy mode 기본값은 오늘 KST.

    플래그를 고정하지 않으면 실제 DynamoDB 의 운영 값을 읽어 어제(D-1)로
    갈라진다 — 아래 테스트가 그 경로를 따로 덮는다.
    """
    _disable_paper_mode(monkeypatch)
    with patch(
        "v2.handlers.core1_collector._today_kst", return_value="20260420"
    ):
        assert _extract_date({}) == "20260420"


def test_extract_date_defaults_to_yesterday_kst_when_paper_mode_on(monkeypatch) -> None:
    """paper mode 기본값은 어제 KST — paper 기사가 D-1 daily-xml 에 실린다."""
    _enable_paper_mode(monkeypatch)
    with patch(
        "v2.handlers.core1_collector._yesterday_kst", return_value="20260419"
    ):
        assert _extract_date({}) == "20260419"


def test_extract_date_uses_explicit_event_date() -> None:
    assert _extract_date({"date": "20260101"}) == "20260101"


def test_extract_date_falls_back_to_detail_date() -> None:
    assert _extract_date({"detail": {"date": "20260201"}}) == "20260201"


def test_extract_date_prefers_top_level_over_detail() -> None:
    event = {"date": "20260101", "detail": {"date": "20260202"}}
    assert _extract_date(event) == "20260101"


def test_extract_date_handles_null_detail() -> None:
    """EventBridge sometimes passes ``detail=None`` — must not AttributeError."""
    assert _extract_date({"detail": None, "date": "20260303"}) == "20260303"


def test_today_kst_shape() -> None:
    """Smoke test: returns an 8-digit string. Exact value depends on wall clock."""
    today = _today_kst()
    assert len(today) == 8
    assert today.isdigit()


# =============================================================================
# Unit — zero-vector sanity check
# =============================================================================


def test_is_zero_vector_all_zeros() -> None:
    assert _is_zero_vector([0.0] * 1024) is True


def test_is_zero_vector_one_nonzero_is_false() -> None:
    v = [0.0] * 1024
    v[512] = 1e-5
    assert _is_zero_vector(v) is False


def test_is_zero_vector_below_tolerance_counted_as_zero() -> None:
    assert _is_zero_vector([1e-12] * 1024) is True


def test_is_zero_vector_realistic_embedding_is_nonzero() -> None:
    assert _is_zero_vector(_deterministic_embedding("hello world")) is False


# =============================================================================
# Unit — metadata builder
# =============================================================================


def test_build_metadata_promotes_title_category_published_at() -> None:
    article = _make_article(
        title="제목", main_category="경제",
        published_at="2026-04-20T10:00:00+09:00",
    )
    meta = _build_metadata(article)
    assert meta["title"] == "제목"
    assert meta["category"] == "경제"
    assert meta["published_at"] == "2026-04-20T10:00:00+09:00"


def test_build_metadata_includes_author_and_url() -> None:
    meta = _build_metadata(_make_article())
    assert meta["author_name"] == "홍길동 기자"
    assert meta["author_email"] == "hong@sedaily.com"
    assert meta["url"].startswith("https://www.sedaily.com/")


def test_build_metadata_handles_empty_sub_title() -> None:
    article = _make_article()
    article.sub_title = None
    assert _build_metadata(article)["sub_title"] == ""


def test_build_metadata_includes_content_preview_truncated_to_200() -> None:
    """Selector Lambda relies on metadata.content_preview to score articles
    without re-fetching the S3 XML. 200 chars matches v1's
    step1_select.CONTENT_PREVIEW_CHARS so Nova Lite prompt budget is preserved."""
    long_body = "한" * 500
    article = _make_article(content_clean=long_body)
    meta = _build_metadata(article)
    assert "content_preview" in meta
    assert meta["content_preview"] == "한" * 200
    assert len(meta["content_preview"]) == 200


def test_build_metadata_content_preview_keeps_short_body_intact() -> None:
    body = "짧은 본문" * 60  # 360 chars — over _MIN_BODY_LENGTH (300), under 200
    article = _make_article(content_clean=body)
    preview = _build_metadata(article)["content_preview"]
    # 360 char body truncated to 200
    assert len(preview) == 200
    assert preview == body[:200]


def test_build_metadata_content_preview_handles_under_200() -> None:
    short_body = "짧" * 350  # 350 chars (still over MIN 300)
    article = _make_article(content_clean=short_body)
    preview = _build_metadata(article)["content_preview"]
    assert len(preview) == 200  # truncated; never exceeds 200


# =============================================================================
# Unit — handler dispatch (sync entry; decorator wraps asyncio.run internally)
# =============================================================================


def test_options_returns_200_with_cors_headers() -> None:
    response = lambda_handler({"httpMethod": "OPTIONS"}, None)
    assert response["statusCode"] == 200
    assert "Access-Control-Allow-Origin" in response["headers"]


# =============================================================================
# Integration — live pgvector + live S3 v2 bucket (Bedrock/XML mocked)
# =============================================================================

_INTEGRATION_ENVS = ("PG_V2_HOST", "PG_V2_PASSWORD", "S3_ARTICLE_BODY_V2_BUCKET")
_INTEGRATION_READY = all(os.getenv(e) for e in _INTEGRATION_ENVS)


def _mock_article_to_dict(article: S3Article) -> Dict[str, Any]:
    """Minimal S3 payload for integration assertions.

    We don't use the real ``S3XMLClient.article_to_dict`` here because it
    reads many fields that our fixtures set to empty — the minimal
    projection keeps the S3 write size small and tests readable.
    """
    return {
        "nsid": article.nsid,
        "news_id": article.nsid,
        "title_ko": article.title,
        "content_ko": article.content_clean,
        "category": article.main_category,
        "published_at": article.published_at,
    }


def _invoke_with_mocked_upstream(
    articles: List[S3Article], date_str: str = "20260420"
) -> Dict[str, Any]:
    """Invoke ``lambda_handler`` with XML + Bedrock mocked, S3/pg live."""
    with patch(
        "v2.handlers.core1_collector.S3XMLClient"
    ) as MockXML, patch(
        "v2.handlers.core1_collector.EmbeddingV2Client"
    ) as MockEmb:
        MockXML.return_value.get_articles_by_date = AsyncMock(
            return_value=articles
        )
        MockXML.return_value.article_to_dict = _mock_article_to_dict
        MockEmb.return_value.embed_text = lambda t: _deterministic_embedding(t)

        return lambda_handler({"date": date_str}, None)


@pytest.fixture()
def live_clients():
    """Session-lite: real pg + S3 clients with pre/post prefix wipe."""
    if not _INTEGRATION_READY:
        pytest.skip(
            f"integration test requires {', '.join(_INTEGRATION_ENVS)}"
        )
    import boto3

    from v2.clients.pgvector_v2_client import PgVectorV2Client
    from v2.clients.s3_article_v2_client import S3ArticleV2Client

    pg = PgVectorV2Client()
    s3_v2 = S3ArticleV2Client()
    bucket = os.environ["S3_ARTICLE_BODY_V2_BUCKET"]
    s3 = boto3.client("s3", region_name="us-east-1")

    def _wipe() -> None:
        try:
            pg.conn.run(
                f"DELETE FROM articles WHERE news_id LIKE '{IT_PREFIX}%'"
            )
        except Exception:
            logger.exception("pg wipe failed (ignored)")
        try:
            resp = s3.list_objects_v2(
                Bucket=bucket, Prefix=f"articles/{IT_PREFIX}"
            )
            for obj in resp.get("Contents", []):
                s3.delete_object(Bucket=bucket, Key=obj["Key"])
        except Exception:
            logger.exception("s3 wipe failed (ignored)")

    _wipe()
    try:
        yield {"pg": pg, "s3": s3, "bucket": bucket}
    finally:
        _wipe()
        pg.close()


@pytest.mark.integration
def test_integration_inserts_three_new_articles(live_clients) -> None:
    articles = [
        _make_article(
            nsid=f"{IT_PREFIX}new_{i:03d}",
            title=f"테스트 기사 {i}",
            content_clean="본문 " * 200,
        )
        for i in range(3)
    ]

    result = _invoke_with_mocked_upstream(articles)

    assert result["statusCode"] == 200
    body = json.loads(result["body"])
    assert body["collected"] == 3
    assert body["duplicates"] == 0
    assert body["failed"] == 0
    assert body["failed_ids"] == []

    # pgvector: each news_id present with status 'raw'
    pg = live_clients["pg"]
    for i in range(3):
        rows = pg.conn.run(
            "SELECT news_id, status FROM articles WHERE news_id = :n",
            n=f"{IT_PREFIX}new_{i:03d}",
        )
        assert len(rows) == 1
        assert rows[0][1] == "raw"

    # S3: each has an original.json
    s3, bucket = live_clients["s3"], live_clients["bucket"]
    for i in range(3):
        head = s3.head_object(
            Bucket=bucket,
            Key=f"articles/{IT_PREFIX}new_{i:03d}/original.json",
        )
        assert head["ContentType"] == "application/json"


@pytest.mark.integration
def test_integration_skips_preexisting_news_ids(live_clients) -> None:
    pg = live_clients["pg"]
    # Pre-insert one article so dedup sees it as existing
    pg.insert_article(
        news_id=f"{IT_PREFIX}dup_000",
        metadata={"title": "이미 있음"},
        embedding=_deterministic_embedding("pre-existing"),
    )

    articles = [
        _make_article(
            nsid=f"{IT_PREFIX}dup_000", title="중복", content_clean="본문 " * 100
        ),
        _make_article(
            nsid=f"{IT_PREFIX}dup_001", title="신규 1", content_clean="본문 " * 100
        ),
        _make_article(
            nsid=f"{IT_PREFIX}dup_002", title="신규 2", content_clean="본문 " * 100
        ),
    ]

    result = _invoke_with_mocked_upstream(articles)
    body = json.loads(result["body"])
    assert body["duplicates"] == 1
    assert body["collected"] == 2
    assert body["failed"] == 0


@pytest.mark.integration
def test_integration_filters_garbage_and_counts_actions(live_clients) -> None:
    articles = [
        _make_article(
            nsid=f"{IT_PREFIX}mix_000", title="정상", content_clean="본문 " * 200
        ),
        # too short → garbage
        _make_article(
            nsid=f"{IT_PREFIX}mix_001", title="짧음", content_clean="짧"
        ),
        # personnel → garbage
        _make_article(
            nsid=f"{IT_PREFIX}mix_002",
            title="[인사] 승진",
            content_clean="본문 " * 200,
        ),
        # action U → counted but not stored
        _make_article(
            nsid=f"{IT_PREFIX}mix_003",
            title="업데이트",
            action="U",
            content_clean="본문 " * 200,
        ),
        # action D → counted but not stored
        _make_article(
            nsid=f"{IT_PREFIX}mix_004",
            title="삭제",
            action="D",
            content_clean="본문 " * 200,
        ),
        _make_article(
            nsid=f"{IT_PREFIX}mix_005", title="정상 2", content_clean="본문 " * 200
        ),
    ]

    result = _invoke_with_mocked_upstream(articles)
    body = json.loads(result["body"])

    assert body["action_i"] == 4
    assert body["action_u"] == 1
    assert body["action_d"] == 1
    assert body["garbage"] == 2   # short + [인사]
    assert body["collected"] == 2  # mix_000 + mix_005
    assert body["failed"] == 0

    # Confirm U/D articles were NOT stored in pg
    pg = live_clients["pg"]
    for suffix in ("003", "004"):
        rows = pg.conn.run(
            "SELECT news_id FROM articles WHERE news_id = :n",
            n=f"{IT_PREFIX}mix_{suffix}",
        )
        assert len(rows) == 0


@pytest.mark.integration
def test_integration_empty_xml_returns_zero_counts(live_clients) -> None:
    result = _invoke_with_mocked_upstream([])
    body = json.loads(result["body"])
    assert body["total_in_xml"] == 0
    assert body["collected"] == 0
    assert body["duplicates"] == 0
    assert body["garbage"] == 0
    assert body["failed"] == 0
    assert body["attempted"] == 0
