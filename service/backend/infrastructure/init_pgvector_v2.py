#!/usr/bin/env python3
"""Initialize the AI LENS v2 pgvector schema.

Reads v2/infrastructure/schema_v2.sql and applies it to the RDS instance
specified by PG_V2_HOST / PG_V2_PASSWORD. Idempotent: safe to re-run.

Usage
-----
    python3 v2/infrastructure/init_pgvector_v2.py --dry-run
        Print the schema and exit. No DB connection.

    python3 v2/infrastructure/init_pgvector_v2.py
        Connect, verify target DB is ailens_v2, prompt for confirmation,
        then apply every DDL statement and list resulting tables.

    python3 v2/infrastructure/init_pgvector_v2.py --yes
        Same as above but skip the interactive confirmation (for CI/CD).

Guardrails
----------
1. PG_V2_HOST and PG_V2_PASSWORD env vars are required for actual runs.
   Missing/empty -> exit 1 before any network call.
2. After connecting, SELECT current_database() must return 'ailens_v2'.
   Any other name -> abort BEFORE running any DDL. This prevents accidentally
   applying the v2 schema to the v1 instance (ailens).
3. A y/N confirmation prompt is shown unless --yes is passed. EOF/empty/'n'
   all abort.

Per .clauderules #4, Claude Code does not run actual DDL. The human operator
invokes this script once PG_V2_HOST/PG_V2_PASSWORD are set in the shell.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import List, Sequence

SCHEMA_PATH = Path(__file__).parent / "schema_v2.sql"

HOST_ENV = "PG_V2_HOST"
PASSWORD_ENV = "PG_V2_PASSWORD"
EXPECTED_DATABASE = "ailens_v2"
DEFAULT_USER = "ailens"
DEFAULT_PORT = 5432

EXPECTED_TABLES = {
    "articles",
    "article_versions",
    "user_profiles",
    "user_interactions",
    "article_selections",
}


# ── file / SQL parsing ────────────────────────────────────────────────────────

def load_schema() -> str:
    """Read schema_v2.sql from disk."""
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(f"Schema file not found: {SCHEMA_PATH}")
    return SCHEMA_PATH.read_text(encoding="utf-8")


def parse_statements(sql_text: str) -> List[str]:
    """Split SQL into individual statements.

    Strips line comments (``-- ...``) and splits on ``;``. Does not handle
    ``--`` inside string literals or ``/* ... */`` block comments; schema_v2.sql
    has neither, so naive parsing is sufficient.
    """
    cleaned: List[str] = []
    for line in sql_text.splitlines():
        if "--" in line:
            line = line[: line.index("--")]
        cleaned.append(line)
    joined = "\n".join(cleaned)
    return [s.strip() for s in joined.split(";") if s.strip()]


# ── environment + connection guardrails ──────────────────────────────────────

def validate_env() -> tuple[str, str]:
    """Return (host, password). Exit(1) if either is missing/blank."""
    host = os.environ.get(HOST_ENV, "").strip()
    password = os.environ.get(PASSWORD_ENV, "").strip()
    if not host or not password:
        print(
            f"ERROR: {HOST_ENV} and {PASSWORD_ENV} env vars required.",
            file=sys.stderr,
        )
        print(f"  export {HOST_ENV}='<rds-endpoint>'", file=sys.stderr)
        print(f"  export {PASSWORD_ENV}='<master-password>'", file=sys.stderr)
        sys.exit(1)
    return host, password


def verify_database(conn, expected: str = EXPECTED_DATABASE) -> str:
    """Abort BEFORE any DDL if connected database name doesn't match expected."""
    rows = conn.run("SELECT current_database()")
    actual = rows[0][0] if rows else None
    if actual != expected:
        print(
            f"ERROR: connected to database '{actual}', expected '{expected}'.",
            file=sys.stderr,
        )
        print(
            "       Aborting BEFORE any DDL to prevent applying v2 schema to "
            "the wrong database.",
            file=sys.stderr,
        )
        sys.exit(1)
    return actual


def confirm(database_name: str) -> None:
    """Interactive y/N prompt. Anything other than 'y' aborts."""
    try:
        answer = input(
            f"About to apply schema to {database_name}. Continue? [y/N] "
        ).strip().lower()
    except EOFError:
        answer = ""
    if answer != "y":
        print("Aborted.", file=sys.stderr)
        sys.exit(1)


# ── DDL application / verification ────────────────────────────────────────────

def apply_statements(conn, statements: Sequence[str]) -> int:
    """Run each statement. Return count executed."""
    for stmt in statements:
        conn.run(stmt)
    return len(statements)


def list_tables(conn) -> List[str]:
    """Return list of public tables in the current database."""
    rows = conn.run(
        "SELECT tablename FROM pg_catalog.pg_tables "
        "WHERE schemaname = 'public' ORDER BY tablename"
    )
    return [r[0] for r in rows]


# ── CLI entrypoint ────────────────────────────────────────────────────────────

def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Apply v2 pgvector schema to AI LENS Storage Hub."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the schema SQL without connecting to the database.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip the 'Continue?' confirmation prompt (for CI/CD).",
    )
    args = parser.parse_args(argv)

    schema_sql = load_schema()
    statements = parse_statements(schema_sql)

    if args.dry_run:
        print("[DRY RUN] schema_v2.sql contents:\n")
        print(schema_sql)
        print(f"\n[DRY RUN] Parsed {len(statements)} statement(s). Not connecting.")
        return 0

    host, password = validate_env()

    # pg8000 is only needed for the real-run path. Import lazily so unit tests
    # and --dry-run work without the package installed.
    import pg8000.native  # noqa: WPS433

    print(
        f"Connecting to {host}:{DEFAULT_PORT}/{EXPECTED_DATABASE} as {DEFAULT_USER}..."
    )
    conn = pg8000.native.Connection(
        host=host,
        port=DEFAULT_PORT,
        database=EXPECTED_DATABASE,
        user=DEFAULT_USER,
        password=password,
        ssl_context=True,
    )
    try:
        current_db = verify_database(conn)
        print(f"  Connected to database: {current_db}")

        if not args.yes:
            confirm(current_db)

        count = apply_statements(conn, statements)
        print(f"Executed {count} statement(s).")

        tables = list_tables(conn)
        missing = EXPECTED_TABLES - set(tables)
        if missing:
            print(
                f"ERROR: expected tables missing after apply: {sorted(missing)}",
                file=sys.stderr,
            )
            return 1

        print(f"\nPublic tables ({len(tables)}):")
        for name in tables:
            marker = "  [OK]" if name in EXPECTED_TABLES else "      "
            print(f"{marker} {name}")
        print("\n[OK] All 4 expected tables present.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
