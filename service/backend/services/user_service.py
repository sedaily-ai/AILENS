"""User 비즈니스 로직 — handlers/user_handler.py에서 추출
(2026-08-24, 코드 리팩토링 감사 Track B, God 파일 분해).

Storage: Personal DB (sedaily-mbti-personal-dev) via PersonalRepository.
API contract unchanged — all request/response formats preserved.
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Dict, Any, List

from config.constants import CORS_HEADERS
from repositories.personal_repository import get_personal_repository
from models.personal import UserProfile, ReadingRecord

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
            created_at=now,
            last_login=today,
        )
        await repo.save_user_profile(new_profile)

        return {
            'user_id': user_id,
            'email': email,
            'name': name,
            'picture': picture,
            'created_at': now,
            'last_login': today,
            'streak': 1,
            'is_new': True,
        }


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
        await _check_and_award_badges(user_id)

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
# Response helpers
# =============================================================================

# Renamed to non-underscored names since this is now a shared service module
# (not a handler-private helper) — but kept distinct from
# `core.response.success_response`/`error_response`, whose signatures differ
# (`error_response(message, status_code=500, ...)`).
def success_response(data: dict) -> dict:
    return {
        'statusCode': 200,
        'headers': CORS_HEADERS,
        'body': json.dumps(decimal_to_float(data), ensure_ascii=False)
    }


def error_response(status_code: int, message: str) -> dict:
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
