"""User 비즈니스 로직 — 프로필·읽기 기록·통계·뱃지.

저장소는 PersonalRepository를 통해 접근한다.
"""
import json
import logging
from datetime import datetime, timedelta
from common.dates.validation import KST
from decimal import Decimal
from typing import Dict, Any, List

from config.constants import CORS_HEADERS
from repositories.personal_repository import get_personal_repository
from models.personal import UserProfile, ReadingRecord

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)



def decimal_to_float(obj):
    """JSON 직렬화를 위해 Decimal을 float으로 변환한다."""
    if isinstance(obj, Decimal):
        return float(obj)
    elif isinstance(obj, dict):
        return {k: decimal_to_float(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [decimal_to_float(i) for i in obj]
    return obj


# ── 프로필 ──

async def get_or_create_user(
    user_id: str,
    email: str = None,
    name: str = None,
    picture: str = None,
) -> Dict[str, Any]:
    """사용자 프로필을 조회하고, 없으면 생성한다."""
    repo = get_personal_repository()

    profile = await repo.get_user_profile(user_id)
    today = datetime.now(KST).strftime('%Y-%m-%d')

    if profile:
        # 기존 사용자: 마지막 로그인 갱신
        await repo.update_user_profile(user_id, {'last_login': today})

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
        # 신규 사용자
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


# ── 읽기 기록 ──

async def record_article_read(
    user_id: str,
    article_id: str,
    article_title: str = None,
) -> Dict[str, Any]:
    """기사 읽기를 기록하고, 신규 기사면 뱃지 조건을 확인한다."""
    repo = get_personal_repository()

    record = ReadingRecord(
        user_id=user_id,
        article_id=article_id,
        article_title=article_title or '',
    )

    # 중복 제거와 읽은 횟수 증가는 save_reading_record 가 처리한다.
    existing_history = await repo.list_reading_history(user_id, limit=200)
    is_new = not any(r.article_id == article_id for r in existing_history)

    success = await repo.save_reading_record(record)

    if success and is_new:
        await _check_and_award_badges(user_id)

    return {'success': success, 'is_new': is_new}


async def get_reading_history(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """사용자의 읽기 기록을 조회한다."""
    repo = get_personal_repository()
    records = await repo.list_reading_history(user_id, limit=limit)

    return [r.to_api() for r in records]


# ── 통계·뱃지 ──

async def get_user_stats(user_id: str) -> Dict[str, Any]:
    """사용자 통계를 조회한다."""
    repo = get_personal_repository()

    profile = await repo.get_user_profile(user_id)

    history = await repo.list_reading_history(user_id, limit=200)

    streak = _calculate_streak(history)

    now = datetime.now(KST)
    week_start = (now - timedelta(days=now.weekday())).strftime('%Y-%m-%d')
    this_week = sum(1 for r in history if r.read_at[:10] >= week_start)

    archives = await repo.list_archived_sentences(user_id, limit=200)

    total_reads = sum(r.read_count for r in history)

    return {
        'total_articles_read': total_reads,
        'total_comments': 0,  # 미집계 값(고정 0)
        'total_reactions': 0,  # 미집계 값(고정 0)
        'streak': streak,
        'this_week_articles': this_week,
        'badges': profile.badges if profile else [],
        'member_since': profile.created_at[:10] if profile and profile.created_at else None,
        'archived_sentences': len(archives),
    }


def _calculate_streak(history: List[ReadingRecord]) -> int:
    """하루 1건 이상 읽은 연속 일수를 계산한다(최대 365일)."""
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
    """업적 조건을 확인해 새 뱃지를 부여하고 부여한 뱃지 ID 리스트를 반환한다."""
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


# ── 응답 헬퍼 ──

# `core.response.success_response`/`error_response`와 시그니처가 달라(`error_response(message, status_code=500, ...)`) 별도로 둔다.
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
