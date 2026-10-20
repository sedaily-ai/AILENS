"""/api/user 계정 경로: 로그인 프로필 동기화만 남았다(2026-10-20 기능 다이어트). 네트워크 호출 없음."""
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from handlers.user import user
from services.user import profile


def _event(path, method='POST', body=None):
    return {'requestContext': {'http': {'method': method, 'path': path}}, 'body': json.dumps(body or {})}


def _repo(existing=True):
    return SimpleNamespace(
        get_user_profile=AsyncMock(return_value=SimpleNamespace(email='a@x.invalid', name='A', picture='', created_at='2026-01-01') if existing else None),
        update_user_profile=AsyncMock(),
        save_user_profile=AsyncMock(return_value=True),
        # 지운 streak 계산이 다시 읽기 이력을 조회하면 바로 실패하게 한다.
        list_reading_history=AsyncMock(side_effect=AssertionError('login must not read history')),
    )


@pytest.mark.parametrize('existing', [True, False])
def test_profile_login_skips_streak_and_reading_history(monkeypatch, existing):
    repo = _repo(existing)
    monkeypatch.setattr(profile, 'get_personal_repository', lambda: repo)
    result = asyncio.run(profile.get_or_create_user('owner', 'a@x.invalid', 'A', ''))
    assert 'streak' not in result and result['is_new'] is (not existing)
    repo.list_reading_history.assert_not_awaited()
    (repo.update_user_profile if existing else repo.save_user_profile).assert_awaited_once()


@pytest.mark.parametrize('path,method', [
    ('/api/user/read', 'POST'),
    ('/api/user/history', 'GET'),
    ('/api/user/stats', 'GET'),
    ('/api/user/profile', 'GET'),
])
def test_removed_user_routes_are_404_without_storage(monkeypatch, path, method):
    monkeypatch.setattr(user, 'get_authenticated_user_id', lambda event: 'owner')
    monkeypatch.setattr(profile, 'get_personal_repository', lambda: pytest.fail('removed route must not touch storage'))
    response = user.lambda_handler(_event(path, method, {'article_id': 'a'}), None)
    assert response['statusCode'] == 404


def test_profile_route_still_syncs(monkeypatch):
    repo = _repo(True)
    monkeypatch.setattr(user, 'get_authenticated_user_id', lambda event: 'owner')
    monkeypatch.setattr(profile, 'get_personal_repository', lambda: repo)
    response = user.lambda_handler(_event('/api/user/profile', 'POST', {'email': 'a@x.invalid'}), None)
    assert response['statusCode'] == 200 and json.loads(response['body'])['user_id'] == 'owner'
