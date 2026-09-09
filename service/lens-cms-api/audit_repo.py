"""감사 로그(admin 액션 전반) — PostgreSQL (v1.27).

admin/backend/shared/audit.py::log()가 지금까지 DynamoDB(admin-config
테이블 pk=AUDIT 공유)에 쓰던 것 대체. 실제 action 종류는 feature-flag/
threshold/driver/login/password-change/webtoon-lab/prompt/quiz/posts/
letters/media 등 전부(범용 이벤트 로그) — 원본 Postgres 설계가
`flag_name REFERENCES feature_flags(name)`로만 좁게 잡았던 걸 이번에
action VARCHAR + detail JSONB 범용 구조로 재설계했다(docs/architecture/
db-changelog/postgres/v1.27 참조).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from db import get_cursor
from psycopg2.extras import Json


def log_event(action: str, detail: Optional[dict] = None, actor: str = "admin",
              session_id: Optional[str] = None, source_ip: Optional[str] = None) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO audit_logs (action, detail, actor, session_id, source_ip)
            VALUES (%s,%s,%s,%s,%s)
            """,
            (action, Json(detail) if detail is not None else None, actor, session_id, source_ip),
        )


def list_events(limit: int = 50, before_id: Optional[int] = None) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """id 내림차순 keyset 페이지네이션. before_id 미만인 것만."""
    with get_cursor() as cur:
        if before_id:
            cur.execute(
                "SELECT id, action, detail, actor, session_id, source_ip, logged_at "
                "FROM audit_logs WHERE id < %s ORDER BY id DESC LIMIT %s",
                (before_id, limit),
            )
        else:
            cur.execute(
                "SELECT id, action, detail, actor, session_id, source_ip, logged_at "
                "FROM audit_logs ORDER BY id DESC LIMIT %s",
                (limit,),
            )
        rows = cur.fetchall()
        events = [
            {
                "ts": r["logged_at"].isoformat() if r.get("logged_at") else None,
                "action": r["action"],
                "detail": r.get("detail"),
                "actor": r.get("actor"),
                "session": r.get("session_id"),
                "source_ip": r.get("source_ip"),
            }
            for r in rows
        ]
        next_cursor = str(rows[-1]["id"]) if len(rows) == limit else None
        return events, next_cursor
