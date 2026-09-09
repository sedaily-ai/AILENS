"""커뮤니티 게시판(내 서랍 공유 게시글) — PostgreSQL (v1.26).

DynamoDB(engagement 테이블 공유)에서 이관. 원본 계약:
  Post:    PK=COMMUNITY_POSTS  SK={date}#{post_id}
  Comment: PK=POST#{post_id}   SK=COMMENT#{timestamp}
  Vote:    PK=POST#{post_id}   SK=VOTE#{user_id}

users.id/community_posts.user_id는 Cognito sub — 커뮤니티 글쓰기는
로그인(JWT) 필수라 users 행은 이미 로그인 시점(personal_repo.
get_or_create_user)에 생성돼 있다는 게 전제(로그인 안 한 사용자가 글을
쓸 수 있는 경로 자체가 없음).

user_mbti는 저장하지 않는다 — 프로젝트 전체에서 MBTI 페르소나가 이미
폐지됐고, DynamoDB 쪽도 실질적으로 항상 빈 문자열이었다. article_title은
컬럼으로 안 두고(v1.24와 동일 패턴) articles LEFT JOIN으로 항상 최신
제목을 붙인다 — DynamoDB는 작성 시점 제목을 그대로 박제했지만, 기사
제목이 바뀌면 오히려 최신 값이 더 정확하다고 판단.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from db import get_cursor

_POST_SELECT = """
    SELECT p.id, p.user_id, p.user_name, p.user_avatar, p.archived_sentence,
           p.user_comment, p.article_no, p.tags, p.upvotes, p.comment_count,
           p.created_at, a.title AS article_title
    FROM community_posts p
    LEFT JOIN articles a ON a.article_no = p.article_no
"""


def _post_to_dict(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "user_id": row["user_id"],
        "user_name": row.get("user_name") or "",
        "user_mbti": "",
        "user_avatar": row.get("user_avatar") or "",
        "archived_sentence": row["archived_sentence"],
        "user_comment": row.get("user_comment") or "",
        "article_id": row.get("article_no") or "",
        "article_title": row.get("article_title") or "",
        "tags": list(row.get("tags") or []),
        "upvotes": row["upvotes"],
        "comment_count": row["comment_count"],
        "created_at": row["created_at"].isoformat() if row.get("created_at") else "",
    }


def _comment_to_dict(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "user_id": row["user_id"],
        "user_name": row.get("user_name") or "",
        "user_mbti": "",
        "user_avatar": row.get("user_avatar") or "",
        "text": row["content"],
        "likes": row["likes"],
        "created_at": row["created_at"].isoformat() if row.get("created_at") else "",
    }


def create_post(user_id: str, user_name: Optional[str], user_avatar: Optional[str],
                 archived_sentence: str, user_comment: Optional[str],
                 article_id: Optional[str], tags: Optional[List[str]]) -> Dict[str, Any]:
    with get_cursor() as cur:
        article_no = None
        if article_id:
            cur.execute("SELECT 1 FROM articles WHERE article_no = %s", (article_id,))
            if cur.fetchone():
                article_no = article_id

        cur.execute(
            """
            INSERT INTO community_posts
                (user_id, user_name, user_avatar, archived_sentence, user_comment,
                 article_no, tags)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            RETURNING id, user_id, user_name, user_avatar, archived_sentence,
                      user_comment, article_no, tags, upvotes, comment_count, created_at
            """,
            (user_id, user_name or None, user_avatar or None, archived_sentence,
             user_comment or None, article_no, tags or []),
        )
        row = cur.fetchone()
        row["article_title"] = None
        if article_no:
            cur.execute("SELECT title FROM articles WHERE article_no = %s", (article_no,))
            r2 = cur.fetchone()
            row["article_title"] = r2["title"] if r2 else None
        return _post_to_dict(row)


def list_posts(date_str: str, limit: int = 30, tag: Optional[str] = None) -> List[Dict[str, Any]]:
    """date_str: YYYYMMDD, KST 기준 그 날짜에 작성된 글."""
    kst_date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
    with get_cursor() as cur:
        sql = _POST_SELECT + " WHERE (p.created_at AT TIME ZONE 'Asia/Seoul')::date = %s::date"
        params: List[Any] = [kst_date]
        if tag:
            sql += " AND p.tags @> ARRAY[%s]"
            params.append(tag)
        sql += " ORDER BY p.upvotes DESC, p.created_at DESC LIMIT %s"
        params.append(limit)
        cur.execute(sql, params)
        return [_post_to_dict(r) for r in cur.fetchall()]


def vote_post(post_id: int, user_id: str, vote_type: str) -> Optional[int]:
    """토글 투표. 반환값은 upvotes에 적용된 delta, 글이 없으면 None."""
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM community_posts WHERE id = %s", (post_id,))
        if not cur.fetchone():
            return None

        cur.execute(
            "SELECT vote_type FROM community_post_votes WHERE post_id=%s AND user_id=%s FOR UPDATE",
            (post_id, user_id),
        )
        existing = cur.fetchone()
        delta = 0

        if existing:
            old_type = existing["vote_type"]
            if old_type == vote_type:
                cur.execute(
                    "DELETE FROM community_post_votes WHERE post_id=%s AND user_id=%s",
                    (post_id, user_id),
                )
                delta = -1 if vote_type == "up" else 1
            else:
                cur.execute(
                    "UPDATE community_post_votes SET vote_type=%s, created_at=now() "
                    "WHERE post_id=%s AND user_id=%s",
                    (vote_type, post_id, user_id),
                )
                delta = 2 if vote_type == "up" else -2
        else:
            cur.execute(
                "INSERT INTO community_post_votes (post_id, user_id, vote_type) VALUES (%s,%s,%s)",
                (post_id, user_id, vote_type),
            )
            delta = 1 if vote_type == "up" else -1

        if delta != 0:
            cur.execute(
                "UPDATE community_posts SET upvotes = upvotes + %s WHERE id = %s",
                (delta, post_id),
            )
        return delta


def add_comment(post_id: int, user_id: str, user_name: Optional[str],
                 user_avatar: Optional[str], text: str) -> Optional[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute("SELECT 1 FROM community_posts WHERE id = %s", (post_id,))
        if not cur.fetchone():
            return None

        cur.execute(
            """
            INSERT INTO community_comments (post_id, user_id, user_name, user_avatar, content)
            VALUES (%s,%s,%s,%s,%s)
            RETURNING id, user_id, user_name, user_avatar, content, likes, created_at
            """,
            (post_id, user_id, user_name or None, user_avatar or None, text),
        )
        row = cur.fetchone()
        cur.execute(
            "UPDATE community_posts SET comment_count = comment_count + 1 WHERE id = %s",
            (post_id,),
        )
        return _comment_to_dict(row)


def list_comments(post_id: int, limit: int = 50) -> List[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, user_id, user_name, user_avatar, content, likes, created_at
            FROM community_comments WHERE post_id = %s
            ORDER BY created_at DESC LIMIT %s
            """,
            (post_id, limit),
        )
        return [_comment_to_dict(r) for r in cur.fetchall()]
