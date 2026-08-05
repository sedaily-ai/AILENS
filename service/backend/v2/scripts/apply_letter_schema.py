#!/usr/bin/env python3
"""daily_letters 테이블 RDS 적용 (one-shot).

PG_V2_* 환경변수가 셸에 없으면 v2 Lambda config에서 가져옴.
schema 는 idempotent (CREATE ... IF NOT EXISTS) 이라 재실행 안전.

사용:
    python3 backend/v2/scripts/apply_letter_schema.py
"""
from pathlib import Path
import os
import re
import subprocess
import sys

import pg8000


SCHEMA_PATH = (
    Path(__file__).resolve().parents[1]
    / "infrastructure"
    / "daily_letters_schema.sql"
)


def _resolve_pg_config() -> dict:
    """PG_V2_* 환경변수 우선, 없으면 v2 Feed Lambda config 에서 fallback."""
    needed = ("PG_V2_HOST", "PG_V2_PORT", "PG_V2_DATABASE", "PG_V2_USER", "PG_V2_PASSWORD")
    cfg = {k: os.environ.get(k) for k in needed}
    if all(cfg.values()):
        return cfg
    # Fallback — running on workstation without env vars. Pull from Lambda.
    print("[info] PG_V2_* env vars missing — fetching from v2 Lambda config", file=sys.stderr)
    out = subprocess.run(
        [
            "aws", "lambda", "get-function-configuration",
            "--function-name", "sedaily-mbti-v2-feed-dev",
            "--region", "us-east-1",
            "--query", "Environment.Variables",
            "--output", "json",
        ],
        capture_output=True, text=True, check=True,
    )
    import json
    lambda_env = json.loads(out.stdout)
    for k in needed:
        if not cfg[k]:
            cfg[k] = lambda_env.get(k)
    missing = [k for k, v in cfg.items() if not v]
    if missing:
        raise RuntimeError(f"PG_V2_* config missing: {missing}")
    return cfg


def _split_statements(sql: str) -> list[str]:
    """주석 제거 후 ; 단위 split. pg8000 single-statement 제약 대응."""
    # -- line comments 제거 (단순)
    no_comment = re.sub(r"--[^\n]*", "", sql)
    statements = [s.strip() for s in no_comment.split(";") if s.strip()]
    return statements


def main() -> int:
    cfg = _resolve_pg_config()

    with open(SCHEMA_PATH) as f:
        raw_sql = f.read()
    statements = _split_statements(raw_sql)
    print(f"[1] connecting to {cfg['PG_V2_HOST']}:{cfg['PG_V2_PORT']}/{cfg['PG_V2_DATABASE']}")
    conn = pg8000.connect(
        host=cfg["PG_V2_HOST"],
        port=int(cfg["PG_V2_PORT"]),
        database=cfg["PG_V2_DATABASE"],
        user=cfg["PG_V2_USER"],
        password=cfg["PG_V2_PASSWORD"],
        ssl_context=True,
    )

    print(f"[2] applying {len(statements)} statements")
    for i, stmt in enumerate(statements, 1):
        first = stmt.split("\n", 1)[0][:78]
        print(f"  [{i}/{len(statements)}] {first}")
        conn.run(stmt)
    conn.commit()

    print("[3] verifying — daily_letters columns:")
    rows = conn.run("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'daily_letters'
        ORDER BY ordinal_position
    """)
    for r in rows:
        nullable = "NULL" if r[2] == "YES" else "NOT NULL"
        print(f"      {r[0]:25s} {r[1]:18s} {nullable}")

    print("[4] indexes on daily_letters:")
    idx = conn.run("""
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'daily_letters'
        ORDER BY indexname
    """)
    for r in idx:
        print(f"      {r[0]}")

    conn.close()
    print(f"[OK] daily_letters table ready ({len(rows)} columns)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
