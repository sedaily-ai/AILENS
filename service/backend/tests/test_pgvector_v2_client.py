"""Unit + integration + performance tests for ``PgVectorV2Client``.

Three tiers, each runnable independently:

* **Unit**   — MagicMock-backed, no DB. Verify SQL shape, parameter binding,
  parsed return shapes, error-swallowing behaviour. Default selection.
* **Integration** — ``@pytest.mark.integration``; requires ``PG_V2_HOST`` +
  ``PG_V2_PASSWORD``. Auto-skipped when env vars are unset. Covers
  round-trips, ON CONFLICT semantics, FK cascades.
* **Performance** — ``@pytest.mark.slow`` (also ``integration``). Opt-in only
  (``-m slow``) because it seeds 1000 rows. Validates correctness of the
  ``find_feed_candidates`` code path, *not* production latency — see the
  fixture docstring for scale caveats.

Run from ``backend/``::

    python3 -m pytest v2/tests/test_pgvector_v2_client.py -v -m 'not integration and not slow'
    python3 -m pytest v2/tests/test_pgvector_v2_client.py -v -m integration    # integration only
    python3 -m pytest v2/tests/test_pgvector_v2_client.py -v -m slow           # perf only
"""
from __future__ import annotations

import datetime as _dt
import json
import logging
import os
import statistics
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock

import pytest

logger = logging.getLogger(__name__)

from clients.pgvector_v2_client import (
    PgVectorV2Client,
    _json_default,
    _normalize_mbti_group,
    _vec_literal,
)

# Convenience: a correctly-sized embedding for unit tests that need to pass
# dimension validation. Real Titan V2 vectors are 1024-dim.
_DIM = 1024


def _e(seed: float = 0.0) -> list[float]:
    """Synthetic 1024-dim vector. Seed picks the constant value."""
    return [seed] * _DIM


# =============================================================================
# Module-level helpers
# =============================================================================

@pytest.mark.parametrize(
    "mbti,expected",
    [
        ("INTJ", "NT"), ("INTP", "NT"), ("ENTJ", "NT"), ("ENTP", "NT"),
        ("INFJ", "NF"), ("INFP", "NF"), ("ENFJ", "NF"), ("ENFP", "NF"),
        ("ISTJ", "ST"), ("ISTP", "ST"), ("ESTJ", "ST"), ("ESTP", "ST"),
        ("ISFJ", "SF"), ("ISFP", "SF"), ("ESFJ", "SF"), ("ESFP", "SF"),
        ("NT", "NT"), ("NF", "NF"), ("ST", "ST"), ("SF", "SF"),
    ],
)
def test_normalize_mbti_group_valid(mbti: str, expected: str) -> None:
    assert _normalize_mbti_group(mbti) == expected


@pytest.mark.parametrize(
    "bad",
    ["", "X", "XY", "ABCD", "INTJX", "intj", "nt"],
)
def test_normalize_mbti_group_rejects_bad_strings(bad: str) -> None:
    with pytest.raises(ValueError):
        _normalize_mbti_group(bad)


@pytest.mark.parametrize("bad", [None, 123, object(), ["NT"]])
def test_normalize_mbti_group_rejects_non_strings(bad) -> None:
    with pytest.raises(ValueError):
        _normalize_mbti_group(bad)  # type: ignore[arg-type]


def test_vec_literal_formats_list() -> None:
    assert _vec_literal([0.1, 0.2, 0.3]) == "[0.1,0.2,0.3]"


def test_vec_literal_handles_empty() -> None:
    assert _vec_literal([]) == "[]"


def test_vec_literal_handles_negative_and_zero() -> None:
    assert _vec_literal([-0.5, 0.0, 1.5]) == "[-0.5,0.0,1.5]"


# =============================================================================
# __init__ / connection management
# =============================================================================

def _clear_v2_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "PG_V2_HOST",
        "PG_V2_PORT",
        "PG_V2_DATABASE",
        "PG_V2_USER",
        "PG_V2_PASSWORD",
    ):
        monkeypatch.delenv(name, raising=False)


def test_init_enabled_when_password_set(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_v2_env(monkeypatch)
    c = PgVectorV2Client(password="x")
    assert c._enabled is True
    assert c._password == "x"


def test_init_disabled_when_password_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_v2_env(monkeypatch)
    c = PgVectorV2Client(password="")
    assert c._enabled is False


def test_init_reads_env_vars(monkeypatch: pytest.MonkeyPatch) -> None:
    """host·port·database·user 는 env var 에서 온다. password 는 예외다.

    Admin-2c 이후 비밀번호 출처가 SSM ``/sedaily-mbti/v2/pg-password`` 로
    바뀌었고(``pgvector_v2_client.py:159``) ``PG_V2_PASSWORD`` 는 더 이상
    읽히지 않는다. 이 테스트는 그 사실 자체를 고정한다 — env var 를 넣어도
    무시되는지까지 확인한다.

    SSM 호출은 conftest 의 autouse ``_block_real_ssm`` 이 막는다.
    """
    _clear_v2_env(monkeypatch)
    monkeypatch.setenv("PG_V2_HOST", "h.example.com")
    monkeypatch.setenv("PG_V2_PORT", "6543")
    monkeypatch.setenv("PG_V2_DATABASE", "db_x")
    monkeypatch.setenv("PG_V2_USER", "user_x")
    monkeypatch.setenv("PG_V2_PASSWORD", "pw")  # 무시되어야 한다
    c = PgVectorV2Client()
    assert c._host == "h.example.com"
    assert c._port == 6543
    assert c._database == "db_x"
    assert c._user == "user_x"
    assert c._password != "pw", "PG_V2_PASSWORD 가 다시 읽히고 있다"
    assert c._password == "fake-secret::/sedaily-mbti/v2/pg-password"
    assert c._enabled is True


def test_init_defaults_when_env_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_v2_env(monkeypatch)
    c = PgVectorV2Client(password="pw")
    assert c._port == 5432
    assert c._database == "ailens_v2"
    assert c._user == "ailens"


def test_init_constructor_args_override_env(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_v2_env(monkeypatch)
    monkeypatch.setenv("PG_V2_HOST", "env-host")
    c = PgVectorV2Client(host="ctor-host", password="pw")
    assert c._host == "ctor-host"


def test_close_resets_connection() -> None:
    c = PgVectorV2Client(password="x")
    fake = MagicMock()
    c._conn = fake
    c.close()
    fake.close.assert_called_once()
    assert c._conn is None


def test_close_safe_when_conn_none() -> None:
    c = PgVectorV2Client(password="x")
    c.close()  # must not raise


# =============================================================================
# Disabled-mode no-op behaviour
# =============================================================================

def _disabled() -> PgVectorV2Client:
    return PgVectorV2Client(password="")


def test_disabled_insert_article_noop() -> None:
    # Disabled client still runs dimension validation first — use _e() (1024-dim).
    _disabled().insert_article("n", {"title": "t"}, _e())


def test_disabled_update_article_status_noop() -> None:
    _disabled().update_article_status("n", "transformed")


def test_disabled_get_articles_by_status_returns_empty() -> None:
    assert _disabled().get_articles_by_status("raw") == []


def test_disabled_insert_article_version_returns_empty_string() -> None:
    assert _disabled().insert_article_version("n", "NT", {}, _e()) == ""


def test_disabled_get_article_versions_returns_empty_dict() -> None:
    assert _disabled().get_article_versions("n") == {}


def test_disabled_upsert_user_profile_noop() -> None:
    _disabled().upsert_user_profile("u", "INTJ", {}, None)


def test_disabled_get_user_profile_returns_none() -> None:
    assert _disabled().get_user_profile("u") is None


def test_disabled_record_interaction_noop() -> None:
    _disabled().record_interaction("u", "n", "NT", "click")


def test_disabled_get_user_interactions_returns_empty() -> None:
    assert _disabled().get_user_interactions("u") == []


def test_disabled_find_feed_candidates_returns_empty() -> None:
    assert _disabled().find_feed_candidates("INTJ", None, [], 10) == []


def test_disabled_find_similar_articles_returns_empty() -> None:
    assert _disabled().find_similar_articles(_e()) == []


def test_disabled_filter_existing_news_ids_returns_empty() -> None:
    assert _disabled().filter_existing_news_ids(["a", "b"]) == set()


# =============================================================================
# SQL binding — articles
# =============================================================================

def _enabled(dim: int = 2) -> PgVectorV2Client:
    """Enabled client with a MagicMock connection preloaded.

    Default ``dim=2`` so SQL binding tests can pass short embeddings like
    ``[0.1, 0.2]`` without tripping ``_validate_embedding``. Tests that
    specifically exercise dimension validation pass ``dim=1024`` (or any
    other value that mismatches the test input).
    """
    c = PgVectorV2Client(password="x", dimension=dim)
    c._conn = MagicMock()
    return c


def test_insert_article_binds_params_and_extracts_known_fields() -> None:
    c = _enabled()
    meta = {
        "title": "T",
        "category": "IT_과학",
        "published_at": "2026-04-01T00:00:00+09:00",
        "source": "xml",
        "reporter": "lee",
    }
    c.insert_article("n1", meta, [0.1, 0.2])
    c._conn.run.assert_called_once()
    sql = c._conn.run.call_args.args[0]
    kwargs = c._conn.run.call_args.kwargs
    assert "INSERT INTO articles" in sql
    assert "ON CONFLICT (news_id) DO NOTHING" in sql
    assert kwargs["news_id"] == "n1"
    assert kwargs["title"] == "T"
    assert kwargs["category"] == "IT_과학"
    assert kwargs["published_at"] == "2026-04-01T00:00:00+09:00"
    assert kwargs["embedding"] == "[0.1,0.2]"
    stored = json.loads(kwargs["metadata"])
    assert stored == {"source": "xml", "reporter": "lee"}


def test_insert_article_defaults_missing_optional_fields() -> None:
    c = _enabled()
    c.insert_article("n1", {"title": "t"}, [0.1, 0.2])
    kwargs = c._conn.run.call_args.kwargs
    assert kwargs["category"] is None
    assert kwargs["published_at"] is None
    assert json.loads(kwargs["metadata"]) == {}


def test_insert_article_swallows_exception() -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("db down")
    c.insert_article("n", {"title": "t"}, [0.1, 0.2])  # must not raise


def test_insert_article_rejects_wrong_dimension() -> None:
    c = _enabled(dim=1024)
    with pytest.raises(ValueError, match="length mismatch"):
        c.insert_article("n", {"title": "t"}, [0.1, 0.2])


def test_update_article_status_binds_params() -> None:
    c = _enabled()
    c.update_article_status("n", "transformed")
    sql = c._conn.run.call_args.args[0]
    kwargs = c._conn.run.call_args.kwargs
    assert "UPDATE articles" in sql
    assert "updated_at = now()" in sql
    assert kwargs == {"status": "transformed", "nid": "n"}


def test_update_article_status_rejects_bad_value() -> None:
    c = _enabled()
    with pytest.raises(ValueError):
        c.update_article_status("n", "weird")


def test_update_article_status_logs_error_but_does_not_raise(
    caplog: pytest.LogCaptureFixture,
) -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("conn reset")
    c.update_article_status("n", "failed")  # must not raise
    assert any("update_article_status" in rec.message for rec in caplog.records)


def test_get_articles_by_status_parses_rows() -> None:
    c = _enabled()
    c._conn.run.return_value = [
        ["n1", "raw", "T1", "IT_과학", "pub1", {"a": 1}, "c1", "u1"],
        ["n2", "raw", "T2", None, None, {}, "c2", "u2"],
    ]
    res = c.get_articles_by_status("raw", limit=5)
    assert len(res) == 2
    assert res[0]["news_id"] == "n1"
    assert res[0]["metadata"] == {"a": 1}
    assert res[1]["category"] is None


def test_get_articles_by_status_orders_by_created_at_asc() -> None:
    c = _enabled()
    c._conn.run.return_value = []
    c.get_articles_by_status("raw")
    sql = c._conn.run.call_args.args[0]
    assert "ORDER BY created_at ASC" in sql


def test_get_articles_by_status_swallows_exception() -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("x")
    assert c.get_articles_by_status("raw") == []


def test_find_similar_articles_filters_transformed_and_orders_by_distance() -> None:
    c = _enabled()
    c._conn.run.return_value = [
        ["n1", "T", "IT_과학", "p", {}, 0.15],
    ]
    res = c.find_similar_articles([0.1, 0.2], limit=5)
    sql = c._conn.run.call_args.args[0]
    assert "status = 'transformed'" in sql
    assert "ORDER BY embedding <=> :q::vector" in sql
    assert len(res) == 1
    assert res[0]["distance"] == 0.15


def test_find_similar_articles_swallows_exception() -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("x")
    assert c.find_similar_articles([0.1, 0.2]) == []


def test_find_similar_articles_rejects_wrong_dimension() -> None:
    c = _enabled(dim=1024)
    with pytest.raises(ValueError, match="length mismatch"):
        c.find_similar_articles([0.1, 0.2])


def test_filter_existing_news_ids_empty_input_short_circuits() -> None:
    c = _enabled()
    # Empty input must NOT hit the DB — pg8000 empty-array inference is brittle.
    assert c.filter_existing_news_ids([]) == set()
    c._conn.run.assert_not_called()


def test_filter_existing_news_ids_binds_list_and_parses_rows() -> None:
    c = _enabled()
    c._conn.run.return_value = [["n1"], ["n3"]]  # only 2 of 3 existed
    result = c.filter_existing_news_ids(["n1", "n2", "n3"])
    assert result == {"n1", "n3"}
    sql = c._conn.run.call_args.args[0]
    assert "SELECT news_id FROM articles" in sql
    assert "news_id = ANY(:ids::text[])" in sql
    # Python list passed through to pg8000 as :ids binding
    assert c._conn.run.call_args.kwargs == {"ids": ["n1", "n2", "n3"]}


def test_filter_existing_news_ids_returns_empty_on_exception() -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("DB gone")
    # Fail-open: empty set = caller treats everything as new, insert_article's
    # ON CONFLICT DO NOTHING is the final dedup safety net.
    assert c.filter_existing_news_ids(["n1", "n2"]) == set()


def test_filter_existing_news_ids_handles_duplicate_input() -> None:
    c = _enabled()
    c._conn.run.return_value = [["n1"]]
    # Duplicate in input → still a single result because return is a set.
    assert c.filter_existing_news_ids(["n1", "n1", "n2"]) == {"n1"}


# =============================================================================
# SQL binding — article_versions
# =============================================================================

def test_insert_article_version_upserts_and_returns_uuid() -> None:
    c = _enabled()
    expected_id = str(uuid.uuid4())
    c._conn.run.return_value = [[expected_id]]
    ret = c.insert_article_version(
        "n1", "NT",
        {"title": "T", "body": "B", "extra": 1},
        [0.1, 0.2],
    )
    sql = c._conn.run.call_args.args[0]
    kwargs = c._conn.run.call_args.kwargs
    assert "INSERT INTO article_versions" in sql
    assert "ON CONFLICT (news_id, mbti_type) DO UPDATE" in sql
    assert "RETURNING version_id" in sql
    assert kwargs["news_id"] == "n1"
    assert kwargs["mbti_type"] == "NT"
    assert kwargs["title"] == "T"
    assert kwargs["body"] == "B"
    assert json.loads(kwargs["metadata"]) == {"extra": 1}
    assert ret == expected_id


def test_insert_article_version_normalizes_full_mbti() -> None:
    c = _enabled()
    c._conn.run.return_value = [["id"]]
    c.insert_article_version("n", "INTJ", {}, [0.1, 0.2])
    assert c._conn.run.call_args.kwargs["mbti_type"] == "NT"


def test_insert_article_version_rejects_bad_mbti() -> None:
    c = _enabled()
    with pytest.raises(ValueError):
        # mbti check fires before dimension — any embedding length is fine here
        c.insert_article_version("n", "ZZ", {}, [0.1, 0.2])


def test_insert_article_version_rejects_wrong_dimension() -> None:
    c = _enabled(dim=1024)
    with pytest.raises(ValueError, match="length mismatch"):
        c.insert_article_version("n", "NT", {}, [0.1, 0.2])


def test_insert_article_version_returns_empty_on_exception() -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("x")
    assert c.insert_article_version("n", "NT", {}, [0.1, 0.2]) == ""


def test_get_article_versions_returns_keyed_dict() -> None:
    c = _enabled()
    c._conn.run.return_value = [
        ["id1", "NT", "T_NT", "B_NT", {"m": 1}, "c1"],
        ["id2", "NF", "T_NF", "B_NF", {}, "c2"],
    ]
    res = c.get_article_versions("n1")
    assert set(res.keys()) == {"NT", "NF"}
    assert res["NT"]["title"] == "T_NT"
    assert res["NT"]["version_id"] == "id1"
    assert res["NT"]["metadata"] == {"m": 1}


def test_get_article_versions_returns_empty_on_exception() -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("x")
    assert c.get_article_versions("n") == {}


# =============================================================================
# SQL binding — user_profiles
# =============================================================================

def test_upsert_user_profile_with_embedding() -> None:
    c = _enabled()
    c.upsert_user_profile("u1", "INTJ", {"IT_과학": 0.7}, [0.1, 0.2])
    sql = c._conn.run.call_args.args[0]
    kwargs = c._conn.run.call_args.kwargs
    assert "INSERT INTO user_profiles" in sql
    assert "ON CONFLICT (user_id) DO UPDATE" in sql
    assert kwargs["uid"] == "u1"
    assert kwargs["mbti"] == "INTJ"
    assert json.loads(kwargs["weights"]) == {"IT_과학": 0.7}
    assert kwargs["vec"] == "[0.1,0.2]"


def test_upsert_user_profile_without_embedding() -> None:
    """None embedding → path (B): no ``:vec`` parameter bound at all."""
    c = _enabled()
    c.upsert_user_profile("u1", "INTJ", {}, None)
    assert "vec" not in c._conn.run.call_args.kwargs


def test_upsert_user_profile_embedding_path_casts_vector() -> None:
    """Path (A): SQL binds ``:vec`` and casts it with ``::vector``."""
    c = _enabled()
    c.upsert_user_profile("u1", "INTJ", {}, [0.1, 0.2])
    sql = c._conn.run.call_args.args[0]
    assert ":vec::vector" in sql
    # Regression guard: the CASE WHEN form previously raised pg 42P08
    # "could not determine data type of parameter". Never bring it back.
    assert "CASE WHEN" not in sql


def test_upsert_user_profile_null_path_uses_null_literal() -> None:
    """Path (B): SQL has a literal NULL in VALUES, no ``:vec`` param."""
    c = _enabled()
    c.upsert_user_profile("u1", "INTJ", {}, None)
    sql = c._conn.run.call_args.args[0]
    assert ":vec" not in sql
    assert "CASE WHEN" not in sql
    # Closing VALUES tuple carries literal NULL for the embedding column.
    assert ", NULL)" in sql


def test_upsert_user_profile_allows_null_mbti_and_weights() -> None:
    c = _enabled()
    c.upsert_user_profile("u1", None, None, None)
    kwargs = c._conn.run.call_args.kwargs
    assert kwargs["mbti"] is None
    assert json.loads(kwargs["weights"]) == {}


def test_upsert_user_profile_rejects_wrong_dimension_when_given() -> None:
    c = _enabled(dim=1024)
    with pytest.raises(ValueError, match="length mismatch"):
        c.upsert_user_profile("u1", "INTJ", {}, [0.1, 0.2])


def test_upsert_user_profile_skips_validation_when_embedding_none() -> None:
    """None embedding bypasses dimension check (cold-start path)."""
    c = _enabled(dim=1024)
    c.upsert_user_profile("u1", "INTJ", {}, None)  # must not raise


def test_get_user_profile_returns_none_when_missing() -> None:
    c = _enabled()
    c._conn.run.return_value = []
    assert c.get_user_profile("u1") is None


def test_get_user_profile_returns_dict() -> None:
    c = _enabled()
    c._conn.run.return_value = [["u1", "INTJ", {"x": 1}, "c", "u"]]
    res = c.get_user_profile("u1")
    assert res == {
        "user_id": "u1",
        "mbti_type": "INTJ",
        "category_weights": {"x": 1},
        "created_at": "c",
        "updated_at": "u",
    }


def test_get_user_profile_returns_none_on_exception() -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("x")
    assert c.get_user_profile("u1") is None


# =============================================================================
# SQL binding — user_interactions
# =============================================================================

def test_record_interaction_extracts_known_columns_and_puts_rest_in_metadata() -> None:
    c = _enabled()
    c.record_interaction(
        "u1", "n1", "NT", "dwell",
        dwell_ms=5000,
        scroll_pct=80,
        source="feed",
        position=3,
    )
    kwargs = c._conn.run.call_args.kwargs
    assert kwargs["dwell_ms"] == 5000
    assert kwargs["scroll_pct"] == 80
    assert kwargs["rating"] is None
    assert kwargs["reaction_type"] is None
    assert json.loads(kwargs["metadata"]) == {"source": "feed", "position": 3}


def test_record_interaction_allows_null_mbti() -> None:
    c = _enabled()
    c.record_interaction("u", "n", None, "skip")
    assert c._conn.run.call_args.kwargs["mbti"] is None


def test_record_interaction_normalizes_full_mbti() -> None:
    c = _enabled()
    c.record_interaction("u", "n", "ENFP", "click")
    assert c._conn.run.call_args.kwargs["mbti"] == "NF"


def test_record_interaction_rejects_bad_type() -> None:
    c = _enabled()
    with pytest.raises(ValueError):
        c.record_interaction("u", "n", "NT", "weirdtype")


def test_record_interaction_rejects_bad_mbti() -> None:
    c = _enabled()
    with pytest.raises(ValueError):
        c.record_interaction("u", "n", "ZZ", "click")


def test_record_interaction_swallows_db_exception() -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("x")
    c.record_interaction("u", "n", "NT", "click")  # must not raise


def test_get_user_interactions_without_since_uses_simpler_query() -> None:
    c = _enabled()
    c._conn.run.return_value = []
    c.get_user_interactions("u", limit=50)
    sql = c._conn.run.call_args.args[0]
    assert ":since" not in sql
    assert "ORDER BY created_at DESC" in sql


def test_get_user_interactions_with_since_adds_filter() -> None:
    c = _enabled()
    c._conn.run.return_value = []
    since = datetime.now(timezone.utc) - timedelta(days=7)
    c.get_user_interactions("u", limit=50, since=since)
    sql = c._conn.run.call_args.args[0]
    kwargs = c._conn.run.call_args.kwargs
    assert "created_at >= :since" in sql
    assert kwargs["since"] == since


def test_get_user_interactions_parses_rows() -> None:
    c = _enabled()
    c._conn.run.return_value = [
        [1, "u", "n", "NT", "dwell", 3000, 50, None, None, {"s": "f"}, "c1"],
    ]
    res = c.get_user_interactions("u")
    assert len(res) == 1
    assert res[0]["id"] == 1
    assert res[0]["interaction_type"] == "dwell"
    assert res[0]["dwell_ms"] == 3000
    assert res[0]["metadata"] == {"s": "f"}


def test_get_user_interactions_returns_empty_on_exception() -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("x")
    assert c.get_user_interactions("u") == []


# =============================================================================
# SQL binding — find_feed_candidates
# =============================================================================

def test_find_feed_candidates_with_embedding_orders_by_distance() -> None:
    c = _enabled()
    c._conn.run.return_value = []
    c.find_feed_candidates("INTJ", [0.1, 0.2], ["seen1"], limit=20)
    sql = c._conn.run.call_args.args[0]
    kwargs = c._conn.run.call_args.kwargs
    assert "ORDER BY av.embedding <=> :pref::vector" in sql
    assert ":excl::text[]" in sql
    assert kwargs["grp"] == "NT"
    assert kwargs["pref"] == "[0.1,0.2]"
    assert kwargs["excl"] == ["seen1"]


def test_find_feed_candidates_cold_start_falls_back_to_recency() -> None:
    c = _enabled()
    c._conn.run.return_value = []
    c.find_feed_candidates("NT", None, [], limit=20)
    sql = c._conn.run.call_args.args[0]
    kwargs = c._conn.run.call_args.kwargs
    assert "ORDER BY a.published_at DESC" in sql
    assert ":pref::vector" not in sql
    assert ":excl" not in sql
    assert "pref" not in kwargs
    assert "excl" not in kwargs


def test_find_feed_candidates_empty_exclude_omits_clause() -> None:
    c = _enabled()
    c._conn.run.return_value = []
    c.find_feed_candidates("NT", [0.1, 0.2], [], limit=5)
    sql = c._conn.run.call_args.args[0]
    assert ":excl::text[]" not in sql
    assert "NULL::float8" not in sql  # distance column still bound to vector


def test_find_feed_candidates_rejects_wrong_dimension_when_given() -> None:
    c = _enabled(dim=1024)
    with pytest.raises(ValueError, match="length mismatch"):
        c.find_feed_candidates("NT", [0.1, 0.2], [], limit=5)


def test_find_feed_candidates_cold_start_ignores_dimension() -> None:
    """``preference_embedding=None`` skips dimension validation entirely."""
    c = _enabled(dim=1024)
    c._conn.run.return_value = []
    c.find_feed_candidates("NT", None, [], limit=5)  # must not raise


def test_find_feed_candidates_joins_articles_and_filters_transformed() -> None:
    c = _enabled()
    c._conn.run.return_value = []
    c.find_feed_candidates("NT", [0.1, 0.2], [], 10)
    sql = c._conn.run.call_args.args[0]
    assert "JOIN articles a" in sql
    assert "a.status = 'transformed'" in sql


def test_find_feed_candidates_selects_both_metadata_columns() -> None:
    """Round 5-C extension: response shape needs av.metadata
    (version_metadata) AND a.metadata (article_metadata) so the
    handler can populate press/url/sub_title/byline/image_url
    uniformly across cold and warm paths."""
    c = _enabled()
    c._conn.run.return_value = []
    c.find_feed_candidates("NT", [0.1, 0.2], [], 10)
    sql = c._conn.run.call_args.args[0]
    assert "av.metadata AS version_metadata" in sql
    assert "a.metadata AS article_metadata" in sql


def test_find_feed_candidates_rejects_bad_mbti() -> None:
    c = _enabled()
    with pytest.raises(ValueError):
        # mbti fires before dimension
        c.find_feed_candidates("ZZ", [0.1, 0.2], [], 10)


def test_find_feed_candidates_parses_rows() -> None:
    c = _enabled()
    c._conn.run.return_value = [
        ["n1", "NT", "T1", "B1", {}, "c1", "IT_과학", "p1", {}, 0.1],
        ["n2", "NT", "T2", "B2", {}, "c2", "경제", "p2", {}, 0.3],
    ]
    res = c.find_feed_candidates("INTJ", [0.1, 0.2], [], 10)
    assert len(res) == 2
    assert res[0]["news_id"] == "n1"
    assert res[0]["distance"] == 0.1
    assert res[0]["category"] == "IT_과학"


def test_find_feed_candidates_parses_null_distance_on_cold_start() -> None:
    c = _enabled()
    c._conn.run.return_value = [
        ["n1", "NT", "T", "B", {}, "c", "IT_과학", "p", {}, None],
    ]
    res = c.find_feed_candidates("NT", None, [], 10)
    assert res[0]["distance"] is None


def test_find_feed_candidates_returns_empty_on_exception() -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("x")
    assert c.find_feed_candidates("NT", [0.1, 0.2], [], 10) == []


# =============================================================================
# _validate_embedding (instance-level, cares about self._dimension)
# =============================================================================

def test_validate_embedding_accepts_exact_length() -> None:
    c = PgVectorV2Client(password="x", dimension=4)
    c._validate_embedding([0.1, 0.2, 0.3, 0.4])  # must not raise


def test_validate_embedding_rejects_short() -> None:
    c = PgVectorV2Client(password="x", dimension=1024)
    with pytest.raises(ValueError, match="length mismatch"):
        c._validate_embedding([0.1] * 512)


def test_validate_embedding_rejects_long() -> None:
    c = PgVectorV2Client(password="x", dimension=1024)
    with pytest.raises(ValueError, match="length mismatch"):
        c._validate_embedding([0.1] * 2048)


def test_validate_embedding_rejects_empty() -> None:
    c = PgVectorV2Client(password="x", dimension=1024)
    with pytest.raises(ValueError, match="length mismatch"):
        c._validate_embedding([])


def test_validate_embedding_runs_in_disabled_mode() -> None:
    """Dimension validation fires even when the client is in no-op mode."""
    c = PgVectorV2Client(password="", dimension=1024)
    with pytest.raises(ValueError, match="length mismatch"):
        c.insert_article("n", {"title": "t"}, [0.1, 0.2])


# =============================================================================
# _json_default — metadata JSONB serializer
# =============================================================================

def test_json_default_serializes_datetime() -> None:
    t = datetime(2026, 4, 19, 12, 0, 0, tzinfo=timezone.utc)
    assert _json_default(t) == "2026-04-19T12:00:00+00:00"


def test_json_default_serializes_date() -> None:
    assert _json_default(date(2026, 4, 19)) == "2026-04-19"


def test_json_default_serializes_whole_decimal_as_int() -> None:
    assert _json_default(Decimal("5")) == 5
    assert isinstance(_json_default(Decimal("5")), int)


def test_json_default_serializes_fractional_decimal_as_float() -> None:
    assert _json_default(Decimal("3.14")) == pytest.approx(3.14)
    assert isinstance(_json_default(Decimal("3.14")), float)


def test_json_default_serializes_set() -> None:
    result = _json_default({"a", "b"})
    assert isinstance(result, list)
    assert sorted(result) == ["a", "b"]


def test_json_default_serializes_frozenset() -> None:
    result = _json_default(frozenset({1, 2}))
    assert isinstance(result, list)
    assert sorted(result) == [1, 2]


def test_json_default_rejects_unsupported_type() -> None:
    class Custom:
        pass

    with pytest.raises(TypeError, match="not JSON serializable"):
        _json_default(Custom())


def test_json_default_is_wired_into_metadata_dumps() -> None:
    """End-to-end: record_interaction with a datetime kwarg must serialize."""
    c = _enabled()
    when = datetime(2026, 4, 19, 12, 0, 0, tzinfo=timezone.utc)
    c.record_interaction(
        "u", "n", "NT", "dwell",
        dwell_ms=3000, first_seen_at=when, tags={"x", "y"},
    )
    stored = json.loads(c._conn.run.call_args.kwargs["metadata"])
    assert stored["first_seen_at"] == "2026-04-19T12:00:00+00:00"
    assert sorted(stored["tags"]) == ["x", "y"]


def test_insert_article_metadata_serializes_decimal() -> None:
    c = _enabled()
    c.insert_article(
        "n1",
        {"title": "T", "score": Decimal("4.5"), "views": Decimal("100")},
        [0.1, 0.2],
    )
    stored = json.loads(c._conn.run.call_args.kwargs["metadata"])
    assert stored["score"] == pytest.approx(4.5)
    assert stored["views"] == 100


def test_insert_article_metadata_rejects_unsupported_type() -> None:
    """Unknown types in metadata surface as TypeError — silent-drop is worse."""
    class Custom:
        pass

    c = _enabled()
    # The exception is caught by the try/except and logged as a warning; the
    # method returns without raising. Verify by asserting the mock was called
    # but the logger captured a warning.
    c.insert_article("n", {"title": "t", "obj": Custom()}, [0.1, 0.2])
    # json.dumps raises TypeError → caught → no conn.run call
    c._conn.run.assert_not_called()


# =============================================================================
# Integration tests  (require live PG_V2_HOST + PG_V2_PASSWORD)
# =============================================================================

_PG_V2_LIVE = bool(os.getenv("PG_V2_HOST")) and bool(os.getenv("PG_V2_PASSWORD"))

#: Prefix for per-test integration data — cleaned in ``pg_client`` teardown.
IT_PREFIX = "test_v2_1_3_it_"

#: Prefix for perf-seed data — cleaned in ``seeded_feed_candidates`` teardown.
#: Distinct from ``IT_PREFIX`` so per-test teardown never wipes the session seed.
PERF_PREFIX = "test_v2_1_3_perf_"


def _embedding(seed: float = 0.1) -> list[float]:
    """1024-dim vector with guaranteed non-zero magnitude.

    The first component is always 1.0; the remaining 1023 carry ``seed``.
    This avoids two traps in cosine-distance tests:

    * **Zero-magnitude vectors produce NaN distances.** pgvector computes
      cosine distance as ``1 - (a·b) / (|a| * |b|)``; if either vector has
      magnitude 0, the denominator is 0 and the result is NaN. A bare
      ``[seed] * 1024`` with ``seed=0.0`` (trivially produced by callers
      like ``_embedding(0.1 * i)`` at ``i=0`` or perf seeds
      ``(i % 100) / 100`` at ``i=0, 100, 200, …``) would silently poison
      distance assertions.
    * **Parallel uniform vectors collapse to cosine distance 0.** With
      ``[seed] * 1024``, any two seeds produce parallel vectors — cosine
      similarity is always 1.0 and ORDER BY distance has nothing to
      sort. A 1.0 head component plus seed-varied tail breaks parallelism
      while keeping the vector deterministic and easy to reason about.
    """
    return [1.0] + [seed] * 1023


def _wipe_prefix(client: PgVectorV2Client, prefix: str) -> None:
    """Delete every test-prefix row across the four v2 tables.

    Called from both setup and teardown so a previously-crashed run (SIGKILL,
    network drop before teardown could execute) does not leak rows into
    the next test invocation.

    Order: FK-dependent tables first — user_interactions and article_versions
    reference news_ids in articles, so we delete them before articles.
    user_profiles is independent of any FK.

    SAFETY: prefix is a module-level constant (IT_PREFIX or PERF_PREFIX);
    no user input reaches the f-string.
    """
    client.conn.run(
        f"DELETE FROM user_interactions WHERE news_id LIKE '{prefix}%'"
    )
    client.conn.run(
        f"DELETE FROM user_profiles WHERE user_id LIKE '{prefix}%'"
    )
    client.conn.run(
        f"DELETE FROM article_versions WHERE news_id LIKE '{prefix}%'"
    )
    client.conn.run(
        f"DELETE FROM articles WHERE news_id LIKE '{prefix}%'"
    )


@pytest.fixture()
def pg_client():
    """Function-scoped client connected to the real v2 DB.

    Pre-setup and teardown both wipe ``IT_PREFIX`` rows so any cruft from
    an aborted prior run is cleared before the test body runs. Perf rows
    (``PERF_PREFIX``) are untouched — distinct prefix, different fixture.
    """
    if not _PG_V2_LIVE:
        pytest.skip("PG_V2_HOST / PG_V2_PASSWORD not set")
    client = PgVectorV2Client()
    try:
        _wipe_prefix(client, IT_PREFIX)
        yield client
    finally:
        try:
            _wipe_prefix(client, IT_PREFIX)
        finally:
            client.close()


@pytest.mark.integration
def test_integration_article_roundtrip(pg_client: PgVectorV2Client) -> None:
    nid = f"{IT_PREFIX}roundtrip"
    pg_client.insert_article(
        nid, {"title": "T", "category": "IT_과학"}, _embedding()
    )
    rows = pg_client.get_articles_by_status("raw", limit=500)
    assert nid in [r["news_id"] for r in rows]


@pytest.mark.integration
def test_integration_insert_article_is_idempotent(pg_client: PgVectorV2Client) -> None:
    nid = f"{IT_PREFIX}idempotent"
    pg_client.insert_article(
        nid, {"title": "T1", "category": "IT_과학"}, _embedding(0.1)
    )
    pg_client.update_article_status(nid, "transformed")
    # second insert — DO NOTHING must keep the transformed status
    pg_client.insert_article(
        nid, {"title": "T2", "category": "경제"}, _embedding(0.9)
    )
    raw_ids = {r["news_id"] for r in pg_client.get_articles_by_status("raw", 500)}
    transformed_ids = {
        r["news_id"] for r in pg_client.get_articles_by_status("transformed", 500)
    }
    assert nid not in raw_ids
    assert nid in transformed_ids


@pytest.mark.integration
def test_integration_filter_existing_news_ids_returns_subset(
    pg_client: PgVectorV2Client,
) -> None:
    nid_a = f"{IT_PREFIX}filter_a"
    nid_b = f"{IT_PREFIX}filter_b"
    nid_missing = f"{IT_PREFIX}filter_missing"
    pg_client.insert_article(nid_a, {"title": "a"}, _embedding(0.1))
    pg_client.insert_article(nid_b, {"title": "b"}, _embedding(0.2))

    result = pg_client.filter_existing_news_ids(
        [nid_a, nid_b, nid_missing]
    )
    assert result == {nid_a, nid_b}


@pytest.mark.integration
def test_integration_filter_existing_news_ids_empty_result(
    pg_client: PgVectorV2Client,
) -> None:
    # IDs that definitely do not exist in the cleaned table.
    result = pg_client.filter_existing_news_ids(
        [f"{IT_PREFIX}nope_1", f"{IT_PREFIX}nope_2"]
    )
    assert result == set()


@pytest.mark.integration
def test_integration_filter_existing_news_ids_large_batch(
    pg_client: PgVectorV2Client,
) -> None:
    # 400 items ≈ real Collector batch size — confirms pg8000 text[] binding
    # handles production-scale inputs without a parameter-count limit.
    nids = [f"{IT_PREFIX}batch_{i:04d}" for i in range(400)]
    # Insert half of them
    for nid in nids[:200]:
        pg_client.insert_article(nid, {"title": "t"}, _embedding(0.1))

    existing = pg_client.filter_existing_news_ids(nids)
    assert existing == set(nids[:200])


@pytest.mark.integration
def test_integration_article_version_upsert_overwrites(
    pg_client: PgVectorV2Client,
) -> None:
    nid = f"{IT_PREFIX}version"
    pg_client.insert_article(
        nid, {"title": "orig", "category": "IT_과학"}, _embedding()
    )
    id1 = pg_client.insert_article_version(
        nid, "NT", {"title": "v1", "body": "body1"}, _embedding(0.1)
    )
    id2 = pg_client.insert_article_version(
        nid, "NT", {"title": "v2", "body": "body2"}, _embedding(0.2)
    )
    # ON CONFLICT DO UPDATE: same row → version_id stable across upserts
    assert id1 == id2
    versions = pg_client.get_article_versions(nid)
    assert "NT" in versions
    assert versions["NT"]["title"] == "v2"
    assert versions["NT"]["body"] == "body2"


@pytest.mark.integration
def test_integration_article_version_fk_cascade(
    pg_client: PgVectorV2Client,
) -> None:
    nid = f"{IT_PREFIX}cascade"
    pg_client.insert_article(nid, {"title": "t", "category": "x"}, _embedding())
    for g in ("NT", "NF"):
        pg_client.insert_article_version(
            nid, g, {"title": "t", "body": "b"}, _embedding()
        )
    pg_client.conn.run("DELETE FROM articles WHERE news_id = :n", n=nid)
    assert pg_client.get_article_versions(nid) == {}


@pytest.mark.integration
def test_integration_user_profile_upsert(pg_client: PgVectorV2Client) -> None:
    uid = f"{IT_PREFIX}user1"
    pg_client.upsert_user_profile(uid, "INTJ", {"IT_과학": 0.7}, _embedding())
    first = pg_client.get_user_profile(uid)
    assert first is not None
    assert first["mbti_type"] == "INTJ"

    pg_client.upsert_user_profile(uid, "ENFP", {"문화": 0.9}, _embedding(0.5))
    second = pg_client.get_user_profile(uid)
    assert second is not None
    assert second["mbti_type"] == "ENFP"
    assert second["category_weights"]["문화"] == 0.9


@pytest.mark.integration
def test_integration_record_interaction(pg_client: PgVectorV2Client) -> None:
    uid = f"{IT_PREFIX}user2"
    nid = f"{IT_PREFIX}int"
    pg_client.insert_article(nid, {"title": "t"}, _embedding())
    pg_client.record_interaction(uid, nid, "NT", "click")
    pg_client.record_interaction(
        uid, nid, "NT", "dwell", dwell_ms=3000, source="feed"
    )
    rows = pg_client.get_user_interactions(uid, limit=10)
    assert len(rows) == 2
    dwell = next(r for r in rows if r["interaction_type"] == "dwell")
    assert dwell["dwell_ms"] == 3000
    assert dwell["metadata"].get("source") == "feed"


@pytest.mark.integration
def test_integration_user_interactions_since_filter(
    pg_client: PgVectorV2Client,
) -> None:
    uid = f"{IT_PREFIX}user_since"
    nid = f"{IT_PREFIX}since"
    pg_client.insert_article(nid, {"title": "t"}, _embedding())
    pg_client.record_interaction(uid, nid, "NT", "click")
    # since = 1 hour in the future → no rows
    future = datetime.now(timezone.utc) + timedelta(hours=1)
    assert pg_client.get_user_interactions(uid, since=future) == []
    # since = 1 hour ago → the event
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    assert len(pg_client.get_user_interactions(uid, since=past)) == 1


@pytest.mark.integration
def test_integration_find_similar_articles(pg_client: PgVectorV2Client) -> None:
    for i in range(3):
        nid = f"{IT_PREFIX}sim_{i}"
        pg_client.insert_article(nid, {"title": f"T{i}"}, _embedding(0.1 * i))
        pg_client.update_article_status(nid, "transformed")
    hits = pg_client.find_similar_articles(_embedding(0.0), limit=2)
    assert len(hits) == 2
    # ordered ascending by distance
    assert hits[0]["distance"] <= hits[1]["distance"]


@pytest.mark.integration
def test_integration_find_feed_candidates_excludes_seen(
    pg_client: PgVectorV2Client,
) -> None:
    nid1, nid2 = f"{IT_PREFIX}feed1", f"{IT_PREFIX}feed2"
    for nid in (nid1, nid2):
        pg_client.insert_article(
            nid, {"title": "t", "category": "IT_과학"}, _embedding()
        )
        pg_client.update_article_status(nid, "transformed")
        pg_client.insert_article_version(
            nid, "NT", {"title": "t", "body": "b"}, _embedding(0.1)
        )
    results = pg_client.find_feed_candidates(
        "NT", _embedding(0.0), [nid1], limit=50
    )
    ids = [r["news_id"] for r in results]
    assert nid2 in ids
    assert nid1 not in ids


@pytest.mark.integration
def test_integration_find_feed_candidates_cold_start(
    pg_client: PgVectorV2Client,
) -> None:
    nid = f"{IT_PREFIX}cold"
    pg_client.insert_article(
        nid, {"title": "t", "category": "IT_과학"}, _embedding()
    )
    pg_client.update_article_status(nid, "transformed")
    pg_client.insert_article_version(
        nid, "NT", {"title": "t", "body": "b"}, _embedding()
    )
    results = pg_client.find_feed_candidates("INTJ", None, [], limit=5)
    assert nid in [r["news_id"] for r in results]


# =============================================================================
# Performance — opt-in via `-m slow`
# =============================================================================

@pytest.fixture(scope="session")
def pg_session_client():
    if not _PG_V2_LIVE:
        pytest.skip("PG_V2_HOST / PG_V2_PASSWORD not set")
    client = PgVectorV2Client()
    try:
        yield client
    finally:
        client.close()


# Environment-split perf thresholds — network RTT dominates the measurement
# when the test runs outside the RDS's VPC, so the two modes serve different
# purposes rather than measuring the same thing on the same scale.
_PERF_P95_VPC_S = 0.200             # in-region Lambda → RDS production target
_PERF_P95_LOCAL_CEILING_S = 3.000   # catastrophic-regression sanity ceiling
# The local ceiling is deliberately loose — a measured Korea ↔ us-east-1
# baseline of ~800ms leaves no room for a meaningful p95 assertion, so the
# local mode only catches "query is obviously broken" situations (≥3s).
# Treat local p95 as a regression detector, never a performance metric.


@pytest.fixture(scope="session")
def seeded_feed_candidates(pg_session_client: PgVectorV2Client):
    """Seed 1000 transformed articles + NT versions in 2 bulk statements.

    Per-call seeding via ``insert_article`` + ``update_article_status`` +
    ``insert_article_version`` is **3000 round-trips**. From a local
    laptop to us-east-1 RDS (~150–200ms RTT) that alone is 7–10 minutes,
    which the user reasonably mistakes for a hang. Collapsing into two
    ``unnest``-based multi-row INSERTs brings setup under ~30s.

    This fixture deliberately bypasses ``insert_article`` /
    ``insert_article_version`` — those methods are tested elsewhere, and
    status is inserted directly as ``'transformed'`` (skipping the
    raw → transformed transition since no pipeline is running).

    NOTE: 1000 rows does not reflect production scale. Re-evaluate with
    100K+ rows in Phase 3. ivfflat ``lists=100`` is tuned for ~100K rows;
    at 1K rows a full scan may outperform the index. This test validates
    query correctness, not realistic latency.

    Pre- and post-seed cleanup both wipe PERF_PREFIX so an aborted
    previous perf run cannot corrupt the benchmark (stale rows with
    ON CONFLICT DO NOTHING would silently skip the fresh embeddings).

    SAFETY: every element passed into ``:embs::text[]`` is produced by
    ``_vec_literal`` on a list of Python floats — no user input or
    external-source string ever reaches the array.
    """
    _wipe_prefix(pg_session_client, PERF_PREFIX)

    N = 1000
    nids = [f"{PERF_PREFIX}{i:04d}" for i in range(N)]
    # ``seed`` uses ``i % 100`` so it repeats across blocks of 100 rows —
    # fine now that ``_embedding`` guarantees non-zero magnitude regardless
    # of seed value (see ``_embedding`` docstring).
    seeds = [(i % 100) / 100.0 for i in range(N)]
    article_embs = [_vec_literal(_embedding(s)) for s in seeds]
    version_embs = [_vec_literal(_embedding(s + 0.01)) for s in seeds]
    metas = ["{}"] * N

    # Bulk INSERT articles — 1 round-trip.
    pg_session_client.conn.run(
        """
        INSERT INTO articles
            (news_id, status, title, category, embedding, metadata)
        SELECT nid, 'transformed', ttl, cat, emb::vector, meta::jsonb
        FROM unnest(:nids::text[], :titles::text[], :cats::text[],
                    :embs::text[], :metas::text[])
             AS u(nid, ttl, cat, emb, meta)
        ON CONFLICT (news_id) DO NOTHING
        """,
        nids=nids,
        titles=[f"T{i}" for i in range(N)],
        cats=["IT_과학"] * N,
        embs=article_embs,
        metas=metas,
    )

    # Bulk INSERT article_versions — 1 round-trip.
    pg_session_client.conn.run(
        """
        INSERT INTO article_versions
            (news_id, mbti_type, title, body, embedding, metadata)
        SELECT nid, 'NT', ttl, body, emb::vector, meta::jsonb
        FROM unnest(:nids::text[], :titles::text[], :bodies::text[],
                    :embs::text[], :metas::text[])
             AS u(nid, ttl, body, emb, meta)
        ON CONFLICT (news_id, mbti_type) DO UPDATE SET
            title     = EXCLUDED.title,
            body      = EXCLUDED.body,
            embedding = EXCLUDED.embedding,
            metadata  = EXCLUDED.metadata
        """,
        nids=nids,
        titles=[f"T{i}_NT" for i in range(N)],
        bodies=[f"B{i}" for i in range(N)],
        embs=version_embs,
        metas=metas,
    )

    try:
        yield PERF_PREFIX
    finally:
        _wipe_prefix(pg_session_client, PERF_PREFIX)


@pytest.mark.integration
@pytest.mark.slow
def test_perf_find_feed_candidates_p95(
    pg_session_client: PgVectorV2Client,
    seeded_feed_candidates: str,
) -> None:
    """``find_feed_candidates`` p95 latency — two threshold modes by env.

    * ``BENCHMARK_ENV=aws_vpc``: enforces 200ms — the production
      Lambda → RDS target, meaningful only when the caller shares the
      RDS's VPC.
    * default (local): enforces a 3000ms **ceiling** only. Local
      measurements are network-bound (measured Korea ↔ us-east-1
      baseline ~800ms) and cannot validate query performance. Use the
      VPC mode for real perf validation. Local mode exists solely to
      catch catastrophic regressions (query going 3s+) that indicate
      code or schema issues independent of network conditions.

    See ``seeded_feed_candidates`` for scale caveats (1K rows vs the
    production-relevant ≥100K).
    """
    in_vpc = os.getenv("BENCHMARK_ENV") == "aws_vpc"

    query = _embedding(0.42)
    # Warm-up: connection pool, plan cache.
    for _ in range(3):
        pg_session_client.find_feed_candidates("NT", query, [], limit=50)
    latencies = []
    for _ in range(20):
        start = time.perf_counter()
        pg_session_client.find_feed_candidates("NT", query, [], limit=50)
        latencies.append(time.perf_counter() - start)
    # statistics.quantiles(n=20)[-1] is the 19th cut point ≈ 95th percentile.
    p95 = statistics.quantiles(latencies, n=20)[-1]

    if in_vpc:
        assert p95 < _PERF_P95_VPC_S, (
            f"VPC p95={p95 * 1000:.0f}ms exceeds target "
            f"{_PERF_P95_VPC_S * 1000:.0f}ms. "
            f"all latencies (ms): {[round(x * 1000, 1) for x in latencies]}"
        )
    else:
        # Local: ceiling catches catastrophic regression (query going 3s+),
        # tolerates Korea ↔ us-east-1 network variance (baseline ~800ms).
        assert p95 < _PERF_P95_LOCAL_CEILING_S, (
            f"local p95={p95 * 1000:.0f}ms exceeds ceiling "
            f"{_PERF_P95_LOCAL_CEILING_S * 1000:.0f}ms "
            f"(baseline ~800ms for Korea ↔ us-east-1, so this likely "
            f"indicates a query or schema regression, not network). "
            f"all latencies (ms): {[round(x * 1000, 1) for x in latencies]}"
        )
        # Log for manual regression tracking — visible via
        # `pytest --log-cli-level=INFO`.
        logger.info(
            f"local perf p95={p95 * 1000:.1f}ms "
            f"(ceiling {_PERF_P95_LOCAL_CEILING_S * 1000:.0f}ms, "
            f"baseline ~800ms)"
        )


# =============================================================================
# article_selections (TASK-2.6) — unit tests
# =============================================================================

IT_PREFIX_2_6 = "test_v2_2_6_it_"


def test_disabled_upsert_selection_score_noop() -> None:
    c = PgVectorV2Client(password="")
    c.upsert_selection_score(
        "n", "NT", date(2026, 4, 25), mbti_score=8.0, composite_score=7.5
    )  # must not raise


def test_disabled_rerank_selections_returns_zero() -> None:
    c = PgVectorV2Client(password="")
    assert c.rerank_selections(date(2026, 4, 25), "NT", top_n=20) == 0


def test_disabled_get_transform_queue_returns_empty() -> None:
    c = PgVectorV2Client(password="")
    assert c.get_transform_queue() == []


def test_disabled_mark_transformed_noop() -> None:
    c = PgVectorV2Client(password="")
    c.mark_transformed("n", "NT", date(2026, 4, 25))  # must not raise


def test_disabled_get_feed_returns_empty() -> None:
    c = PgVectorV2Client(password="")
    assert c.get_feed("NT") == []


# ── upsert_selection_score ───────────────────────────────────────────────────


def test_upsert_selection_score_binds_params_and_normalizes_group() -> None:
    c = _enabled()
    c.upsert_selection_score(
        "n1", "NT", date(2026, 4, 25),
        mbti_score=8.2, composite_score=7.8, quality_score=7.0,
    )
    c._conn.run.assert_called_once()
    sql = c._conn.run.call_args.args[0]
    kwargs = c._conn.run.call_args.kwargs
    assert "INSERT INTO article_selections" in sql
    assert "ON CONFLICT (news_id, mbti_type, selection_date)" in sql
    assert "scored_at       = now()" in sql
    assert "selected" not in sql.split("DO UPDATE SET")[1]
    assert "transformed_at" not in sql.split("DO UPDATE SET")[1]
    assert kwargs == {
        "news_id": "n1",
        "mbti_type": "NT",
        "selection_date": date(2026, 4, 25),
        "mbti_score": 8.2,
        "quality_score": 7.0,
        "composite_score": 7.8,
    }


def test_upsert_selection_score_accepts_full_mbti() -> None:
    c = _enabled()
    c.upsert_selection_score(
        "n1", "INTJ", date(2026, 4, 25),
        mbti_score=8.0, composite_score=7.5,
    )
    kwargs = c._conn.run.call_args.kwargs
    assert kwargs["mbti_type"] == "NT"


def test_upsert_selection_score_allows_null_quality() -> None:
    c = _enabled()
    c.upsert_selection_score(
        "n1", "NF", date(2026, 4, 25),
        mbti_score=5.0, composite_score=5.0, quality_score=None,
    )
    kwargs = c._conn.run.call_args.kwargs
    assert kwargs["quality_score"] is None


def test_upsert_selection_score_swallows_exception() -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("db down")
    c.upsert_selection_score(
        "n1", "NT", date(2026, 4, 25),
        mbti_score=8.0, composite_score=7.5,
    )  # must not raise


# ── rerank_selections ────────────────────────────────────────────────────────


def test_rerank_selections_binds_params_and_uses_row_number() -> None:
    c = _enabled()
    c._conn.run.return_value = []
    result = c.rerank_selections(date(2026, 4, 25), "NT", top_n=20)
    sql = c._conn.run.call_args.args[0]
    kwargs = c._conn.run.call_args.kwargs
    assert "WITH ranked AS" in sql
    assert "ROW_NUMBER() OVER" in sql
    assert "composite_score DESC" in sql
    assert "scored_at ASC" in sql
    assert "UPDATE article_selections s" in sql
    assert "r.rn <= :n" in sql
    assert kwargs == {"d": date(2026, 4, 25), "g": "NT", "n": 20}
    assert result == 0


def test_rerank_selections_counts_selected_from_returning() -> None:
    c = _enabled()
    c._conn.run.return_value = [(True,), (True,), (True,), (False,), (False,)]
    assert c.rerank_selections(date(2026, 4, 25), "NT", top_n=3) == 3


def test_rerank_selections_normalizes_mbti() -> None:
    c = _enabled()
    c._conn.run.return_value = []
    c.rerank_selections(date(2026, 4, 25), "ESFP", top_n=20)
    assert c._conn.run.call_args.kwargs["g"] == "SF"


def test_rerank_selections_swallows_exception() -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("db down")
    assert c.rerank_selections(date(2026, 4, 25), "NT", top_n=20) == 0


# ── get_transform_queue ──────────────────────────────────────────────────────


def test_get_transform_queue_binds_params_and_filters_correctly() -> None:
    c = _enabled()
    c._conn.run.return_value = []
    c.get_transform_queue(limit=15)
    sql = c._conn.run.call_args.args[0]
    assert "WHERE s.selected = TRUE AND s.transformed_at IS NULL" in sql
    assert "ORDER BY s.scored_at ASC" in sql
    assert "JOIN articles a ON a.news_id = s.news_id" in sql
    assert c._conn.run.call_args.kwargs == {"n": 15}


def test_get_transform_queue_parses_row_shape() -> None:
    c = _enabled()
    sel_id = uuid.uuid4()
    sel_date = date(2026, 4, 25)
    scored_at = datetime(2026, 4, 25, 10, 0, tzinfo=timezone.utc)
    pub_at = datetime(2026, 4, 25, 9, 0, tzinfo=timezone.utc)
    c._conn.run.return_value = [
        (sel_id, "n1", "NT", sel_date, 7.8, scored_at,
         "제목", "경제", pub_at, {"reporter": "lee"}),
    ]
    result = c.get_transform_queue(limit=20)
    assert len(result) == 1
    row = result[0]
    assert row["selection_id"] == sel_id
    assert row["news_id"] == "n1"
    assert row["mbti_type"] == "NT"
    assert row["selection_date"] == sel_date
    assert row["composite_score"] == 7.8
    assert row["scored_at"] == scored_at
    assert row["title"] == "제목"
    assert row["category"] == "경제"
    assert row["published_at"] == pub_at
    assert row["article_metadata"] == {"reporter": "lee"}


def test_get_transform_queue_swallows_exception() -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("db down")
    assert c.get_transform_queue() == []


# ── mark_transformed ─────────────────────────────────────────────────────────


def test_mark_transformed_binds_params_and_normalizes() -> None:
    c = _enabled()
    c.mark_transformed("n1", "INFP", date(2026, 4, 25))
    sql = c._conn.run.call_args.args[0]
    kwargs = c._conn.run.call_args.kwargs
    assert "UPDATE article_selections" in sql
    assert "SET transformed_at = now()" in sql
    assert kwargs == {"nid": "n1", "g": "NF", "d": date(2026, 4, 25)}


def test_mark_transformed_swallows_exception() -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("db down")
    c.mark_transformed("n1", "NT", date(2026, 4, 25))  # must not raise


# ── get_feed ─────────────────────────────────────────────────────────────────


def test_get_feed_default_cutoff_is_7_days_kst() -> None:
    c = _enabled()
    c._conn.run.return_value = []
    before = datetime.now(timezone(timedelta(hours=9))).date() - timedelta(days=7)
    c.get_feed("NT", limit=20)
    after = datetime.now(timezone(timedelta(hours=9))).date() - timedelta(days=7)
    cutoff = c._conn.run.call_args.kwargs["cutoff"]
    assert before <= cutoff <= after


def test_get_feed_respects_explicit_since_date() -> None:
    c = _enabled()
    c._conn.run.return_value = []
    custom = date(2026, 3, 1)
    c.get_feed("NT", limit=20, since_date=custom)
    assert c._conn.run.call_args.kwargs["cutoff"] == custom


def test_get_feed_binds_params_and_joins_versions() -> None:
    c = _enabled()
    c._conn.run.return_value = []
    c.get_feed("ESFP", limit=10, since_date=date(2026, 4, 18))
    sql = c._conn.run.call_args.args[0]
    kwargs = c._conn.run.call_args.kwargs
    assert "JOIN article_versions av" in sql
    assert "WHERE s.selected = TRUE" in sql
    assert "AND s.transformed_at IS NOT NULL" in sql
    assert "ORDER BY s.selection_date DESC, s.composite_score DESC" in sql
    assert kwargs == {"g": "SF", "cutoff": date(2026, 4, 18), "n": 10}


def test_get_feed_parses_row_shape() -> None:
    c = _enabled()
    sel_date = date(2026, 4, 25)
    xformed_at = datetime(2026, 4, 25, 11, 0, tzinfo=timezone.utc)
    pub_at = datetime(2026, 4, 25, 9, 0, tzinfo=timezone.utc)
    c._conn.run.return_value = [
        ("n1", "NT", sel_date, 8.1, xformed_at,
         "경제", pub_at, {"source": "xml"},
         "NT 제목", "NT 본문", {"prompt_version": "v1"}),
    ]
    result = c.get_feed("NT", limit=10)
    assert len(result) == 1
    row = result[0]
    assert row["news_id"] == "n1"
    assert row["mbti_type"] == "NT"
    assert row["composite_score"] == 8.1
    assert row["version_title"] == "NT 제목"
    assert row["version_body"] == "NT 본문"
    assert row["version_metadata"] == {"prompt_version": "v1"}


def test_get_feed_swallows_exception() -> None:
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("db down")
    assert c.get_feed("NT") == []


# =============================================================================
# get_article_with_version (TASK-6) — unit tests
# =============================================================================


def test_v2_2_6_get_article_with_version_returns_none_when_disabled() -> None:
    c = PgVectorV2Client(host="", password="")
    assert c.get_article_with_version("nid-1", "NT") is None


def test_v2_2_6_get_article_with_version_normalizes_full_mbti() -> None:
    """4-char MBTI (e.g. 'INTJ') gets reduced to 2-char group ('NT') via
    the shared _normalize_mbti_group util. Used by the Article API when
    a stored user mbti_type is passed straight through."""
    c = _enabled()
    c._conn.run.return_value = []
    c.get_article_with_version("nid-1", "INTJ")
    bound = c._conn.run.call_args.kwargs
    assert bound["g"] == "NT"


def test_v2_2_6_get_article_with_version_rejects_invalid_mbti() -> None:
    """Lowercase / unknown / wrong-length values are rejected by the shared
    normalizer (strict — handler validates user input before calling)."""
    c = _enabled()
    with pytest.raises(ValueError):
        c.get_article_with_version("nid-1", "nt")
    with pytest.raises(ValueError):
        c.get_article_with_version("nid-1", "XX")
    with pytest.raises(ValueError):
        c.get_article_with_version("nid-1", "INVALID")


def test_v2_2_6_get_article_with_version_returns_none_on_no_match() -> None:
    """No row returned (article missing OR no version for that MBTI) → None.
    Caller (Article API handler) treats None as 404."""
    c = _enabled()
    c._conn.run.return_value = []  # empty result set
    assert c.get_article_with_version("nid-missing", "NT") is None


def test_v2_2_6_get_article_with_version_parses_row_shape() -> None:
    """Verify the returned dict carries both article-level and version-level
    fields, flat (not nested), with correct keys for the API contract."""
    from datetime import datetime, timezone as _tz
    c = _enabled()
    pub_at = datetime(2026, 4, 26, 13, 0, tzinfo=_tz.utc)
    created = datetime(2026, 4, 27, 2, 0, tzinfo=_tz.utc)
    c._conn.run.return_value = [
        (
            "nid-1",                               # news_id
            "원본 제목",                           # original_title
            "사회",                                # category
            pub_at,                                # published_at
            {"press": "서울경제", "url": "u1"},    # article_metadata
            "NT",                                  # mbti_type
            "NT 톤 제목",                          # version_title
            "NT 본문 전체...",                     # version_body
            {"key_points": ["p1", "p2"]},          # version_metadata
            created,                               # version_created_at
        )
    ]
    result = c.get_article_with_version("nid-1", "NT")
    assert result is not None
    assert result["news_id"] == "nid-1"
    assert result["original_title"] == "원본 제목"
    assert result["category"] == "사회"
    assert result["published_at"] == pub_at
    assert result["article_metadata"] == {"press": "서울경제", "url": "u1"}
    assert result["mbti_type"] == "NT"
    assert result["version_title"] == "NT 톤 제목"
    assert result["version_body"] == "NT 본문 전체..."
    assert result["version_metadata"] == {"key_points": ["p1", "p2"]}
    assert result["version_created_at"] == created


def test_v2_2_6_get_article_with_version_swallows_exception() -> None:
    """DB exception → None (handler shows 404, not 500)."""
    c = _enabled()
    c._conn.run.side_effect = RuntimeError("db connection lost")
    assert c.get_article_with_version("nid-1", "NT") is None


def test_v2_2_6_get_article_with_version_binds_news_id_and_mbti() -> None:
    """SQL :nid and :g bind to function args exactly."""
    c = _enabled()
    c._conn.run.return_value = []
    c.get_article_with_version("very-specific-nid", "SF")
    bound = c._conn.run.call_args.kwargs
    assert bound["nid"] == "very-specific-nid"
    assert bound["g"] == "SF"


# =============================================================================
# article_selections (TASK-2.6) — integration tests
# =============================================================================


def _seed_article(client: PgVectorV2Client, news_id: str, *, status: str = "raw") -> None:
    """Insert a minimal article row for selection FK reference."""
    client.insert_article(
        news_id, {"title": f"T-{news_id}", "category": "경제"}, _embedding()
    )
    if status != "raw":
        client.update_article_status(news_id, status)


def _seed_version(
    client: PgVectorV2Client, news_id: str, mbti: str
) -> None:
    """Insert a minimal article_versions row so get_feed JOIN returns it."""
    client.insert_article_version(
        news_id, mbti,
        {"title": f"{mbti} 제목 {news_id}", "body": f"{mbti} 본문"},
        _embedding(0.2),
    )


@pytest.mark.integration
def test_integration_upsert_selection_score_roundtrip(pg_client: PgVectorV2Client) -> None:
    nid = f"{IT_PREFIX_2_6}rt1"
    _seed_article(pg_client, nid)
    sel_date = date(2026, 4, 25)
    pg_client.upsert_selection_score(
        nid, "NT", sel_date,
        mbti_score=8.0, composite_score=7.5, quality_score=7.0,
    )
    rows = pg_client.conn.run(
        "SELECT news_id, mbti_type, selection_date, mbti_score, "
        "quality_score, composite_score, selected, transformed_at "
        "FROM article_selections WHERE news_id = :n",
        n=nid,
    )
    assert len(rows) == 1
    r = rows[0]
    assert r[0] == nid
    assert r[1] == "NT"
    assert r[2] == sel_date
    assert float(r[3]) == 8.0
    assert float(r[4]) == 7.0
    assert float(r[5]) == 7.5
    assert r[6] is False
    assert r[7] is None


@pytest.mark.integration
def test_integration_upsert_selection_score_updates_scores_on_conflict(
    pg_client: PgVectorV2Client,
) -> None:
    nid = f"{IT_PREFIX_2_6}upd"
    _seed_article(pg_client, nid)
    sel_date = date(2026, 4, 25)
    pg_client.upsert_selection_score(
        nid, "NT", sel_date, mbti_score=5.0, composite_score=5.0,
    )
    pg_client.conn.run(
        "UPDATE article_selections SET selected = TRUE, transformed_at = now() "
        "WHERE news_id = :n", n=nid,
    )
    pg_client.upsert_selection_score(
        nid, "NT", sel_date,
        mbti_score=9.0, composite_score=8.5, quality_score=8.0,
    )
    rows = pg_client.conn.run(
        "SELECT mbti_score, composite_score, quality_score, selected, "
        "transformed_at IS NOT NULL "
        "FROM article_selections WHERE news_id = :n", n=nid,
    )
    r = rows[0]
    assert float(r[0]) == 9.0
    assert float(r[1]) == 8.5
    assert float(r[2]) == 8.0
    assert r[3] is True
    assert r[4] is True


@pytest.mark.integration
def test_integration_rerank_selections_flags_top_n(pg_client: PgVectorV2Client) -> None:
    sel_date = date(2026, 4, 25)
    for i in range(5):
        nid = f"{IT_PREFIX_2_6}rk{i}"
        _seed_article(pg_client, nid)
        pg_client.upsert_selection_score(
            nid, "NT", sel_date,
            mbti_score=10.0 - i, composite_score=10.0 - i,
        )
    count = pg_client.rerank_selections(sel_date, "NT", top_n=3)
    assert count == 3
    rows = pg_client.conn.run(
        "SELECT news_id, selected FROM article_selections "
        "WHERE news_id LIKE :p ORDER BY composite_score DESC",
        p=f"{IT_PREFIX_2_6}rk%",
    )
    flags = [r[1] for r in rows]
    assert flags == [True, True, True, False, False]


@pytest.mark.integration
def test_integration_rerank_preserves_transformed_at(pg_client: PgVectorV2Client) -> None:
    """Flipping selected TRUE -> FALSE must NOT clear transformed_at.

    Race insurance: an article re-entering selection on a later same-day
    run must skip re-transform.
    """
    sel_date = date(2026, 4, 25)
    winner = f"{IT_PREFIX_2_6}win"
    loser = f"{IT_PREFIX_2_6}lose"
    for nid, score in ((winner, 9.0), (loser, 1.0)):
        _seed_article(pg_client, nid)
        pg_client.upsert_selection_score(
            nid, "NT", sel_date, mbti_score=score, composite_score=score,
        )
    pg_client.rerank_selections(sel_date, "NT", top_n=2)
    pg_client.mark_transformed(loser, "NT", sel_date)
    pg_client.rerank_selections(sel_date, "NT", top_n=1)
    rows = pg_client.conn.run(
        "SELECT news_id, selected, transformed_at IS NOT NULL "
        "FROM article_selections WHERE news_id LIKE :p ORDER BY news_id",
        p=f"{IT_PREFIX_2_6}%",
    )
    by_id = {r[0]: (r[1], r[2]) for r in rows}
    assert by_id[winner] == (True, False)
    assert by_id[loser] == (False, True)


@pytest.mark.integration
def test_integration_get_transform_queue_fifo_and_filters(
    pg_client: PgVectorV2Client,
) -> None:
    sel_date = date(2026, 4, 25)
    ids = [f"{IT_PREFIX_2_6}q{i}" for i in range(4)]
    for nid in ids:
        _seed_article(pg_client, nid)
    for i, nid in enumerate(ids):
        pg_client.upsert_selection_score(
            nid, "NT", sel_date,
            mbti_score=9.0 - i, composite_score=9.0 - i,
        )
    pg_client.rerank_selections(sel_date, "NT", top_n=10)
    pg_client.mark_transformed(ids[3], "NT", sel_date)
    queue = pg_client.get_transform_queue(limit=10)
    queue_ids = [q["news_id"] for q in queue if q["news_id"].startswith(IT_PREFIX_2_6)]
    assert queue_ids == ids[:3]


@pytest.mark.integration
def test_integration_mark_transformed_idempotent(pg_client: PgVectorV2Client) -> None:
    nid = f"{IT_PREFIX_2_6}mt"
    sel_date = date(2026, 4, 25)
    _seed_article(pg_client, nid)
    pg_client.upsert_selection_score(
        nid, "NT", sel_date, mbti_score=8.0, composite_score=8.0,
    )
    pg_client.rerank_selections(sel_date, "NT", top_n=5)
    pg_client.mark_transformed(nid, "NT", sel_date)
    pg_client.mark_transformed(nid, "NT", sel_date)
    rows = pg_client.conn.run(
        "SELECT transformed_at IS NOT NULL FROM article_selections "
        "WHERE news_id = :n", n=nid,
    )
    assert rows[0][0] is True


@pytest.mark.integration
def test_integration_mark_transformed_nonexistent_row_is_silent(
    pg_client: PgVectorV2Client,
) -> None:
    pg_client.mark_transformed(
        f"{IT_PREFIX_2_6}ghost", "NT", date(2026, 4, 25),
    )


@pytest.mark.integration
def test_integration_get_feed_returns_only_selected_and_transformed(
    pg_client: PgVectorV2Client,
) -> None:
    sel_date = date(2026, 4, 25)
    a, b, c = (f"{IT_PREFIX_2_6}fd{x}" for x in "abc")
    for nid in (a, b, c):
        _seed_article(pg_client, nid)
    pg_client.upsert_selection_score(a, "NT", sel_date, mbti_score=9.0, composite_score=9.0)
    pg_client.upsert_selection_score(b, "NT", sel_date, mbti_score=8.0, composite_score=8.0)
    pg_client.upsert_selection_score(c, "NT", sel_date, mbti_score=1.0, composite_score=1.0)
    pg_client.rerank_selections(sel_date, "NT", top_n=2)
    _seed_version(pg_client, a, "NT")
    _seed_version(pg_client, c, "NT")
    pg_client.mark_transformed(a, "NT", sel_date)
    pg_client.mark_transformed(c, "NT", sel_date)
    feed = pg_client.get_feed("NT", limit=10, since_date=sel_date)
    feed_ids = [f["news_id"] for f in feed if f["news_id"].startswith(IT_PREFIX_2_6)]
    assert feed_ids == [a]


@pytest.mark.integration
def test_integration_get_feed_respects_since_date(pg_client: PgVectorV2Client) -> None:
    old_date = date(2026, 4, 10)
    recent = date(2026, 4, 25)
    old_id = f"{IT_PREFIX_2_6}old"
    new_id = f"{IT_PREFIX_2_6}new"
    for nid, d in ((old_id, old_date), (new_id, recent)):
        _seed_article(pg_client, nid)
        pg_client.upsert_selection_score(
            nid, "NT", d, mbti_score=9.0, composite_score=9.0,
        )
        pg_client.rerank_selections(d, "NT", top_n=5)
        _seed_version(pg_client, nid, "NT")
        pg_client.mark_transformed(nid, "NT", d)
    feed = pg_client.get_feed("NT", limit=10, since_date=date(2026, 4, 20))
    feed_ids = [f["news_id"] for f in feed if f["news_id"].startswith(IT_PREFIX_2_6)]
    assert feed_ids == [new_id]


# =============================================================================
# get_preference_embedding — TASK-3.1 prerequisite (Round 5-A)
# =============================================================================


@pytest.mark.integration
@pytest.mark.skipif(
    not (os.getenv("PG_V2_HOST") and os.getenv("PG_V2_PASSWORD")),
    reason="PG_V2_HOST/PG_V2_PASSWORD required",
)
class TestGetPreferenceEmbedding:
    """get_preference_embedding — TASK-3.1 prerequisite."""

    PREFIX = "test_v2_1_3_pref_emb_"

    @pytest.fixture
    def pg(self):
        c = PgVectorV2Client()
        # belt-and-suspenders pre-wipe (session conftest already covers test_v2_1_3_)
        c.conn.run(
            f"DELETE FROM user_profiles WHERE user_id LIKE '{self.PREFIX}%'"
        )
        yield c
        c.conn.run(
            f"DELETE FROM user_profiles WHERE user_id LIKE '{self.PREFIX}%'"
        )
        c.close()

    def test_returns_none_when_user_has_no_profile(self, pg):
        assert pg.get_preference_embedding(f"{self.PREFIX}nobody") is None

    def test_returns_none_when_profile_has_null_embedding(self, pg):
        uid = f"{self.PREFIX}null_emb"
        pg.upsert_user_profile(
            user_id=uid,
            mbti_type="INTJ",
            category_weights={},
            preference_embedding=None,
        )
        assert pg.get_preference_embedding(uid) is None

    def test_returns_stored_vector_round_trip(self, pg):
        uid = f"{self.PREFIX}round_trip"
        # Distinctive pattern that's unlikely to collide with floating-
        # point noise (negative + alternating sign + non-zero).
        original = [(i * 0.001) * (-1 if i % 2 else 1) for i in range(1024)]
        pg.upsert_user_profile(
            user_id=uid,
            mbti_type="ENFP",
            category_weights={"economy": 0.5},
            preference_embedding=original,
        )
        retrieved = pg.get_preference_embedding(uid)
        assert retrieved is not None
        assert len(retrieved) == 1024
        # pgvector stores as float32 internally — exact equality fails for
        # values that don't round-trip cleanly. Use approx with reasonable
        # tolerance for float32 precision.
        assert retrieved == pytest.approx(original, rel=1e-5, abs=1e-5)


# =============================================================================
# get_version_embeddings — Round 5-B prerequisite for MMR
# =============================================================================


@pytest.mark.integration
@pytest.mark.skipif(
    not (os.getenv("PG_V2_HOST") and os.getenv("PG_V2_PASSWORD")),
    reason="PG_V2_HOST/PG_V2_PASSWORD required",
)
class TestGetVersionEmbeddings:
    """get_version_embeddings — Round 5-B prerequisite for MMR."""

    PREFIX = "test_v2_3_3_emb_"

    @pytest.fixture
    def pg(self):
        c = PgVectorV2Client()
        c.conn.run(
            f"DELETE FROM article_versions WHERE news_id LIKE '{self.PREFIX}%'"
        )
        c.conn.run(
            f"DELETE FROM articles WHERE news_id LIKE '{self.PREFIX}%'"
        )
        yield c
        c.conn.run(
            f"DELETE FROM article_versions WHERE news_id LIKE '{self.PREFIX}%'"
        )
        c.conn.run(
            f"DELETE FROM articles WHERE news_id LIKE '{self.PREFIX}%'"
        )
        c.close()

    def test_empty_input_returns_empty(self, pg):
        assert pg.get_version_embeddings([], "NT") == {}

    def test_unknown_news_ids_yield_empty(self, pg):
        result = pg.get_version_embeddings(
            [f"{self.PREFIX}does_not_exist"], "NT"
        )
        assert result == {}

    def test_round_trip_single(self, pg):
        nid = f"{self.PREFIX}rt1"
        article_emb = [0.1] * 1024
        version_emb = [(i * 0.001) * (-1 if i % 2 else 1) for i in range(1024)]
        # Insert article + NT version
        pg.insert_article(
            news_id=nid,
            metadata={"title": "test", "category": "economy"},
            embedding=article_emb,
        )
        pg.insert_article_version(
            news_id=nid,
            mbti_type="NT",
            metadata={"title": "test NT", "body": "body"},
            embedding=version_emb,
        )
        result = pg.get_version_embeddings([nid], "NT")
        assert nid in result
        assert len(result[nid]) == 1024
        # pgvector stores float32 — use approx
        assert result[nid] == pytest.approx(version_emb, rel=1e-5, abs=1e-5)

    def test_filters_by_mbti_group(self, pg):
        """Same news_id, different mbti groups → only requested group returned."""
        nid = f"{self.PREFIX}multi_group"
        nt_emb = [0.1] * 1024
        nf_emb = [0.9] * 1024
        pg.insert_article(
            news_id=nid,
            metadata={"title": "t", "category": "tech"},
            embedding=[0.5] * 1024,
        )
        pg.insert_article_version(
            news_id=nid, mbti_type="NT",
            metadata={"title": "NT t", "body": "b"}, embedding=nt_emb,
        )
        pg.insert_article_version(
            news_id=nid, mbti_type="NF",
            metadata={"title": "NF t", "body": "b"}, embedding=nf_emb,
        )
        nt_result = pg.get_version_embeddings([nid], "NT")
        nf_result = pg.get_version_embeddings([nid], "NF")
        assert nt_result[nid] == pytest.approx(nt_emb, rel=1e-5, abs=1e-5)
        assert nf_result[nid] == pytest.approx(nf_emb, rel=1e-5, abs=1e-5)

    def test_partial_match_returns_only_present(self, pg):
        present = f"{self.PREFIX}present"
        missing = f"{self.PREFIX}missing"
        pg.insert_article(
            news_id=present, metadata={"title": "t"}, embedding=[0.0] * 1024
        )
        pg.insert_article_version(
            news_id=present, mbti_type="NT",
            metadata={"title": "t", "body": "b"}, embedding=[0.5] * 1024,
        )
        result = pg.get_version_embeddings([present, missing], "NT")
        assert present in result
        assert missing not in result


# =============================================================================
# Round 5-D: find_active_users_since + get_interaction_centroid_data
# =============================================================================


@pytest.mark.integration
@pytest.mark.skipif(
    not (os.getenv("PG_V2_HOST") and os.getenv("PG_V2_PASSWORD")),
    reason="PG_V2_HOST/PG_V2_PASSWORD required",
)
class TestFindActiveUsersSince:
    PREFIX = "test_v2_3_5_active_"

    @pytest.fixture
    def pg(self):
        c = PgVectorV2Client()
        c.conn.run(
            f"DELETE FROM user_interactions WHERE user_id LIKE '{self.PREFIX}%'"
        )
        yield c
        c.conn.run(
            f"DELETE FROM user_interactions WHERE user_id LIKE '{self.PREFIX}%'"
        )
        c.close()

    def test_returns_distinct_users_in_window(self, pg):
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)

        # Insert: u1 has 2 interactions today, u2 has 1 today, u3 only old
        for nid_suffix in ("a", "b"):
            pg.record_interaction(
                user_id=f"{self.PREFIX}u1",
                news_id=f"{self.PREFIX}news_{nid_suffix}",
                mbti_type="NT",
                interaction_type="click",
            )
        pg.record_interaction(
            user_id=f"{self.PREFIX}u2",
            news_id=f"{self.PREFIX}news_c",
            mbti_type="NT",
            interaction_type="click",
        )
        # u3: insert with old created_at (40 days ago)
        pg.conn.run(
            """
            INSERT INTO user_interactions
                (user_id, news_id, mbti_type, interaction_type, created_at)
            VALUES (:uid, :nid, 'NT', 'click', now() - interval '40 days')
            """,
            uid=f"{self.PREFIX}u3",
            nid=f"{self.PREFIX}news_d",
        )

        cutoff = now - timedelta(days=30)
        active = pg.find_active_users_since(cutoff)

        # u1, u2 in window; u3 outside; other PREFIX-unrelated users
        # may be in the result too (live DB) — filter to ours
        ours = [u for u in active if u.startswith(self.PREFIX)]
        assert set(ours) == {f"{self.PREFIX}u1", f"{self.PREFIX}u2"}

    def test_empty_when_no_active(self, pg):
        from datetime import datetime, timedelta, timezone
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        active = pg.find_active_users_since(cutoff)
        ours = [u for u in active if u.startswith(self.PREFIX)]
        assert ours == []


@pytest.mark.integration
@pytest.mark.skipif(
    not (os.getenv("PG_V2_HOST") and os.getenv("PG_V2_PASSWORD")),
    reason="PG_V2_HOST/PG_V2_PASSWORD required",
)
class TestGetInteractionCentroidData:
    PREFIX = "test_v2_3_5_centroid_"

    @pytest.fixture
    def pg(self):
        c = PgVectorV2Client()
        c.conn.run(
            f"DELETE FROM user_interactions WHERE user_id LIKE '{self.PREFIX}%'"
        )
        c.conn.run(
            f"DELETE FROM articles WHERE news_id LIKE '{self.PREFIX}%'"
        )
        yield c
        c.conn.run(
            f"DELETE FROM user_interactions WHERE user_id LIKE '{self.PREFIX}%'"
        )
        c.conn.run(
            f"DELETE FROM articles WHERE news_id LIKE '{self.PREFIX}%'"
        )
        c.close()

    def test_no_interactions_returns_empty(self, pg):
        from datetime import datetime, timedelta, timezone
        since = datetime.now(timezone.utc) - timedelta(days=30)
        result = pg.get_interaction_centroid_data(
            f"{self.PREFIX}ghost", since
        )
        assert result["distinct_news_count"] == 0
        assert result["centroid_embedding"] is None
        assert result["events"] == []

    def test_aggregates_events_and_computes_centroid(self, pg):
        from datetime import datetime, timedelta, timezone
        # Insert 3 articles with distinct embeddings + categories
        for i, (cat, vec_val) in enumerate([
            ("economy", 0.1),
            ("tech", 0.5),
            ("economy", 0.3),
        ]):
            nid = f"{self.PREFIX}art_{i}"
            pg.insert_article(
                news_id=nid,
                metadata={"title": f"t{i}", "category": cat},
                embedding=[vec_val] * 1024,
            )

        uid = f"{self.PREFIX}user_a"
        # User clicked all 3 + reacted to one
        for i in range(3):
            pg.record_interaction(
                user_id=uid,
                news_id=f"{self.PREFIX}art_{i}",
                mbti_type="NT",
                interaction_type="click",
            )
        pg.record_interaction(
            user_id=uid,
            news_id=f"{self.PREFIX}art_0",
            mbti_type="NT",
            interaction_type="react",
            reaction_type="like",
        )

        since = datetime.now(timezone.utc) - timedelta(days=30)
        result = pg.get_interaction_centroid_data(uid, since)

        # 3 distinct news_ids (4 events but 3 distinct articles)
        assert result["distinct_news_count"] == 3
        assert len(result["events"]) == 4

        # Centroid = avg of 0.1, 0.5, 0.3 = 0.3 in every dim
        assert result["centroid_embedding"] is not None
        assert len(result["centroid_embedding"]) == 1024
        # pgvector AVG returns float32 — small tolerance
        for v in result["centroid_embedding"][:10]:  # sample
            assert v == pytest.approx(0.3, rel=1e-4, abs=1e-4)

        # Events have category populated from articles JOIN
        cats_in_events = {e["category"] for e in result["events"]}
        assert cats_in_events == {"economy", "tech"}

    def test_only_returns_in_window(self, pg):
        from datetime import datetime, timedelta, timezone
        nid_old = f"{self.PREFIX}old"
        nid_new = f"{self.PREFIX}new"
        for nid in (nid_old, nid_new):
            pg.insert_article(
                news_id=nid,
                metadata={"title": nid, "category": "tech"},
                embedding=[0.5] * 1024,
            )

        uid = f"{self.PREFIX}user_b"
        # Old: 40 days ago
        pg.conn.run(
            """
            INSERT INTO user_interactions
                (user_id, news_id, mbti_type, interaction_type, created_at)
            VALUES (:uid, :nid, 'NT', 'click', now() - interval '40 days')
            """,
            uid=uid, nid=nid_old,
        )
        # New: just now
        pg.record_interaction(
            user_id=uid, news_id=nid_new,
            mbti_type="NT", interaction_type="click",
        )

        since = datetime.now(timezone.utc) - timedelta(days=30)
        result = pg.get_interaction_centroid_data(uid, since)
        assert result["distinct_news_count"] == 1
        assert {e["news_id"] for e in result["events"]} == {nid_new}


# =============================================================================
# Unit — front page read path (fake conn, DB 불필요)
# =============================================================================


class _FakeConn:
    """pg8000 conn.run 흉내 — 호출 기록 + canned rows 반환."""

    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def run(self, sql, **params):
        self.calls.append((sql, params))
        return self.rows


def _client_with_fake_conn(rows):
    c = PgVectorV2Client.__new__(PgVectorV2Client)  # __init__(env) 우회
    c._enabled = True
    c._conn = _FakeConn(rows)
    return c


def test_get_front_page_articles_shapes_rows() -> None:
    published = _dt.datetime(2026, 7, 22, 17, 29, tzinfo=_dt.timezone.utc)
    rows = [
        ["2KF26GAWZP", "폴더블 공개", "경제", published,
         {"paper_paragraph": "TOP", "url": "https://sedaily.com/a"}],
    ]
    c = _client_with_fake_conn(rows)
    out = c.get_front_page_articles("20260723")
    assert out[0]["news_id"] == "2KF26GAWZP"
    assert out[0]["published_at"] == published.isoformat()
    assert out[0]["metadata"]["paper_paragraph"] == "TOP"
    sql, params = c._conn.calls[0]
    assert "paper_number" in sql and params == {"pdate": "20260723"}


def test_get_front_page_articles_parses_string_metadata() -> None:
    rows = [["N1", "t", None, None, '{"url": "u"}']]
    c = _client_with_fake_conn(rows)
    assert c.get_front_page_articles("20260723")[0]["metadata"] == {"url": "u"}


def test_get_front_page_articles_disabled_returns_empty() -> None:
    c = PgVectorV2Client.__new__(PgVectorV2Client)
    c._enabled = False
    c._conn = None
    assert c.get_front_page_articles("20260723") == []


def test_get_latest_front_page_date_returns_scalar() -> None:
    c = _client_with_fake_conn([["20260722"]])
    assert c.get_latest_front_page_date("20260723") == "20260722"
    _, params = c._conn.calls[0]
    assert params == {"ub": "20260723"}


def test_get_latest_front_page_date_none_when_no_rows() -> None:
    c = _client_with_fake_conn([[None]])
    assert c.get_latest_front_page_date("20260723") is None


# =============================================================================
# Unit — editor pick candidates 는 1면 기사로 한정 (2026-07-24)
# =============================================================================


def test_editor_pick_candidates_restricted_to_front_page() -> None:
    rows = [[
        "N1", "1면 톱 기사", "경제",
        {"paper_number": "1", "paper_paragraph": "TOP", "content_preview": "요약"},
        {}, {}, 0.91, None,
    ]]
    c = _client_with_fake_conn(rows)
    out = c.get_editor_pick_candidates("2026-07-24", limit=10)

    assert out[0]["article_id"] == "N1"
    assert out[0]["snippet"] == "요약"

    sql, params = c._conn.calls[0]
    # 1면 한정 + 대상 지면일 fallback(MAX <= letter_date) 이 SQL 에 존재해야 한다.
    assert "a.metadata->>'paper_number' = '1'" in sql
    assert "MAX(a.metadata->>'paper_date')" in sql
    assert "replace(:ldate, '-', '')" in sql
    # 지면 톱 우선 정렬
    assert "(a.metadata->>'paper_paragraph' = 'TOP') DESC" in sql
    # Selector 점수는 LEFT JOIN — 미선별 1면도 후보에서 빠지지 않는다.
    assert "LEFT JOIN scores sc" in sql
    assert params == {"ldate": "2026-07-24", "lim": 10}


def test_editor_pick_candidates_disabled_returns_empty() -> None:
    c = PgVectorV2Client.__new__(PgVectorV2Client)
    c._enabled = False
    c._conn = None
    assert c.get_editor_pick_candidates("2026-07-24") == []
