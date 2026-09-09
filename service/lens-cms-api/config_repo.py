"""feature flag · threshold · admin 로그인 잠금 — PostgreSQL (v1.28).

DynamoDB 원본 계약(admin-config 테이블, pk='CONFIG'|'AUTH' 공유):
  CONFIG/feature-flag/<name> → {enabled: bool}
  CONFIG/threshold/<name>    → {threshold: int}
  AUTH/lockout/global        → {fail_count: int, lockout_until?: str}

읽기 쪽(service/backend/common/feature_flag.py)은 fail-open이 계약의
일부다 — 행이 아예 없으면 "명시적으로 꺼진 적 없음"으로 보고 True/기본값
쪽으로 기운다. 이 파일의 get_feature_flag/get_threshold가 행 없을 때
None을 반환하는 건 그 판단을 호출부(Lambda)에 그대로 넘기기 위함 —
여기서 기본값을 결정하지 않는다(어떤 기본값이 맞는지는 호출부마다
다를 수 있어서).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from db import get_cursor


# --- feature flags ---

def list_feature_flags() -> Dict[str, bool]:
    with get_cursor() as cur:
        cur.execute("SELECT name, is_enabled FROM feature_flags ORDER BY name")
        return {r["name"]: r["is_enabled"] for r in cur.fetchall()}


def get_feature_flag(name: str) -> Optional[bool]:
    with get_cursor() as cur:
        cur.execute("SELECT is_enabled FROM feature_flags WHERE name=%s", (name,))
        row = cur.fetchone()
        return row["is_enabled"] if row else None


def set_feature_flag(name: str, enabled: bool) -> str:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO feature_flags (name, is_enabled, updated_at)
            VALUES (%s, %s, now())
            ON CONFLICT (name) DO UPDATE SET is_enabled = EXCLUDED.is_enabled, updated_at = now()
            RETURNING updated_at
            """,
            (name, enabled),
        )
        return cur.fetchone()["updated_at"].isoformat()


# --- thresholds ---

def list_thresholds() -> Dict[str, int]:
    with get_cursor() as cur:
        cur.execute("SELECT name, value FROM thresholds ORDER BY name")
        return {r["name"]: r["value"] for r in cur.fetchall()}


def get_threshold(name: str) -> Optional[int]:
    with get_cursor() as cur:
        cur.execute("SELECT value FROM thresholds WHERE name=%s", (name,))
        row = cur.fetchone()
        return row["value"] if row else None


def set_threshold(name: str, value: int) -> str:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO thresholds (name, value, updated_at)
            VALUES (%s, %s, now())
            ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
            RETURNING updated_at
            """,
            (name, value),
        )
        return cur.fetchone()["updated_at"].isoformat()


# --- admin login lockout (단일 공유 관리자 계정 — 전역 싱글턴 1행) ---

def check_lockout() -> Optional[int]:
    """잠금 활성 시 남은 초, 아니면 None."""
    with get_cursor() as cur:
        cur.execute("SELECT lockout_until FROM admin_login_lockout WHERE id=1")
        row = cur.fetchone()
        if not row or not row["lockout_until"]:
            return None
        now = datetime.now(timezone.utc)
        until = row["lockout_until"]
        if now >= until:
            return None
        return int((until - now).total_seconds())


def record_login_fail(threshold: int, lockout_minutes: int) -> Tuple[int, Optional[str]]:
    with get_cursor() as cur:
        cur.execute("SELECT fail_count FROM admin_login_lockout WHERE id=1")
        row = cur.fetchone()
        fail_count = (row["fail_count"] if row else 0) + 1

        lockout_until = None
        lockout_until_dt = None
        if fail_count >= threshold:
            lockout_until_dt = datetime.now(timezone.utc) + timedelta(minutes=lockout_minutes)
            lockout_until = lockout_until_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

        cur.execute(
            """
            INSERT INTO admin_login_lockout (id, fail_count, lockout_until)
            VALUES (1, %s, %s)
            ON CONFLICT (id) DO UPDATE SET fail_count = EXCLUDED.fail_count, lockout_until = EXCLUDED.lockout_until
            """,
            (fail_count, lockout_until_dt),
        )
        return fail_count, lockout_until


def reset_login_fail() -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO admin_login_lockout (id, fail_count, lockout_until)
            VALUES (1, 0, NULL)
            ON CONFLICT (id) DO UPDATE SET fail_count = 0, lockout_until = NULL
            """
        )
