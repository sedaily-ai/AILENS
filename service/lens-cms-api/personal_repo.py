"""개인화(내 서랍·읽은 기록·프로필) — 저장 계층 (v1.24).

비즈니스 로직(스트릭 계산·뱃지 수여 규칙·통계 집계)은 그대로
service/backend/services/user_service.py에 남는다 — subscribe.py
(v1.23)와 같은 원칙으로, 이 모듈은 PersonalRepository가 하던 순수 CRUD
primitive만 옮긴다.

DynamoDB personal.archived_sentence/reading_record는 "뉴스 기사
(articles)에서 담는다"가 실사용이었는데, 원본 Postgres 스키마
(user_archives.rendition_id/user_readings.publication_id)는 CMS
렌디션만 가리킬 수 있었다 — v1.24에서 article_no를 exclusive arc로
추가했다(둘 중 하나만 채움, user_archives는 최대 1개까지도 허용 —
기존 11건이 마이그레이션 당시 연결정보 없이 이관돼 둘 다 NULL이었음).
"""
from __future__ import annotations

import hashlib
from typing import Any, Dict, List, Optional

from db import get_cursor


_ARCHIVE_SELECT = """
    SELECT ua.id, ua.user_id, ua.article_no, ua.rendition_id, ua.content, ua.saved_at,
           a.title AS article_title, a.published_at AS article_published_at
    FROM user_archives ua
    LEFT JOIN articles a ON a.article_no = ua.article_no
"""


def _archive_to_dict(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "user_id": row["user_id"],
        "article_no": row.get("article_no"),
        "rendition_id": row.get("rendition_id"),
        "text": row["content"],
        "article_title": row.get("article_title") or "",
        "article_published_at": row["article_published_at"].isoformat() if row.get("article_published_at") else "",
        "created_at": row["saved_at"].isoformat() if row.get("saved_at") else None,
    }


def save_archived_sentence(user_id: str, text: str, article_no: Optional[str] = None,
                            rendition_id: Optional[int] = None) -> Dict[str, Any]:
    sentence_hash = hashlib.sha256(text.encode()).hexdigest()
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO user_archives (user_id, article_no, rendition_id, sentence_hash, content)
            VALUES (%s,%s,%s,%s,%s)
            ON CONFLICT (user_id, sentence_hash) DO UPDATE SET content = EXCLUDED.content
            RETURNING id
            """,
            (user_id, article_no, rendition_id, sentence_hash, text),
        )
        archive_id = cur.fetchone()["id"]
        cur.execute(_ARCHIVE_SELECT + " WHERE ua.id = %s", (archive_id,))
        return _archive_to_dict(cur.fetchone())


def delete_archived_sentence(user_id: str, archive_id: str) -> bool:
    with get_cursor() as cur:
        cur.execute(
            "DELETE FROM user_archives WHERE id = %s AND user_id = %s RETURNING id",
            (archive_id, user_id),
        )
        return cur.fetchone() is not None


def list_archived_sentences(user_id: str, date_from: Optional[str] = None,
                             date_to: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
    with get_cursor() as cur:
        sql = _ARCHIVE_SELECT + " WHERE ua.user_id = %s"
        params: List[Any] = [user_id]
        if date_from:
            sql += " AND ua.saved_at >= %s"
            params.append(date_from)
        if date_to:
            sql += " AND ua.saved_at <= %s"
            params.append(date_to)
        sql += " ORDER BY ua.saved_at DESC LIMIT %s"
        params.append(limit)
        cur.execute(sql, params)
        return [_archive_to_dict(r) for r in cur.fetchall()]


def list_popular_archived_sentences(limit: int = 20, min_saves: int = 2) -> List[Dict[str, Any]]:
    """텍스트가 원문 그대로 인용되므로 같은 문장이면 article_no도 항상
    같다고 가정(원본 PersonalRepository 문서화된 가정과 동일) — MIN()으로
    대표값 하나만 뽑는다."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT ua.content, count(*) AS n, min(ua.article_no) AS article_no,
                   min(a.title) AS article_title
            FROM user_archives ua
            LEFT JOIN articles a ON a.article_no = ua.article_no
            GROUP BY ua.content
            HAVING count(*) >= %s
            ORDER BY n DESC
            LIMIT %s
            """,
            (min_saves, limit),
        )
        return [
            {
                "text": r["content"],
                "article_id": r.get("article_no") or "",
                "article_title": r.get("article_title") or "",
                "count": r["n"],
            }
            for r in cur.fetchall()
        ]


def _user_to_dict(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "user_id": row["id"],
        "email": row.get("email"),
        "name": row.get("name"),
        "picture": row.get("image_url"),
        "badges": list(row.get("badges") or []),
        "created_at": row["joined_at"].isoformat() if row.get("joined_at") else None,
        "last_login": row["last_login_at"].isoformat() if row.get("last_login_at") else None,
    }


def get_user_profile(user_id: str) -> Optional[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        return _user_to_dict(row) if row else None


def get_or_create_user(user_id: str, email: Optional[str] = None,
                        name: Optional[str] = None, picture: Optional[str] = None) -> Dict[str, Any]:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        if row:
            cur.execute(
                "UPDATE users SET last_login_at = now() WHERE id = %s RETURNING *",
                (user_id,),
            )
            return _user_to_dict(cur.fetchone())
        cur.execute(
            """
            INSERT INTO users (id, email, name, image_url, last_login_at)
            VALUES (%s,%s,%s,%s, now())
            RETURNING *
            """,
            (user_id, email or f"{user_id}@unknown.local", name, picture),
        )
        return _user_to_dict(cur.fetchone())


def update_user_profile(user_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    set_clauses = []
    params: List[Any] = []
    field_map = {"name": "name", "picture": "image_url", "email": "email"}
    for key, col in field_map.items():
        if key in updates:
            set_clauses.append(f"{col} = %s")
            params.append(updates[key])
    if "badges" in updates:
        set_clauses.append("badges = %s")
        params.append(updates["badges"])
    if not set_clauses:
        return get_user_profile(user_id)
    set_clauses.append("updated_at = now()")
    params.append(user_id)
    with get_cursor() as cur:
        cur.execute(
            f"UPDATE users SET {', '.join(set_clauses)} WHERE id = %s RETURNING *",
            params,
        )
        row = cur.fetchone()
        return _user_to_dict(row) if row else None


_READING_SELECT = """
    SELECT ur.user_id, ur.article_no, ur.publication_id, ur.read_at, ur.read_count,
           a.title AS article_title
    FROM user_readings ur
    LEFT JOIN articles a ON a.article_no = ur.article_no
"""


def _reading_to_dict(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "user_id": row["user_id"],
        "article_no": row.get("article_no"),
        "publication_id": row.get("publication_id"),
        "article_title": row.get("article_title") or "",
        "read_at": row["read_at"].isoformat() if row.get("read_at") else None,
        "read_count": row["read_count"],
    }


def save_reading_record(user_id: str, article_no: Optional[str] = None,
                         publication_id: Optional[int] = None) -> Dict[str, Any]:
    if bool(article_no) == bool(publication_id):
        raise ValueError("article_no와 publication_id 중 정확히 하나만 필요")
    col = "article_no" if article_no else "publication_id"
    val = article_no or publication_id
    with get_cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO user_readings (user_id, {col}, read_count)
            VALUES (%s, %s, 1)
            ON CONFLICT (user_id, {col}) WHERE {col} IS NOT NULL
            DO UPDATE SET read_count = user_readings.read_count + 1, read_at = now()
            RETURNING id
            """,
            (user_id, val),
        )
        reading_id = cur.fetchone()["id"]
        cur.execute(_READING_SELECT + " WHERE ur.id = %s", (reading_id,))
        return _reading_to_dict(cur.fetchone())


def list_reading_history(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            _READING_SELECT + " WHERE ur.user_id = %s ORDER BY ur.read_at DESC LIMIT %s",
            (user_id, limit),
        )
        return [_reading_to_dict(r) for r in cur.fetchall()]
