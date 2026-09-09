"""admin 프롬프트(관리자가 편집하는 AI 프롬프트) — PostgreSQL (v1.27).

DynamoDB 원본 계약:
  pk = 'PROMPT#<category>/<name>'
  sk = 'LATEST'  → {active_version, updated_at}
     | 'v#<int>' → {content, created_at, actor, sections_json?}

Postgres에선 LATEST 포인터 대신 prompt_versions.is_active + 유일 부분
인덱스(prompt_id당 활성 버전 하나)로 표현 — 버전 번호가 진짜 정수라
버전이 10개 넘어도 사전식 정렬 버그(admin/backend/routes/prompts.py의
_load_version_history 워크어라운드)가 원천적으로 없다.

editor 식별자는 실제로 존재한 적이 없다(단일 공유 관리자 계정) —
prompt_versions.created_by는 항상 NULL로 남긴다, 응답의 "actor"는
DynamoDB 쪽처럼 항상 "admin" 리터럴.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from db import get_cursor
from psycopg2.extras import Json


def get_active_content(category: str, name: str) -> Optional[str]:
    """prompt_loader.py/pipelines/common/ddb_prompt.py 전용 — content만."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT pv.content FROM prompts p
            JOIN prompt_versions pv ON pv.prompt_id = p.id AND pv.is_active
            WHERE p.category = %s AND p.name = %s
            """,
            (category, name),
        )
        row = cur.fetchone()
        return row["content"] if row else None


def list_prompts() -> List[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT p.category, p.name, pv.version AS active_version, pv.created_at AS updated_at
            FROM prompts p
            LEFT JOIN prompt_versions pv ON pv.prompt_id = p.id AND pv.is_active
            ORDER BY p.category, p.name
            """
        )
        return [
            {
                "id": f"{r['category']}/{r['name']}",
                "active_version": r["active_version"] or 0,
                "updated_at": r["updated_at"].isoformat() if r.get("updated_at") else None,
            }
            for r in cur.fetchall()
        ]


def get_prompt(category: str, name: str, history_limit: int = 10) -> Optional[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute("SELECT id FROM prompts WHERE category=%s AND name=%s", (category, name))
        row = cur.fetchone()
        if not row:
            return None
        prompt_id = row["id"]

        cur.execute(
            "SELECT version, content, sections FROM prompt_versions WHERE prompt_id=%s AND is_active",
            (prompt_id,),
        )
        active = cur.fetchone()

        cur.execute(
            "SELECT version, created_at FROM prompt_versions WHERE prompt_id=%s "
            "ORDER BY version DESC LIMIT %s",
            (prompt_id, history_limit),
        )
        history = [
            {
                "version": r["version"],
                "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
                "actor": "admin",
            }
            for r in cur.fetchall()
        ]

        return {
            "id": f"{category}/{name}",
            "active_content": active["content"] if active else "",
            "active_version": active["version"] if active else 0,
            "sections": (active or {}).get("sections"),
            "history": history,
        }


def update_prompt(category: str, name: str, content: str,
                   sections: Optional[dict] = None) -> Dict[str, Any]:
    """새 버전 삽입 + 이전 활성 버전 비활성화를 한 트랜잭션으로 — DynamoDB
    쪽의 non-atomic 2-write(v#N put + LATEST update)를 Postgres 트랜잭션으로
    개선. prompts 행이 없으면(신규 프롬프트) 함께 만든다(created=True)."""
    with get_cursor() as cur:
        cur.execute("SELECT id FROM prompts WHERE category=%s AND name=%s", (category, name))
        row = cur.fetchone()
        created = row is None

        if created:
            cur.execute(
                "INSERT INTO prompts (name, category) VALUES (%s,%s) RETURNING id",
                (name, category),
            )
            prompt_id = cur.fetchone()["id"]
            prev_version = 0
        else:
            prompt_id = row["id"]
            cur.execute(
                "SELECT version FROM prompt_versions WHERE prompt_id=%s AND is_active",
                (prompt_id,),
            )
            active = cur.fetchone()
            prev_version = active["version"] if active else 0
            cur.execute(
                "UPDATE prompt_versions SET is_active=false WHERE prompt_id=%s AND is_active",
                (prompt_id,),
            )

        new_version = prev_version + 1
        cur.execute(
            """
            INSERT INTO prompt_versions (prompt_id, version, content, sections, is_active)
            VALUES (%s,%s,%s,%s,true)
            """,
            (prompt_id, new_version, content, Json(sections) if sections is not None else None),
        )

        return {"created": created, "new_version": new_version, "prev_version": prev_version}
