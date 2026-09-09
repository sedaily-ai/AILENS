"""용어 퀴즈 — 공개 조회 + admin 쓰기 (v1.22).

admin/backend/repo/quiz_repo.py(DynamoDB, v1.22 이전)와 service/backend/
clients/quiz_questions_ddb_client.py를 이 파일 하나로 통합했다 — 원본
Postgres 스키마(quizzes/quiz_options)에는 admin의 draft/published
워크플로가 없었어서(응답 저장 안 한다는 제품 결정과는 별개로 초안
개념 자체가 없었음) status/published_at/deleted_at/admin_post_id/
admin_extra를 v1.22에서 추가했다(docs/architecture/db-changelog/
postgres/v1.22 참조).

정답 처리: DynamoDB는 오답 3개(options)만 저장하고 정답은 term
자체였다. quiz_options는 관계형이라 정답도 명시적 행(is_correct=TRUE)
으로 저장한다 — position 1을 정답(term)으로 고정하고 이어서 오답을 쓴다.
"""
from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional

from db import get_cursor

_VALID_STATUS = ("draft", "published")


def _next_position(cur, quiz_date: str) -> int:
    """UNIQUE(quiz_date, position)은 soft-delete(deleted_at)와 무관하게
    걸리는 하드 제약이라, 지운 행의 position도 계속 점유한 채로 남는다 —
    deleted_at 필터 없이 전체 행 기준으로 다음 번호를 잡아야 충돌이 안 난다."""
    cur.execute(
        "SELECT COALESCE(MAX(position), 0) + 1 AS p FROM quizzes WHERE quiz_date = %s",
        (quiz_date,),
    )
    return cur.fetchone()["p"]


def _write_options(cur, quiz_id: int, term: str, options: List[str]) -> None:
    cur.execute("DELETE FROM quiz_options WHERE quiz_id = %s", (quiz_id,))
    pos = 1
    if term:
        cur.execute(
            "INSERT INTO quiz_options (quiz_id, position, content, is_correct) VALUES (%s,%s,%s,TRUE)",
            (quiz_id, pos, term),
        )
        pos += 1
    for opt in options or []:
        if not opt:
            continue
        cur.execute(
            "INSERT INTO quiz_options (quiz_id, position, content, is_correct) VALUES (%s,%s,%s,FALSE)",
            (quiz_id, pos, opt),
        )
        pos += 1


def _to_dict(q: Dict[str, Any], wrong_options: List[str]) -> Dict[str, Any]:
    extra = q.get("admin_extra") or {}
    return {
        "id": str(q["admin_post_id"]),
        "term": extra.get("term") or q.get("question") or "",
        "explain": extra.get("explain") or "",
        "options": wrong_options,
        "status": q["status"],
        "publish_date": q["quiz_date"].isoformat() if q.get("quiz_date") else None,
        "created_by": extra.get("created_by"),
        "created_at": q["created_at"].isoformat() if q.get("created_at") else None,
        "updated_at": q["updated_at"].isoformat() if q.get("updated_at") else None,
        "published_at": q["published_at"].isoformat() if q.get("published_at") else None,
    }


def _wrong_options(cur, quiz_id: int) -> List[str]:
    cur.execute(
        "SELECT content FROM quiz_options WHERE quiz_id = %s AND is_correct = FALSE ORDER BY position",
        (quiz_id,),
    )
    return [r["content"] for r in cur.fetchall()]


def create(data: Dict[str, Any], created_by: str) -> Dict[str, Any]:
    term = data.get("term", "")
    publish_date = data["publish_date"]
    admin_post_id = str(uuid.uuid4())
    extra = {"term": term, "explain": data.get("explain", ""), "created_by": created_by}
    with get_cursor() as cur:
        position = _next_position(cur, publish_date)
        cur.execute(
            """
            INSERT INTO quizzes (quiz_date, position, question, admin_post_id, admin_extra, status)
            VALUES (%s,%s,%s,%s,%s,'draft')
            RETURNING id
            """,
            (publish_date, position, term, admin_post_id, json.dumps(extra)),
        )
        quiz_id = cur.fetchone()["id"]
        _write_options(cur, quiz_id, term, data.get("options") or [])
    return get(admin_post_id)


def get(admin_post_id: str) -> Optional[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM quizzes WHERE admin_post_id = %s AND deleted_at IS NULL",
            (admin_post_id,),
        )
        q = cur.fetchone()
        if not q:
            return None
        return _to_dict(q, _wrong_options(cur, q["id"]))


def list_quiz(status: Optional[str], limit: int) -> List[Dict[str, Any]]:
    with get_cursor() as cur:
        sql = "SELECT * FROM quizzes WHERE admin_post_id IS NOT NULL AND deleted_at IS NULL"
        params: List[Any] = []
        if status:
            sql += " AND status = %s"
            params.append(status)
        sql += " ORDER BY quiz_date DESC, created_at DESC LIMIT %s"
        params.append(limit)
        cur.execute(sql, params)
        rows = cur.fetchall()
        return [_to_dict(r, _wrong_options(cur, r["id"])) for r in rows]


def update(admin_post_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM quizzes WHERE admin_post_id = %s AND deleted_at IS NULL",
            (admin_post_id,),
        )
        q = cur.fetchone()
        if not q:
            return None
        quiz_id = q["id"]
        extra = dict(q.get("admin_extra") or {})

        set_clauses = []
        params: List[Any] = []
        if "term" in data:
            extra["term"] = data["term"]
            set_clauses.append("question = %s")
            params.append(data["term"])
        if "explain" in data:
            extra["explain"] = data["explain"]
        if "publish_date" in data:
            set_clauses.append("quiz_date = %s")
            params.append(data["publish_date"])

        set_clauses.append("admin_extra = %s")
        params.append(json.dumps(extra))
        set_clauses.append("updated_at = now()")
        params.append(quiz_id)
        cur.execute(f"UPDATE quizzes SET {', '.join(set_clauses)} WHERE id = %s", params)

        if "options" in data or "term" in data:
            _write_options(cur, quiz_id, extra.get("term") or "", data.get("options") or _wrong_options(cur, quiz_id))
    return get(admin_post_id)


def set_status(admin_post_id: str, status: str) -> Optional[Dict[str, Any]]:
    if status not in _VALID_STATUS:
        raise ValueError(f"invalid status: {status}")
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, published_at FROM quizzes WHERE admin_post_id = %s AND deleted_at IS NULL",
            (admin_post_id,),
        )
        q = cur.fetchone()
        if not q:
            return None
        if status == "published" and not q.get("published_at"):
            cur.execute(
                "UPDATE quizzes SET status=%s, published_at=now(), updated_at=now() WHERE id=%s",
                (status, q["id"]),
            )
        else:
            cur.execute(
                "UPDATE quizzes SET status=%s, updated_at=now() WHERE id=%s",
                (status, q["id"]),
            )
    return get(admin_post_id)


def soft_delete(admin_post_id: str) -> bool:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id FROM quizzes WHERE admin_post_id = %s AND deleted_at IS NULL",
            (admin_post_id,),
        )
        q = cur.fetchone()
        if not q:
            return False
        cur.execute(
            "UPDATE quizzes SET deleted_at=now(), updated_at=now() WHERE id=%s",
            (q["id"],),
        )
    return True


def list_published_quizzes(limit: int = 4) -> List[Dict[str, Any]]:
    """공개 조회 — service/backend/handlers/quiz_public.py가 기대하는
    원본 DynamoDB item 모양(term/explain/options)으로 반환한다."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM quizzes WHERE status = 'published' AND deleted_at IS NULL "
            "ORDER BY quiz_date DESC, position ASC LIMIT %s",
            (limit,),
        )
        rows = cur.fetchall()
        out = []
        for q in rows:
            extra = q.get("admin_extra") or {}
            out.append({
                "id": str(q["admin_post_id"]) if q.get("admin_post_id") else str(q["id"]),
                "term": extra.get("term") or q.get("question") or "",
                "explain": extra.get("explain") or "",
                "options": _wrong_options(cur, q["id"]),
                "status": q["status"],
                "publish_date": q["quiz_date"].isoformat() if q.get("quiz_date") else None,
                "deleted_at": None,
            })
        return out
