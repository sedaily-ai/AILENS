"""
User Activity Handler Lambda Function
Handles user profile, reading history, and statistics.

Storage: Personal DB (sedaily-mbti-personal-dev) via PersonalRepository.
Migrated from engagement table to dedicated personal table.

API contract unchanged — all request/response formats preserved.
"""
import logging
import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Dict, Any, List, Optional

from config.constants import CORS_HEADERS, MBTI_GROUPS
from repositories.personal_repository import get_personal_repository
from models.personal import UserProfile, ReadingRecord
from core.auth import get_authenticated_user_id
from core.exceptions import AuthenticationError

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

KST = timezone(timedelta(hours=9))


def decimal_to_float(obj):
    """Convert Decimal to float for JSON serialization"""
    if isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, dict):
        return {k: decimal_to_float(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [decimal_to_float(i) for i in obj]
    return obj


# =============================================================================
# User Profile
# =============================================================================

async def get_or_create_user(
    user_id: str,
    email: str = None,
    name: str = None,
    picture: str = None,
    mbti_group: str = 'SF',
) -> Dict[str, Any]:
    """Get or create user profile"""
    repo = get_personal_repository()

    profile = await repo.get_user_profile(user_id)
    today = datetime.now(KST).strftime('%Y-%m-%d')

    if profile:
        # Existing user — update last login
        await repo.update_user_profile(user_id, {'last_login': today})

        # Calculate streak
        history = await repo.list_reading_history(user_id, limit=60)
        streak = _calculate_streak(history)

        return {
            'user_id': user_id,
            'email': profile.email,
            'name': profile.name,
            'picture': profile.picture,
            'mbti_group': profile.mbti_group,
            'created_at': profile.created_at,
            'last_login': today,
            'streak': streak,
            'is_new': False,
        }
    else:
        # New user
        now = datetime.now(KST).isoformat()
        new_profile = UserProfile(
            user_id=user_id,
            email=email or '',
            name=name or '',
            picture=picture or '',
            mbti_group=mbti_group if mbti_group in MBTI_GROUPS else 'SF',
            created_at=now,
            last_login=today,
        )
        await repo.save_user_profile(new_profile)

        return {
            'user_id': user_id,
            'email': email,
            'name': name,
            'picture': picture,
            'mbti_group': mbti_group,
            'created_at': now,
            'last_login': today,
            'streak': 1,
            'is_new': True,
        }


async def update_user_mbti(user_id: str, mbti_group: str) -> Dict[str, Any]:
    """Update user's MBTI group"""
    if mbti_group not in MBTI_GROUPS:
        raise ValueError(f"Invalid MBTI group: {mbti_group}")

    repo = get_personal_repository()
    updated = await repo.update_user_profile(user_id, {'mbti_group': mbti_group})

    if updated:
        return {'success': True, 'mbti_group': mbti_group}
    raise ValueError("Failed to update MBTI group")


# =============================================================================
# Reading History
# =============================================================================

async def record_article_read(
    user_id: str,
    article_id: str,
    article_title: str = None,
) -> Dict[str, Any]:
    """Record that user read an article"""
    repo = get_personal_repository()

    record = ReadingRecord(
        user_id=user_id,
        article_id=article_id,
        article_title=article_title or '',
    )

    # save_reading_record handles dedup + increment internally
    existing_history = await repo.list_reading_history(user_id, limit=200)
    is_new = not any(r.article_id == article_id for r in existing_history)

    success = await repo.save_reading_record(record)

    if success and is_new:
        # Check for badges
        new_badges = await _check_and_award_badges(user_id)

    return {'success': success, 'is_new': is_new}


async def get_reading_history(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Get user's reading history"""
    repo = get_personal_repository()
    records = await repo.list_reading_history(user_id, limit=limit)

    return [r.to_api() for r in records]


# =============================================================================
# Statistics & Badges
# =============================================================================

async def get_user_stats(user_id: str) -> Dict[str, Any]:
    """Get user statistics"""
    repo = get_personal_repository()

    # Profile
    profile = await repo.get_user_profile(user_id)

    # Reading history
    history = await repo.list_reading_history(user_id, limit=200)

    # Streak
    streak = _calculate_streak(history)

    # This week's count
    now = datetime.now(KST)
    week_start = (now - timedelta(days=now.weekday())).strftime('%Y-%m-%d')
    this_week = sum(1 for r in history if r.read_at[:10] >= week_start)

    # Archived sentences count
    archives = await repo.list_archived_sentences(user_id, limit=200)

    total_reads = sum(r.read_count for r in history)

    return {
        'total_articles_read': total_reads,
        'total_comments': 0,  # placeholder — engagement table tracks this
        'total_reactions': 0,  # placeholder
        'streak': streak,
        'this_week_articles': this_week,
        'badges': profile.badges if profile else [],
        'member_since': profile.created_at[:10] if profile and profile.created_at else None,
        'archived_sentences': len(archives),
    }


def _calculate_streak(history: List[ReadingRecord]) -> int:
    """Calculate consecutive days with at least one read."""
    if not history:
        return 0

    read_dates = set()
    for r in history:
        if r.read_at:
            read_dates.add(r.read_at[:10])

    streak = 0
    check_date = datetime.now(KST)

    for _ in range(365):
        date_str = check_date.strftime('%Y-%m-%d')
        if date_str in read_dates:
            streak += 1
        else:
            break
        check_date -= timedelta(days=1)

    return streak


async def _check_and_award_badges(user_id: str) -> List[str]:
    """Check and award badges based on achievements"""
    repo = get_personal_repository()
    profile = await repo.get_user_profile(user_id)
    if not profile:
        return []

    stats = await get_user_stats(user_id)
    existing = set(profile.badges)
    new_badges = []

    rules = [
        ('first_login', lambda s: True),
        ('reader_10', lambda s: s['total_articles_read'] >= 10),
        ('reader_50', lambda s: s['total_articles_read'] >= 50),
        ('reader_100', lambda s: s['total_articles_read'] >= 100),
        ('streak_7', lambda s: s['streak'] >= 7),
        ('streak_30', lambda s: s['streak'] >= 30),
        ('weekly_5', lambda s: s['this_week_articles'] >= 5),
    ]

    for badge_id, condition in rules:
        if badge_id not in existing and condition(stats):
            new_badges.append(badge_id)

    if new_badges:
        all_badges = list(existing) + new_badges
        await repo.update_user_profile(user_id, {'badges': all_badges})

    return new_badges


# =============================================================================
# Lambda Handler
# =============================================================================

def lambda_handler(event: dict, context) -> dict:
    """
    Lambda handler for user API.

    Routes:
    - POST /api/user/profile - Get or create user profile (requires auth)
    - PUT /api/user/mbti - Update MBTI group
    - POST /api/user/read - Record article read
    - GET /api/user/history - Get reading history
    - GET /api/user/stats - Get user statistics
    """
    try:
        # Parse request
        request_context = event.get('requestContext', {})

        if 'http' in request_context:
            http_method = request_context['http'].get('method', 'GET')
            path = request_context['http'].get('path', '')
        else:
            http_method = event.get('httpMethod', 'GET')
            path = event.get('path', '')

        # Handle CORS preflight
        if http_method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': CORS_HEADERS,
                'body': ''
            }

        # Parse body
        import base64
        body = event.get('body', '{}')
        is_base64 = event.get('isBase64Encoded', False)

        if body and is_base64:
            body = base64.b64decode(body).decode('utf-8')

        if isinstance(body, str) and body:
            body = json.loads(body)
        elif not body:
            body = {}

        # Get user_id from the verified Cognito ID token. Previously this
        # accepted `user_id` from the request body or query string, which
        # let any caller impersonate any user (read history, sync profile,
        # etc.). The trusted source is now the JWT signature.
        query_params = event.get('queryStringParameters', {}) or {}
        try:
            user_id = get_authenticated_user_id(event)
        except AuthenticationError as e:
            return _error_response(401, str(e))

        logger.info(f"User request: {http_method} {path} user={user_id}")

        import asyncio

        # Route handling
        if '/profile' in path:
            if http_method == 'POST':
                email = body.get('email')
                name = body.get('name')
                picture = body.get('picture')
                mbti_group = body.get('mbti_group', 'SF')

                result = asyncio.run(
                    get_or_create_user(user_id, email, name, picture, mbti_group)
                )
                return _success_response(result)

        elif '/mbti' in path and http_method == 'PUT':
            mbti_group = body.get('mbti_group')
            if not mbti_group:
                return _error_response(400, 'mbti_group is required')

            result = asyncio.run(update_user_mbti(user_id, mbti_group))
            return _success_response(result)

        elif '/read' in path and http_method == 'POST':
            article_id = body.get('article_id')
            article_title = body.get('article_title')

            if not article_id:
                return _error_response(400, 'article_id is required')

            result = asyncio.run(
                record_article_read(user_id, article_id, article_title)
            )
            return _success_response(result)

        elif '/history' in path and http_method == 'GET':
            history = asyncio.run(get_reading_history(user_id))
            return _success_response({'history': history})

        elif '/stats' in path:
            stats = asyncio.run(get_user_stats(user_id))
            return _success_response(stats)

        else:
            return _error_response(404, 'Not found')

    except ValueError as e:
        return _error_response(400, str(e))

    except Exception as e:
        logger.error(f"User handler error: {e}", exc_info=True)
        return _error_response(500, '서버 오류가 발생했습니다.')


# Renamed to underscored privates so they cannot collide with
# `core.response.success_response` / `core.response.error_response`, whose
# signatures are different (`error_response(message, status_code=500, ...)`).
def _success_response(data: dict) -> dict:
    return {
        'statusCode': 200,
        'headers': CORS_HEADERS,
        'body': json.dumps(decimal_to_float(data), ensure_ascii=False)
    }


def _error_response(status_code: int, message: str) -> dict:
    return {
        'statusCode': status_code,
        'headers': CORS_HEADERS,
        'body': json.dumps({
            'error': {
                'code': 'USER_ERROR',
                'message': message
            }
        }, ensure_ascii=False)
    }
