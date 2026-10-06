"""Community Post 비즈니스 로직 — 게시글·투표·댓글 처리.

핸들러(`handlers/user/community_post.py`)는 라우팅만 담당하고, 저장과 응답 shaping
(camelCase 변환, timeAgo 계산)은 이 모듈이 맡는다. 저장은 `clients/pg/community.py`
(lens-cms-api의 `community_posts`/`community_comments`/`community_post_votes`)를 사용하며,
post_id 는 Postgres bigint(문자열로 직렬화)이다.
"""
import json
import logging
from typing import Any
from datetime import datetime
from common.dates.validation import KST

import clients.pg.community as community_client

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)



def cors(status_code: int, body: Any) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


# ── Post CRUD ────────────────────────────────────────────────────────────────

def create_post(body: dict) -> dict:
    """커뮤니티 게시글을 생성한다(인증된 사용자 누구나)."""
    user_id = body.get('user_id', '')
    user_name = body.get('user_name', '')
    user_avatar = body.get('user_avatar', '')
    archived_sentence = body.get('archived_sentence', '').strip()
    user_comment = body.get('user_comment', '').strip()
    article_id = body.get('article_id', '')
    tags = body.get('tags', [])

    if not archived_sentence:
        return cors(400, {"error": "archived_sentence is required"})
    if not user_id:
        return cors(400, {"error": "user_id is required"})

    post = community_client.create_post(
        user_id=user_id, user_name=user_name, user_avatar=user_avatar,
        archived_sentence=archived_sentence, user_comment=user_comment,
        article_id=article_id or None, tags=tags,
    )
    logger.info(f"Created community post {post['id']} by {user_id}")
    return cors(201, to_post_response(post))


def list_posts(params: dict) -> dict:
    """List community posts, optionally filtered by date."""
    date_str = params.get('date', datetime.now(KST).strftime('%Y%m%d'))
    limit = int(params.get('limit', '30'))
    tag = params.get('tag')

    items = community_client.list_posts(date_str, limit=limit, tag=tag)
    posts = [to_post_response(i) for i in items]
    return cors(200, {"posts": posts, "total": len(posts)})


def to_post_response(item: dict) -> dict:
    """저장소 계층의 게시글 dict를 API 응답 형식으로 변환한다."""
    created_at = item.get('created_at', '')
    return {
        'id': item.get('id', ''),
        'userName': item.get('user_name', ''),
        'userMbti': item.get('user_mbti', ''),
        'userAvatar': item.get('user_avatar', ''),
        'archivedSentence': item.get('archived_sentence', ''),
        'userComment': item.get('user_comment', ''),
        'articleId': item.get('article_id', ''),
        'articleTitle': item.get('article_title', ''),
        'tags': item.get('tags', []),
        'upvotes': item.get('upvotes', 0),
        'commentCount': item.get('comment_count', 0),
        'createdAt': created_at,
        'timeAgo': time_ago(created_at),
    }


def time_ago(iso_str: str) -> str:
    """ISO 시각을 한국어 상대 시간 문자열로 변환한다."""
    if not iso_str:
        return ''
    try:
        created = datetime.fromisoformat(iso_str)
        now = datetime.now(KST)
        diff = now - created
        minutes = int(diff.total_seconds() / 60)
        if minutes < 1:
            return '방금 전'
        if minutes < 60:
            return f'{minutes}분 전'
        hours = minutes // 60
        if hours < 24:
            return f'{hours}시간 전'
        days = hours // 24
        if days < 7:
            return f'{days}일 전'
        return created.strftime('%m월 %d일')
    except Exception:
        return ''


# ── Voting ───────────────────────────────────────────────────────────────────

def vote_post(post_id: str, body: dict) -> dict:
    """게시글의 추천/비추천을 토글한다."""
    user_id = body.get('user_id', '')
    vote_type = body.get('vote_type', 'up')  # 'up' 또는 'down'

    if not user_id:
        return cors(400, {"error": "user_id is required"})
    try:
        pid = int(post_id)
    except (TypeError, ValueError):
        return cors(404, {"error": "Post not found"})

    delta = community_client.vote_post(pid, user_id, vote_type)
    if delta is None:
        return cors(404, {"error": "Post not found"})

    return cors(200, {"post_id": post_id, "vote_type": vote_type, "delta": delta})


# ── Comments ─────────────────────────────────────────────────────────────────

def add_comment(post_id: str, body: dict) -> dict:
    """게시글에 댓글을 추가한다."""
    user_id = body.get('user_id', '')
    user_name = body.get('user_name', '')
    user_avatar = body.get('user_avatar', '')
    text = body.get('text', '').strip()

    if not text:
        return cors(400, {"error": "text is required"})
    if not user_id:
        return cors(400, {"error": "user_id is required"})
    try:
        pid = int(post_id)
    except (TypeError, ValueError):
        return cors(404, {"error": "Post not found"})

    comment = community_client.add_comment(pid, user_id, user_name, user_avatar, text)
    if comment is None:
        return cors(404, {"error": "Post not found"})

    return cors(201, to_comment_response(comment))


def list_comments(post_id: str, params: dict) -> dict:
    """게시글의 댓글을 최신순으로 조회한다."""
    limit = int(params.get('limit', '50'))
    try:
        pid = int(post_id)
    except (TypeError, ValueError):
        return cors(200, {"comments": [], "total": 0})

    items = community_client.list_comments(pid, limit=limit)
    comments = [to_comment_response(i) for i in items]
    return cors(200, {"comments": comments, "total": len(comments)})


def to_comment_response(item: dict) -> dict:
    return {
        'id': item.get('id', ''),
        'userName': item.get('user_name', ''),
        'userMbti': item.get('user_mbti', ''),
        'userAvatar': item.get('user_avatar', ''),
        'text': item.get('text', ''),
        'likes': item.get('likes', 0),
        'createdAt': item.get('created_at', ''),
        'timeAgo': time_ago(item.get('created_at', '')),
    }
