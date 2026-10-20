"""User 비즈니스 로직 — 로그인 때 프로필 생성·동기화.

저장소는 PersonalRepository를 통해 접근한다.
읽기 기록(/api/user/read)·이력(/history)·통계(/stats)와 연속 읽기 일수(streak) 계산은 지웠다(2026-10-20 기능 다이어트).
웹·앱 어디에서도 부르거나 읽지 않았고, streak 때문에 로그인마다 CMS 읽기 이력을 한 번 더 조회했다.
"""
import json
import logging
from datetime import datetime
from common.dates.validation import KST
from decimal import Decimal
from typing import Dict, Any

from config.constants import CORS_HEADERS
from repositories.personal_repository import get_personal_repository
from models.personal import UserProfile

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

        return {
            'user_id': user_id,
            'email': profile.email,
            'name': profile.name,
            'picture': profile.picture,
            'created_at': profile.created_at,
            'last_login': today,
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
            'is_new': True,
        }


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
