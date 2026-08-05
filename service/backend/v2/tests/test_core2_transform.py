"""Unit + integration tests for Core 2 Transform Lambda (TASK-2.3).

Tiers
-----
* **Unit**        — all external clients mocked (``PgVectorV2Client``,
  ``TransformV2Service``, ``EmbeddingV2Client``, ``S3ArticleV2Client``).
  No AWS, no DB.
* **Integration** — live pgvector v2; Bedrock (transform + embed) and
  S3 are still mocked for cost + reproducibility. Auto-skipped when
  ``PG_V2_HOST`` / ``PG_V2_PASSWORD`` unset.

Run from ``backend/``::

    python3 -m pytest v2/tests/test_core2_transform.py -v -m 'not integration'
    python3 -m pytest v2/tests/test_core2_transform.py -v -m integration
"""
from __future__ import annotations

import json
import logging
import os
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# =============================================================================
# Helpers — builders for mocked client instances + context
# =============================================================================


# Default values for the auto-generated queue rows in _install_client_mocks.
# Tests that need to assert on these can import them; tests building queue
# rows directly via _make_queue_row override as needed.
_DEFAULT_SELECTION_DATE = date(2026, 4, 27)
_DEFAULT_SCORED_AT = datetime(2026, 4, 27, 0, 0, 0, tzinfo=timezone.utc)


def _make_context(remaining_ms: int = 900_000) -> MagicMock:
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = remaining_ms
    return ctx


def _make_raw_row(news_id: str, title: str = "t") -> Dict[str, Any]:
    return {
        "news_id": news_id,
        "status": "raw",
        "title": title,
        "category": "경제",
        "published_at": "2026-04-24T00:00:00+09:00",
        "metadata": {},
        "created_at": None,
        "updated_at": None,
    }


def _make_original_json(news_id: str) -> Dict[str, Any]:
    """S3 original.json shape matching ``s3_xml_client.article_to_dict``."""
    return {
        "nsid": news_id,
        "news_id": news_id,
        "title_ko": f"제목 {news_id}",
        "sub_title_ko": "부제",
        "content_ko": "본문 " * 100,
        "category": "경제",
    }


def _make_version(group: str) -> Dict[str, Any]:
    return {
        "title": f"{group} 제목",
        "subtitle": f"{group} 부제",
        "body": f"{group} 본문",
        "key_points": [f"{group} 포인트 1"],
        "closing_line": f"{group} 마무리",
    }


def _make_full_versions() -> Dict[str, Any]:
    return {g: _make_version(g) for g in ("NT", "NF", "ST", "SF")}


def _make_usage(cache_read: int = 0, cache_creation: int = 0) -> Dict[str, int]:
    return {
        "input_tokens": 9000,
        "output_tokens": 1200,
        "cache_read_input_tokens": cache_read,
        "cache_creation_input_tokens": cache_creation,
    }


def _install_client_mocks(
    raw_rows: List[Dict[str, Any]],
    transform_result: Optional[Dict[str, Any]] = None,
    transform_exception: Optional[Exception] = None,
    validation_passed: bool = True,
    validation_issues: Optional[List[Dict[str, str]]] = None,
    validation_failure_count: int = 1,
) -> Dict[str, Any]:
    """Construct patches + instance mocks for all four v2 clients + validator.

    TASK-5 update: ``raw_rows`` is now interpreted as the Selector-side
    queue (``article_selections`` rows JOIN ``articles``). Each ``raw_row``
    is automatically expanded into 4 queue entries (one per MBTI) so
    existing tests written for "all 4 MBTI" still work without rewriting.
    Tests that need a partial-MBTI subset construct ``queue_rows``
    directly via ``_make_queue_row`` and pass via the ``queue_rows`` kwarg
    (added below).

    Returns a dict of ``{class_patcher, instance}`` per client plus a
    combined ``context_manager_stack`` caller chains into a ``with
    ExitStack`` block. Kept explicit (no fixture magic) so per-test setup
    reads top-to-bottom.
    """
    pg_instance = MagicMock()
    # TASK-5: Transform handler now polls get_transform_queue, not
    # get_articles_by_status. Auto-expand each "raw row" into 4 MBTI
    # queue entries so existing 4-MBTI tests don't need to be rewritten.
    queue_rows = []
    for r in raw_rows:
        for mbti in ("NT", "NF", "ST", "SF"):
            queue_rows.append({
                "selection_id": f"sel-{r['news_id']}-{mbti}",
                "news_id": r["news_id"],
                "mbti_type": mbti,
                "selection_date": _DEFAULT_SELECTION_DATE,
                "composite_score": 7.5,
                "scored_at": _DEFAULT_SCORED_AT,
                "title": r.get("title", ""),
                "category": r.get("category", ""),
                "published_at": r.get("published_at"),
                "article_metadata": {},
            })
    pg_instance.get_transform_queue.return_value = queue_rows
    # Backward-compat: leave get_articles_by_status defined as no-op return
    # so any stray test referring to it doesn't NoneType-crash.
    pg_instance.get_articles_by_status.return_value = raw_rows
    pg_instance.insert_article_version.return_value = "version-uuid"
    pg_instance.update_article_status.return_value = None
    pg_instance.mark_transformed.return_value = None
    # Phase 5 retry-limit (`d15ec37`): validation-failure 분기가 그룹마다
    # increment_validation_failure_count 를 부르고 그 반환값을 int 임계값과
    # `>=` 비교한다. 설정하지 않으면 MagicMock 이 돌아와 비교에서 TypeError 가
    # 나고, 핸들러가 그것을 transform_error 로 삼켜 validation-failure 이벤트
    # 자체가 방출되지 않는다. 기본은 임계값(5) 아래인 1 — 재시도 한도 도달
    # 분기를 타려는 테스트는 ``validation_failure_count`` 로 올린다.
    pg_instance.increment_validation_failure_count.return_value = (
        validation_failure_count
    )
    pg_instance.force_transformed_at_for_retry_limit.return_value = True

    transform_instance = MagicMock()
    if transform_exception is not None:
        transform_instance.transform_article_for_groups = AsyncMock(
            side_effect=transform_exception
        )
        # Keep the older method too so legacy tests calling it don't break.
        transform_instance.transform_article = AsyncMock(side_effect=transform_exception)
    else:
        default_result = transform_result or {
            "versions": _make_full_versions(),
            "usage": _make_usage(),
            "failed_groups": [],
        }
        # Ensure failed_groups key exists even if caller passed an old-style
        # dict without it.
        if "failed_groups" not in default_result:
            default_result = {**default_result, "failed_groups": []}
        transform_instance.transform_article_for_groups = AsyncMock(
            return_value=default_result
        )
        transform_instance.transform_article = AsyncMock(return_value=default_result)

    embed_instance = MagicMock()
    embed_instance.embed_text.return_value = [0.01] * 1024

    s3_instance = MagicMock()
    s3_instance.get_article_file.side_effect = (
        lambda news_id, filename: _make_original_json(news_id)
    )
    s3_instance.put_article_file.return_value = "s3://mock/put"

    # Validator mock — configurable pass/fail. Real validator tests live in
    # test_validator.py; here we just stub the call so handler integration
    # tests don't hit Bedrock.
    from v2.core2.validator import ValidationResult

    validation_result = ValidationResult(
        passed=validation_passed,
        issues=validation_issues or [],
        ai_check_used=True,
    )
    validate_mock = AsyncMock(return_value=validation_result)

    return {
        "pg": pg_instance,
        "transform_svc": transform_instance,
        "embed": embed_instance,
        "s3": s3_instance,
        "validate": validate_mock,
    }


def _patched_handler_call(
    event: Dict[str, Any],
    context: Optional[MagicMock],
    instances: Dict[str, Any],
):
    """Call ``lambda_handler`` with all four client constructors + validator patched."""
    with patch(
        "v2.handlers.core2_transform.PgVectorV2Client", return_value=instances["pg"]
    ), patch(
        "v2.handlers.core2_transform.TransformV2Service",
        return_value=instances["transform_svc"],
    ), patch(
        "v2.handlers.core2_transform.EmbeddingV2Client", return_value=instances["embed"]
    ), patch(
        "v2.handlers.core2_transform.S3ArticleV2Client", return_value=instances["s3"]
    ), patch(
        "v2.handlers.core2_transform.validate_versions", new=instances["validate"]
    ):
        from v2.handlers.core2_transform import lambda_handler

        return lambda_handler(event, context)


# =============================================================================
# Unit — handler dispatch
# =============================================================================


def test_v2_2_3_options_returns_cors_headers() -> None:
    from v2.handlers.core2_transform import lambda_handler

    response = lambda_handler({"httpMethod": "OPTIONS"}, None)
    assert response["statusCode"] == 200
    assert "Access-Control-Allow-Origin" in response["headers"]


def test_v2_2_3_empty_batch_returns_zero_without_bedrock_init() -> None:
    """Empty pg batch → fast return, never touches TransformV2Service / Embed."""
    instances = _install_client_mocks(raw_rows=[])
    response = _patched_handler_call(
        {"httpMethod": "POST"}, _make_context(), instances
    )

    body = json.loads(response["body"])
    assert body["processed"] == 0
    assert body["empty"] is True
    # TransformV2Service must not be instantiated on empty batch (cost + init
    # time saver). ``_install_client_mocks`` created the instance mock but
    # the handler's ``TransformV2Service(...)`` call never ran, so neither
    # did any method on the instance.
    instances["transform_svc"].transform_article.assert_not_awaited()
    instances["embed"].embed_text.assert_not_called()


def test_v2_2_3_full_success_marks_transformed_and_inserts_4_versions() -> None:
    instances = _install_client_mocks(
        raw_rows=[_make_raw_row("test_v2_2_3_art1")]
    )
    response = _patched_handler_call(
        {"httpMethod": "POST"}, _make_context(), instances
    )

    body = json.loads(response["body"])
    assert body["completed_articles"] == 1
    assert body["failed_articles"] == 0
    assert body["skipped_articles"] == 0
    assert body["completed_ids"] == ["test_v2_2_3_art1"]

    # 4 versions inserted (one per MBTI group)
    assert instances["pg"].insert_article_version.call_count == 4
    inserted_groups = {
        call.args[1] for call in instances["pg"].insert_article_version.call_args_list
    }
    assert inserted_groups == {"NT", "NF", "ST", "SF"}

    # TASK-5: success no longer calls update_article_status('transformed').
    # Truth-source for "ready" is article_selections.transformed_at, set by
    # mark_transformed × N (one per successful MBTI group).
    transformed_calls = [
        c for c in instances["pg"].update_article_status.call_args_list
        if len(c.args) >= 2 and c.args[1] == "transformed"
    ]
    assert transformed_calls == [], (
        "update_article_status('transformed') should NOT be called in TASK-5 flow"
    )
    assert instances["pg"].mark_transformed.call_count == 4
    marked_groups = {
        call.args[1] if len(call.args) >= 2 else call.kwargs.get("mbti_type")
        for call in instances["pg"].mark_transformed.call_args_list
    }
    assert marked_groups == {"NT", "NF", "ST", "SF"}

    # 4 S3 puts (version_NT.json, ..., version_SF.json) + 0 gets beyond
    # the original fetch — actually 1 get (original.json).
    assert instances["s3"].put_article_file.call_count == 4
    put_filenames = {
        call.args[1] for call in instances["s3"].put_article_file.call_args_list
    }
    assert put_filenames == {
        "version_NT.json",
        "version_NF.json",
        "version_ST.json",
        "version_SF.json",
    }

    # 4 embeddings (one per version body)
    assert instances["embed"].embed_text.call_count == 4


def test_v2_2_3_partial_success_marks_partial_failure_log_no_status_change() -> None:
    """TASK-5 (was 'partial_success_marks_failed'): partial Bedrock success
    is non-fatal. 3 of 4 groups succeed → those 3 get inserted + marked
    transformed; the 4th is logged as transform_partial_failure and stays
    transformed_at=NULL (Selection row still selected=TRUE → next fire retries).
    Article-level status NOT changed (Q4=B: 'failed' only on full failure).
    """
    partial_versions = {
        g: _make_version(g) for g in ("NT", "NF", "ST")  # SF missing
    }
    instances = _install_client_mocks(
        raw_rows=[_make_raw_row("test_v2_2_3_art_partial")],
        transform_result={
            "versions": partial_versions,
            "usage": _make_usage(),
            "failed_groups": ["SF"],
        },
    )

    response = _patched_handler_call(
        {"httpMethod": "POST"}, _make_context(), instances
    )

    body = json.loads(response["body"])
    # Article-group level: this article succeeded (≥1 MBTI ok)
    assert body["completed_articles"] == 1
    assert body["failed_articles"] == 0

    # 3 versions inserted (NT/NF/ST), SF skipped
    assert instances["pg"].insert_article_version.call_count == 3
    inserted_groups = {
        call.args[1] for call in instances["pg"].insert_article_version.call_args_list
    }
    assert inserted_groups == {"NT", "NF", "ST"}

    # mark_transformed called 3 times (only successful groups)
    assert instances["pg"].mark_transformed.call_count == 3

    # update_article_status('failed') NOT called — partial success ≠ article failure
    failed_status_calls = [
        c for c in instances["pg"].update_article_status.call_args_list
        if len(c.args) >= 2 and c.args[1] == "failed"
    ]
    assert failed_status_calls == []


def test_v2_2_3_total_failure_marks_failed() -> None:
    """transform_article raises → handler catches + marks failed + logs error."""
    instances = _install_client_mocks(
        raw_rows=[_make_raw_row("test_v2_2_3_art_err")],
        transform_exception=RuntimeError("Bedrock validation failed"),
    )

    response = _patched_handler_call(
        {"httpMethod": "POST"}, _make_context(), instances
    )

    body = json.loads(response["body"])
    assert body["failed_articles"] == 1
    assert body["completed_articles"] == 0

    instances["pg"].insert_article_version.assert_not_called()
    instances["pg"].mark_transformed.assert_not_called()
    instances["pg"].update_article_status.assert_called_with(
        "test_v2_2_3_art_err", "failed"
    )


def test_v2_2_3_article_semaphore_uses_configured_concurrency() -> None:
    """Handler must cap in-flight articles at ``ARTICLE_CONCURRENCY``.

    Patching ``asyncio.Semaphore`` is the cleanest way to assert the cap
    without introducing a timing-sensitive stress test (which would be
    flaky on loaded CI machines).
    """
    from v2.handlers.core2_transform import ARTICLE_CONCURRENCY

    instances = _install_client_mocks(
        raw_rows=[_make_raw_row("test_v2_2_3_art_sem")]
    )
    with patch("v2.handlers.core2_transform.asyncio.Semaphore") as mock_sem:
        mock_sem.return_value = MagicMock(
            __aenter__=AsyncMock(), __aexit__=AsyncMock()
        )
        _patched_handler_call({"httpMethod": "POST"}, _make_context(), instances)
        mock_sem.assert_called_once_with(ARTICLE_CONCURRENCY)


def test_v2_2_3_deadline_check_skips_remaining_waves() -> None:
    """Low remaining time → first wave processes, rest skipped."""
    # 10 articles → 2 waves of 5. context.remaining drops between waves.
    articles = [_make_raw_row(f"test_v2_2_3_deadline_{i}") for i in range(10)]
    instances = _install_client_mocks(raw_rows=articles)

    # First call: high time (wave 1 proceeds). Second call: low time (wave
    # 2 skipped). ``side_effect`` is a list consumed in order.
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.side_effect = [900_000, 50_000]

    response = _patched_handler_call({"httpMethod": "POST"}, ctx, instances)

    body = json.loads(response["body"])
    assert body["completed_articles"] == 5  # wave 1 succeeded
    assert body["skipped_articles"] == 5  # wave 2 skipped
    assert body["failed_articles"] == 0


def test_v2_2_3_logs_transform_complete_with_cache_metrics(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Happy path emits 4 ``transform_complete`` events with usage fields."""
    instances = _install_client_mocks(
        raw_rows=[_make_raw_row("test_v2_2_3_art_log")],
        transform_result={
            "versions": _make_full_versions(),
            "usage": _make_usage(cache_read=3100, cache_creation=0),
        },
    )

    with caplog.at_level(logging.INFO, logger="v2.handlers.core2_transform"):
        _patched_handler_call(
            {"httpMethod": "POST"}, _make_context(), instances
        )

    events = [
        json.loads(rec.message)
        for rec in caplog.records
        if rec.message.startswith("{")
    ]
    complete_events = [e for e in events if e.get("event") == "transform_complete"]
    assert len(complete_events) == 4
    groups_logged = {e["mbti_group"] for e in complete_events}
    assert groups_logged == {"NT", "NF", "ST", "SF"}
    for e in complete_events:
        assert e["cache_read_input_tokens"] == 3100
        assert e["cache_hit"] is True
        assert e["news_id"] == "test_v2_2_3_art_log"
        assert "latency_ms" in e


def test_v2_2_3_logs_transform_error_on_exception(
    caplog: pytest.LogCaptureFixture,
) -> None:
    instances = _install_client_mocks(
        raw_rows=[_make_raw_row("test_v2_2_3_art_errlog")],
        transform_exception=ValueError("boom"),
    )
    with caplog.at_level(logging.ERROR, logger="v2.handlers.core2_transform"):
        _patched_handler_call(
            {"httpMethod": "POST"}, _make_context(), instances
        )
    error_events = [
        json.loads(rec.message)
        for rec in caplog.records
        if rec.message.startswith("{") and '"transform_error"' in rec.message
    ]
    assert len(error_events) == 1
    assert error_events[0]["news_id"] == "test_v2_2_3_art_errlog"
    assert error_events[0]["error_type"] == "ValueError"
    assert error_events[0]["error_message"] == "boom"


def test_v2_2_3_logs_deadline_skip_event(
    caplog: pytest.LogCaptureFixture,
) -> None:
    articles = [_make_raw_row(f"test_v2_2_3_skip_{i}") for i in range(10)]
    instances = _install_client_mocks(raw_rows=articles)
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.side_effect = [900_000, 50_000]

    with caplog.at_level(logging.WARNING, logger="v2.handlers.core2_transform"):
        _patched_handler_call({"httpMethod": "POST"}, ctx, instances)

    skip_events = [
        json.loads(rec.message)
        for rec in caplog.records
        if rec.message.startswith("{") and '"transform_deadline_skip"' in rec.message
    ]
    assert len(skip_events) == 1
    assert skip_events[0]["skipped_count"] == 5
    assert skip_events[0]["wave_idx"] == 1  # 0-indexed: first skipped wave is #1


def test_v2_2_3_validation_failure_marks_failed_no_versions_inserted() -> None:
    """TASK-2.4 integration: validator rejects → status='failed', no versions."""
    instances = _install_client_mocks(
        raw_rows=[_make_raw_row("test_v2_2_3_val_fail")],
        validation_passed=False,
        validation_issues=[
            {"group": "NF", "type": "hallucination", "detail": "원본과 다른 주제"}
        ],
    )

    response = _patched_handler_call(
        {"httpMethod": "POST"}, _make_context(), instances
    )

    body = json.loads(response["body"])
    assert body["failed_articles"] == 1
    assert body["completed_articles"] == 0

    instances["pg"].insert_article_version.assert_not_called()
    instances["pg"].update_article_status.assert_called_with(
        "test_v2_2_3_val_fail", "failed"
    )


def test_v2_2_3_logs_validation_failure_event(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """transform_validation_failure JSON log emitted on validator reject."""
    instances = _install_client_mocks(
        raw_rows=[_make_raw_row("test_v2_2_3_val_log")],
        validation_passed=False,
        validation_issues=[
            {"group": "SF", "type": "hallucination", "detail": "x"}
        ],
    )
    with caplog.at_level(logging.ERROR, logger="v2.handlers.core2_transform"):
        _patched_handler_call(
            {"httpMethod": "POST"}, _make_context(), instances
        )
    val_events = [
        json.loads(rec.message)
        for rec in caplog.records
        if rec.message.startswith("{") and '"transform_validation_failure"' in rec.message
    ]
    assert len(val_events) == 1
    assert val_events[0]["news_id"] == "test_v2_2_3_val_log"
    assert val_events[0]["ai_check_used"] is True
    assert val_events[0]["issues"] == [
        {"group": "SF", "type": "hallucination", "detail": "x"}
    ]
    # Phase 5 retry-limit (`d15ec37`) 가 이벤트에 추가한 필드들. 실패 횟수가
    # 한도(5) 아래이므로 아무 그룹도 풀려나지 않는다.
    assert val_events[0]["retry_limit"] == 5
    assert val_events[0]["fail_counts"] == {g: 1 for g in ("NT", "NF", "ST", "SF")}
    assert val_events[0]["released_groups"] == []


def test_v2_2_3_releases_groups_at_retry_limit(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """실패 횟수가 한도에 닿으면 그룹을 transform 큐에서 놓아준다.

    content-driven persistent failure 의 비용 상한이다 (`d15ec37`): 한 기사가
    계속 validator 를 못 넘으면 5분마다 Opus 를 다시 태운다. 이 분기가
    도입될 때 테스트가 함께 오지 않아 검증이 배포 후 수동 invoke 로만
    이뤄졌고, 목이 갱신되지 않은 탓에
    ``test_v2_2_3_logs_validation_failure_event`` 가 2026-05-08 부터 빨간
    상태였다.
    """
    instances = _install_client_mocks(
        raw_rows=[_make_raw_row("test_v2_2_3_retry_cap")],
        validation_passed=False,
        validation_issues=[{"group": "SF", "type": "hallucination", "detail": "x"}],
        validation_failure_count=5,  # == 기본 한도
    )
    with caplog.at_level(logging.WARNING, logger="v2.handlers.core2_transform"):
        _patched_handler_call({"httpMethod": "POST"}, _make_context(), instances)

    events = [
        json.loads(rec.message)
        for rec in caplog.records
        if rec.message.startswith("{")
    ]
    reached = [e for e in events if e.get("event") == "transform_retry_limit_reached"]
    assert len(reached) == 4, "4 그룹 각각에 대해 한도 도달 이벤트가 나야 한다"

    val_events = [
        e for e in events if e.get("event") == "transform_validation_failure"
    ]
    assert len(val_events) == 1
    assert sorted(val_events[0]["released_groups"]) == ["NF", "NT", "SF", "ST"]

    # 실제 release 가 DB 로 나갔는가 — 이벤트 로그만 보면 no-op 이어도 통과한다.
    assert instances["pg"].force_transformed_at_for_retry_limit.call_count == 4


def test_v2_2_3_logs_empty_batch_event(
    caplog: pytest.LogCaptureFixture,
) -> None:
    instances = _install_client_mocks(raw_rows=[])
    with caplog.at_level(logging.INFO, logger="v2.handlers.core2_transform"):
        _patched_handler_call({"httpMethod": "POST"}, _make_context(), instances)
    empty_events = [
        json.loads(rec.message)
        for rec in caplog.records
        if rec.message.startswith("{") and '"transform_empty_batch"' in rec.message
    ]
    assert len(empty_events) == 1


# =============================================================================
# Integration — live pgvector + mocked Bedrock/S3
# =============================================================================


_INTEGRATION_ENVS = ("PG_V2_HOST", "PG_V2_PASSWORD")
_INTEGRATION_READY = all(os.getenv(e) for e in _INTEGRATION_ENVS)


@pytest.mark.integration
@pytest.mark.skipif(
    not _INTEGRATION_READY,
    reason=f"requires {', '.join(_INTEGRATION_ENVS)}",
)
def test_v2_2_3_integration_end_to_end_with_real_pgvector() -> None:
    """Insert one raw article, run handler, verify it moves to 'transformed'
    and 4 versions exist in ``article_versions``.

    Bedrock (transform + embed) and S3 are mocked so the test is cost-free
    and doesn't depend on v2 bucket state. Session-autouse conftest
    cleanup handles row wipe via the ``test_v2_2_3_`` prefix.
    """
    from v2.clients.pgvector_v2_client import PgVectorV2Client

    pg = PgVectorV2Client()
    news_id = "test_v2_2_3_int_e2e"

    # Seed: insert one raw article. Embedding must be 1024-dim non-zero.
    embedding = [0.01] * 1024
    metadata = {
        "title": "통합테스트 원문",
        "category": "경제",
        "published_at": "2026-04-24T00:00:00+09:00",
    }
    pg.insert_article(news_id, metadata, embedding)

    # Mock transform + embed + S3 at the module level the handler imports from.
    instances = _install_client_mocks(
        raw_rows=[_make_raw_row(news_id)],  # handler pulls its own from pg
    )
    # But we want the REAL pg — replace that one in the install set.
    instances["pg"] = pg

    # Re-install with real pg
    with patch(
        "v2.handlers.core2_transform.PgVectorV2Client", return_value=pg
    ), patch(
        "v2.handlers.core2_transform.TransformV2Service",
        return_value=instances["transform_svc"],
    ), patch(
        "v2.handlers.core2_transform.EmbeddingV2Client", return_value=instances["embed"]
    ), patch(
        "v2.handlers.core2_transform.S3ArticleV2Client", return_value=instances["s3"]
    ):
        from v2.handlers.core2_transform import lambda_handler

        response = lambda_handler({"httpMethod": "POST"}, _make_context())

    body = json.loads(response["body"])
    assert body["completed_articles"] == 1

    # Real pg assertions
    versions = pg.get_article_versions(news_id)
    assert set(versions.keys()) == {"NT", "NF", "ST", "SF"}
    # TASK-5: articles.status no longer set to 'transformed' on success.
    # Truth-source for "ready" is article_selections.transformed_at.
    # status stays 'raw' until something else (failure path) overwrites it.
    rows = pg.conn.run(
        "SELECT status FROM articles WHERE news_id = :nid", nid=news_id
    )
    assert rows and rows[0][0] == "raw"
