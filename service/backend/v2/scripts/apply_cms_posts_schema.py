#!/usr/bin/env python3
"""cms_posts 테이블 RDS 적용 (one-shot).

apply_letter_schema.py 와 같은 규약 — PG_V2_* 환경변수가 셸에 없으면 v2 Lambda
config 에서 가져온다. schema 는 idempotent (CREATE ... IF NOT EXISTS) 이라 재실행 안전.

⚠️ RDS 보안그룹(sg-0681e807d6d3b8607)이 5432 인바운드를 172.31.0.0/16 과 특정 IP 로만
   허용한다. 워크스테이션에서 돌리려면 실행 IP 를 임시로 추가했다가 반드시 제거할 것.

사용:
    cd service/backend && python3 v2/scripts/apply_cms_posts_schema.py
"""
from pathlib import Path
import json
import os
import re
import subprocess
import sys

import pg8000


SCHEMA_PATH = (
    Path(__file__).resolve().parents[1] / "infrastructure" / "cms_posts_schema.sql"
)


def _resolve_pg_config() -> dict:
    """PG_V2_* 환경변수 우선, 없으면 v2 Feed Lambda config 에서 fallback."""
    needed = ("PG_V2_HOST", "PG_V2_PORT", "PG_V2_DATABASE", "PG_V2_USER", "PG_V2_PASSWORD")
    cfg = {k: os.environ.get(k) for k in needed}
    if all(cfg.values()):
        return cfg
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
    no_comment = re.sub(r"--[^\n]*", "", sql)
    return [s.strip() for s in no_comment.split(";") if s.strip()]


def main() -> int:
    cfg = _resolve_pg_config()

    raw_sql = SCHEMA_PATH.read_text(encoding="utf-8")
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

    print("[3] verifying — cms_posts columns:")
    rows = conn.run("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'cms_posts'
        ORDER BY ordinal_position
    """)
    for r in rows:
        nullable = "NULL" if r[2] == "YES" else "NOT NULL"
        print(f"  - {r[0]:<16} {r[1]:<26} {nullable}")

    idx = conn.run("""
        SELECT indexname FROM pg_indexes WHERE tablename = 'cms_posts' ORDER BY indexname
    """)
    print(f"[4] indexes: {', '.join(r[0] for r in idx)}")

    conn.close()
    print(f"[done] {len(rows)} columns present")
    return 0 if rows else 1


if __name__ == "__main__":
    sys.exit(main())
