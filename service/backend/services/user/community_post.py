"""Community Post 비즈니스 로직 — handlers/post_handler.py에서 추출
(2026-08-24, 코드 리팩토링 감사 Track B, God 파일 분해).

핸들러는 이제 라우팅(메서드/경로 판별, 이벤트 파싱)만 담당하고, 저장·응답
shaping·투표/댓글 카운터 갱신 같은 실제 로직은 전부 여기 있다 — 2026-08-05
chatbot_handler.py를 context_service/prompt_service/engine으로 쪼갠 것과
같은 패턴(handler=라우팅, service=로직).

2026-09-09(v1.26): DynamoDB(engagement 테이블 공유, PK=COMMUNITY_POSTS/
POST#{id}) → PostgreSQL(lens-cms-api, `community_posts`/`community_comments`
+ `community_post_votes`) 전환. `clients/community_pg_client.py`가 저장을
전담하고, 이 파일은 원래 하던 응답 shaping(camelCase 변환, timeAgo 계산)만
그대로 유지 — 서버가 돌려주는 딕셔너리 키(snake_case)가 예전 DynamoDB
아이템 키와 동일해서 `to_post_response`/`to_comment_response`는 무변경.

post_id가 문자열(cp_YYYYMMDDHHMMSS_hex)에서 Postgres bigint(문자열로 직렬화)
로 바뀌었다 — dev 단계라 기존 게시글 ID 형식과의 하위호환은 고려하지 않음.
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
    """Create a community post. Any authenticated user."""
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
    """Convert the storage-layer post dict to API response format."""
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
    """Convert ISO timestamp to Korean relative time string."""
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
    """Toggle upvote/downvote on a post."""
    user_id = body.get('user_id', '')
    vote_type = body.get('vote_type', 'up')  # 'up' or 'down'

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
    """Add a comment to a post."""
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
    """List comments for a post, newest first."""
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
