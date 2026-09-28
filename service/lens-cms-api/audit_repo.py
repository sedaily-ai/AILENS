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


def list_prompt_activation_history(category: str, name: str, limit: int = 20) -> List[Dict[str, Any]]:
    """특정 프롬프트(category/name)의 "프로덕션에 적용" 이력만 최신순으로
    — 2026-09-26 신설, 사용자 요청: "프로덕션에 적용한 이력들도 남아야
    해요, 몇시 몇분... 날짜에 했는지". prompts_repo.py의 activate_version()
    이 항상 호출하는 audit.log("prompt-activate", {"prompt": f"{category}/
    {name}", "version": version})를 그대로 걸러서 재사용한다 — 새 테이블을
    안 만들어도 이미 남고 있던 기록이라 바로 조회만 추가하면 됐다."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT detail->>'version' AS version, actor, logged_at "
            "FROM audit_logs WHERE action='prompt-activate' AND detail->>'prompt'=%s "
            "ORDER BY id DESC LIMIT %s",
            (f"{category}/{name}", limit),
        )
        rows = cur.fetchall()
        return [
            {
                "version": int(r["version"]) if r.get("version") else None,
                "actor": r.get("actor"),
                "logged_at": r["logged_at"].isoformat() if r.get("logged_at") else None,
            }
            for r in rows
        ]
