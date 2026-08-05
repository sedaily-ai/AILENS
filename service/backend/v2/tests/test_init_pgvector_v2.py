"""Unit tests for v2.infrastructure.init_pgvector_v2.

These tests never open a real database connection. The DDL apply path is
exercised via MagicMock connections so we can verify guardrail logic
(env validation, wrong-database abort, confirmation prompt) without
requiring PG_V2_HOST / PG_V2_PASSWORD.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from v2.infrastructure.init_pgvector_v2 import (
    EXPECTED_DATABASE,
    EXPECTED_TABLES,
    apply_statements,
    confirm,
    list_tables,
    load_schema,
    main,
    parse_statements,
    validate_env,
    verify_database,
)


# ── load_schema / schema content ──────────────────────────────────────────────

def test_load_schema_returns_nonempty_text() -> None:
    sql = load_schema()
    assert isinstance(sql, str)
    assert len(sql) > 500


def test_schema_has_vector_extension() -> None:
    assert "CREATE EXTENSION IF NOT EXISTS vector" in load_schema()


def test_schema_has_pgcrypto_extension() -> None:
    assert "CREATE EXTENSION IF NOT EXISTS pgcrypto" in load_schema()


@pytest.mark.parametrize(
    "table",
    ["articles", "article_versions", "user_profiles", "user_interactions", "article_selections"],
)
def test_schema_has_five_tables(table: str) -> None:
    sql = load_schema()
    assert f"CREATE TABLE IF NOT EXISTS {table}" in sql


def test_schema_has_exactly_three_vector_columns() -> None:
    # ivfflat indexes = vector columns that we index = 3 (articles,
    # article_versions, user_profiles.preference). user_interactions has none.
    sql = load_schema()
    assert sql.count("USING ivfflat") == 3
    assert "vector_cosine_ops" in sql


def test_schema_has_category_published_index() -> None:
    assert "idx_articles_category_published" in load_schema()


def test_schema_has_user_created_index() -> None:
    assert "idx_user_interactions_user_created" in load_schema()


def test_schema_has_foreign_key_cascade() -> None:
    assert "REFERENCES articles(news_id) ON DELETE CASCADE" in load_schema()


def test_schema_enforces_mbti_group_check() -> None:
    # article_versions and user_interactions use 2-char group
    assert "'NT','NF','ST','SF'" in load_schema()


def test_schema_enforces_full_mbti_check() -> None:
    # user_profiles uses full 16-value MBTI
    sql = load_schema()
    for mbti in ("INTJ", "INTP", "ENFJ", "ENFP", "ESTJ", "ISFP"):
        assert f"'{mbti}'" in sql, f"missing {mbti} in MBTI CHECK"


# ── parse_statements ──────────────────────────────────────────────────────────

def test_parse_statements_empty_input() -> None:
    assert parse_statements("") == []


def test_parse_statements_only_comments() -> None:
    assert parse_statements("-- foo\n-- bar") == []


def test_parse_statements_strips_line_comments() -> None:
    stmts = parse_statements("-- comment\nCREATE TABLE x (a int);")
    assert len(stmts) == 1
    assert stmts[0].startswith("CREATE TABLE")
    assert "comment" not in stmts[0]


def test_parse_statements_splits_on_semicolons() -> None:
    stmts = parse_statements("CREATE TABLE a (x int); CREATE TABLE b (y int);")
    assert len(stmts) == 2


def test_parse_statements_ignores_empty_fragments() -> None:
    assert parse_statements(";;  ;\nCREATE TABLE a (x int);;") == [
        "CREATE TABLE a (x int)"
    ]


def test_real_schema_parses_into_expected_count() -> None:
    # 2 extensions + 5 CREATE TABLE + 11 indexes = 18
    # (articles: 3, article_versions: 2, user_profiles: 1, user_interactions: 2, article_selections: 3)
    stmts = parse_statements(load_schema())
    assert len(stmts) == 18, f"expected 18 statements, got {len(stmts)}"


# ── validate_env ──────────────────────────────────────────────────────────────

def test_validate_env_returns_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PG_V2_HOST", "example.rds.amazonaws.com")
    monkeypatch.setenv("PG_V2_PASSWORD", "secret")
    assert validate_env() == ("example.rds.amazonaws.com", "secret")


def test_validate_env_exits_if_host_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PG_V2_HOST", raising=False)
    monkeypatch.setenv("PG_V2_PASSWORD", "secret")
    with pytest.raises(SystemExit) as exc:
        validate_env()
    assert exc.value.code == 1


def test_validate_env_exits_if_password_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PG_V2_HOST", "example.rds.amazonaws.com")
    monkeypatch.delenv("PG_V2_PASSWORD", raising=False)
    with pytest.raises(SystemExit) as exc:
        validate_env()
    assert exc.value.code == 1


def test_validate_env_rejects_whitespace_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PG_V2_HOST", "   ")
    monkeypatch.setenv("PG_V2_PASSWORD", "secret")
    with pytest.raises(SystemExit):
        validate_env()


# ── verify_database ───────────────────────────────────────────────────────────

def test_verify_database_accepts_expected_name() -> None:
    conn = MagicMock()
    conn.run.return_value = [[EXPECTED_DATABASE]]
    assert verify_database(conn) == EXPECTED_DATABASE


def test_verify_database_rejects_v1_database() -> None:
    conn = MagicMock()
    conn.run.return_value = [["ailens"]]   # v1 name
    with pytest.raises(SystemExit) as exc:
        verify_database(conn)
    assert exc.value.code == 1


def test_verify_database_rejects_empty_result() -> None:
    conn = MagicMock()
    conn.run.return_value = []
    with pytest.raises(SystemExit):
        verify_database(conn)


# ── confirm ───────────────────────────────────────────────────────────────────

def test_confirm_proceeds_on_y(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("builtins.input", lambda _prompt: "y")
    confirm("ailens_v2")  # must NOT raise


def test_confirm_proceeds_on_Y(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("builtins.input", lambda _prompt: "Y")
    confirm("ailens_v2")


def test_confirm_aborts_on_no(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("builtins.input", lambda _prompt: "n")
    with pytest.raises(SystemExit):
        confirm("ailens_v2")


def test_confirm_aborts_on_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("builtins.input", lambda _prompt: "")
    with pytest.raises(SystemExit):
        confirm("ailens_v2")


def test_confirm_aborts_on_eof(monkeypatch: pytest.MonkeyPatch) -> None:
    def raise_eof(_prompt: str) -> str:
        raise EOFError()

    monkeypatch.setattr("builtins.input", raise_eof)
    with pytest.raises(SystemExit):
        confirm("ailens_v2")


# ── apply_statements / list_tables ────────────────────────────────────────────

def test_apply_statements_runs_each() -> None:
    conn = MagicMock()
    count = apply_statements(
        conn, ["CREATE TABLE a (x int)", "CREATE INDEX i ON a (x)"]
    )
    assert count == 2
    assert conn.run.call_count == 2


def test_list_tables_returns_names_in_query_order() -> None:
    conn = MagicMock()
    conn.run.return_value = [
        ["article_versions"],
        ["articles"],
        ["user_interactions"],
        ["user_profiles"],
    ]
    tables = list_tables(conn)
    assert tables == [
        "article_versions",
        "articles",
        "user_interactions",
        "user_profiles",
    ]


# ── main: --dry-run ───────────────────────────────────────────────────────────

def test_main_dry_run_prints_schema(capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = main(["--dry-run"])
    captured = capsys.readouterr()
    assert exit_code == 0
    assert "[DRY RUN]" in captured.out
    assert "CREATE TABLE IF NOT EXISTS articles" in captured.out
    assert "14 statement" not in captured.out
    assert "18 statement" in captured.out


def test_main_dry_run_does_not_require_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("PG_V2_HOST", raising=False)
    monkeypatch.delenv("PG_V2_PASSWORD", raising=False)
    assert main(["--dry-run"]) == 0


def test_main_non_dry_run_requires_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PG_V2_HOST", raising=False)
    monkeypatch.delenv("PG_V2_PASSWORD", raising=False)
    with pytest.raises(SystemExit) as exc:
        main([])
    assert exc.value.code == 1


# ── constant coherence ────────────────────────────────────────────────────────

def test_expected_tables_constant_matches_documented_set() -> None:
    assert EXPECTED_TABLES == {
        "articles",
        "article_versions",
        "user_profiles",
        "user_interactions",
        "article_selections",
    }
