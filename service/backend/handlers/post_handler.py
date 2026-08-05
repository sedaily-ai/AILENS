"""
Community Post Handler Lambda Function
Handles community post CRUD, voting, and comments.

Posts are stored in the engagement DynamoDB table:
  Post:    PK=COMMUNITY_POSTS  SK={date}#{post_id}
  Comment: PK=POST#{post_id}   SK=COMMENT#{timestamp}
  Vote:    PK=POST#{post_id}   SK=VOTE#{user_id}
"""
import json
import logging
import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key, Attr

from core.auth import get_authenticated_user_id
from core.exceptions import AuthenticationError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

KST = timezone(timedelta(hours=9))
ENGAGEMENT_TABLE = 'sedaily-mbti-engagement-dev'

_table = None

def _get_table():
    global _table
    if _table is None:
        _table = boto3.resource('dynamodb', region_name='us-east-1').Table(ENGAGEMENT_TABLE)
    return _table


def _decimal_to_native(obj):
    """Recursively convert Decimal values for JSON serialization."""
    if isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        return float(obj)
    elif isinstance(obj, dict):
        return {k: _decimal_to_native(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_decimal_to_native(v) for v in obj]
    return obj


def _cors(status_code: int, body: Any) -> dict:
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

def _create_post(body: dict) -> dict:
    """Create a community post. Any authenticated user."""
    user_id = body.get('user_id', '')
    user_name = body.get('user_name', '')
    user_mbti = body.get('user_mbti', '')
    user_avatar = body.get('user_avatar', '')
    archived_sentence = body.get('archived_sentence', '').strip()
    user_comment = body.get('user_comment', '').strip()
    article_id = body.get('article_id', '')
    article_title = body.get('article_title', '')
    tags = body.get('tags', [])

    if not archived_sentence:
        return _cors(400, {"error": "archived_sentence is required"})
    if not user_id:
        return _cors(400, {"error": "user_id is required"})

    now = datetime.now(KST)
    post_id = f"cp_{now.strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"
    date_str = now.strftime('%Y%m%d')
    created_at = now.isoformat()

    item = {
        'pk': 'COMMUNITY_POSTS',
        'sk': f'{date_str}#{post_id}',
        'post_id': post_id,
        'user_id': user_id,
        'user_name': user_name,
        'user_mbti': user_mbti,
        'user_avatar': user_avatar,
        'archived_sentence': archived_sentence,
        'user_comment': user_comment,
        'article_id': article_id,
        'article_title': article_title,
        'tags': tags,
        'upvotes': 0,
        'comment_count': 0,
        'created_at': created_at,
        'date': date_str,
    }

    _get_table().put_item(Item=item)
    logger.info(f"Created community post {post_id} by {user_id}")
    return _cors(201, _to_post_response(item))


def _list_posts(params: dict) -> dict:
    """List community posts, optionally filtered by date."""
    date_str = params.get('date', datetime.now(KST).strftime('%Y%m%d'))
    limit = int(params.get('limit', '30'))
    tag = params.get('tag')

    # Query by partition key with date prefix on sort key
    response = _get_table().query(
        KeyConditionExpression=Key('pk').eq('COMMUNITY_POSTS') & Key('sk').begins_with(date_str),
        ScanIndexForward=False,
        Limit=100,
    )

    items = response.get('Items', [])

    # Filter by tag if specified
    if tag:
        items = [i for i in items if tag in (i.get('tags') or [])]

    # Sort by upvotes descending (popularity), then recency
    items.sort(key=lambda x: (x.get('upvotes', 0), x.get('created_at', '')), reverse=True)
    items = items[:limit]

    posts = [_to_post_response(i) for i in items]
    return _cors(200, {"posts": posts, "total": len(posts)})


def _to_post_response(item: dict) -> dict:
    """Convert DynamoDB item to API response format."""
    created_at = item.get('created_at', '')
    return _decimal_to_native({
        'id': item.get('post_id', ''),
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
        'timeAgo': _time_ago(created_at),
    })


def _time_ago(iso_str: str) -> str:
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

def _vote_post(post_id: str, body: dict) -> dict:
    """Toggle upvote/downvote on a post."""
    user_id = body.get('user_id', '')
    vote_type = body.get('vote_type', 'up')  # 'up' or 'down'

    if not user_id:
        return _cors(400, {"error": "user_id is required"})

    table = _get_table()

    # Check existing vote
    vote_key = {'pk': f'POST#{post_id}', 'sk': f'VOTE#{user_id}'}
    existing = table.get_item(Key=vote_key).get('Item')

    # Find the post to update its upvotes counter
    # Query COMMUNITY_POSTS to find the post's SK
    post_query = table.query(
        KeyConditionExpression=Key('pk').eq('COMMUNITY_POSTS'),
        FilterExpression=Attr('post_id').eq(post_id),
        Limit=1,
    )
    post_items = post_query.get('Items', [])
    if not post_items:
        return _cors(404, {"error": "Post not found"})

    post_key = {'pk': 'COMMUNITY_POSTS', 'sk': post_items[0]['sk']}
    delta = 0

    if existing:
        old_type = existing.get('vote_type')
        if old_type == vote_type:
            # Remove vote (toggle off)
            table.delete_item(Key=vote_key)
            delta = -1 if vote_type == 'up' else 1
        else:
            # Switch vote
            table.put_item(Item={**vote_key, 'vote_type': vote_type, 'created_at': datetime.now(KST).isoformat()})
            delta = 2 if vote_type == 'up' else -2
    else:
        # New vote
        table.put_item(Item={**vote_key, 'vote_type': vote_type, 'created_at': datetime.now(KST).isoformat()})
        delta = 1 if vote_type == 'up' else -1

    # Update post upvotes counter
    if delta != 0:
        table.update_item(
            Key=post_key,
            UpdateExpression='ADD upvotes :d',
            ExpressionAttributeValues={':d': delta},
        )

    return _cors(200, {"post_id": post_id, "vote_type": vote_type, "delta": delta})


# ── Comments ─────────────────────────────────────────────────────────────────

def _add_comment(post_id: str, body: dict) -> dict:
    """Add a comment to a post."""
    user_id = body.get('user_id', '')
    user_name = body.get('user_name', '')
    user_mbti = body.get('user_mbti', '')
    user_avatar = body.get('user_avatar', '')
    text = body.get('text', '').strip()

    if not text:
        return _cors(400, {"error": "text is required"})
    if not user_id:
        return _cors(400, {"error": "user_id is required"})

    table = _get_table()
    now = datetime.now(KST)
    comment_id = f"cmt_{now.strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}"

    comment_item = {
        'pk': f'POST#{post_id}',
        'sk': f'COMMENT#{now.isoformat()}',
        'comment_id': comment_id,
        'user_id': user_id,
        'user_name': user_name,
        'user_mbti': user_mbti,
        'user_avatar': user_avatar,
        'text': text,
        'likes': 0,
        'created_at': now.isoformat(),
    }

    table.put_item(Item=comment_item)

    # Increment comment_count on the post
    post_query = table.query(
        KeyConditionExpression=Key('pk').eq('COMMUNITY_POSTS'),
        FilterExpression=Attr('post_id').eq(post_id),
        Limit=1,
    )
    post_items = post_query.get('Items', [])
    if post_items:
        table.update_item(
            Key={'pk': 'COMMUNITY_POSTS', 'sk': post_items[0]['sk']},
            UpdateExpression='ADD comment_count :one',
            ExpressionAttributeValues={':one': 1},
        )

    return _cors(201, _to_comment_response(comment_item))


def _list_comments(post_id: str, params: dict) -> dict:
    """List comments for a post, newest first."""
    limit = int(params.get('limit', '50'))

    response = _get_table().query(
        KeyConditionExpression=Key('pk').eq(f'POST#{post_id}') & Key('sk').begins_with('COMMENT#'),
        ScanIndexForward=False,
        Limit=limit,
    )

    items = response.get('Items', [])
    comments = [_to_comment_response(i) for i in items]
    return _cors(200, {"comments": comments, "total": len(comments)})


def _to_comment_response(item: dict) -> dict:
    return _decimal_to_native({
        'id': item.get('comment_id', ''),
        'userName': item.get('user_name', ''),
        'userMbti': item.get('user_mbti', ''),
        'userAvatar': item.get('user_avatar', ''),
        'text': item.get('text', ''),
        'likes': item.get('likes', 0),
        'createdAt': item.get('created_at', ''),
        'timeAgo': _time_ago(item.get('created_at', '')),
    })


# ── Lambda entry point ───────────────────────────────────────────────────────

def lambda_handler(event: dict, context) -> dict:
    """
    Routes:
        POST   /api/posts                   — Create community post
        GET    /api/posts?date=YYYYMMDD      — List posts
        POST   /api/posts/{post_id}/vote     — Vote
        POST   /api/posts/{post_id}/comments — Add comment
        GET    /api/posts/{post_id}/comments — List comments
        OPTIONS                              — CORS preflight
    """
    try:
        if event.get("source") == "aws.events" or event.get("warmup"):
            return _cors(200, {"status": "warm"})

        rc = event.get("requestContext", {})
        if "http" in rc:
            method = rc["http"].get("method", "GET")
            path = rc["http"].get("path", "")
        else:
            method = event.get("httpMethod", "GET")
            path = event.get("path", "")

        params = event.get("queryStringParameters") or {}
        path_params = event.get("pathParameters") or {}

        if method == "OPTIONS":
            return _cors(200, {"message": "OK"})

        post_id = path_params.get("post_id") or path_params.get("id")

        # POST /api/posts — action-based dispatch
        # API Gateway only routes POST to /api/posts (no path param),
        # so vote/comment use body.action + body.post_id.
        if method == "POST":
            body = json.loads(event.get("body", "{}"))
            # All POST routes (create / vote / comment) need a verified user.
            # The body's `user_id` was previously trusted, allowing trivial
            # impersonation. Replace it with the JWT `sub` and ignore any
            # value the client supplied.
            try:
                body['user_id'] = get_authenticated_user_id(event)
            except AuthenticationError as e:
                return _cors(401, {"error": str(e)})
            action = body.get("action", "create")

            if action == "vote":
                pid = body.get("post_id", "")
                if not pid:
                    return _cors(400, {"error": "post_id is required"})
                return _vote_post(pid, body)
            elif action == "comment":
                pid = body.get("post_id", "")
                if not pid:
                    return _cors(400, {"error": "post_id is required"})
                return _add_comment(pid, body)
            else:
                return _create_post(body)

        # GET /api/posts — List posts
        if method == "GET" and not post_id:
            return _list_posts(params)

        # GET /api/posts/{post_id}?type=comments — List comments
        # GET /api/posts/{post_id} — placeholder
        if method == "GET" and post_id:
            if params.get("type") == "comments":
                return _list_comments(post_id, params)
            return _cors(200, {"post_id": post_id})

        return _cors(405, {"error": "Method not allowed"})

    except json.JSONDecodeError:
        return _cors(400, {"error": "Invalid JSON body"})
    except Exception as e:
        logger.error(f"Post handler error: {e}", exc_info=True)
        return _cors(500, {"error": "Internal server error"})
