"""기존 읽기 API도 읽음 저장을 유지하며 배지는 새로 지급하지 않는다."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from services.user import profile


def test_legacy_read_keeps_history_without_awarding_badges(monkeypatch):
    repo = SimpleNamespace(
        list_reading_history=AsyncMock(return_value=[]),
        save_reading_record=AsyncMock(return_value=True),
        get_user_profile=AsyncMock(),
        update_user_profile=AsyncMock(),
    )
    monkeypatch.setattr(profile, 'get_personal_repository', lambda: repo)
    result = asyncio.run(profile.record_article_read('owner', 'article', '기사'))
    assert result == {'success': True, 'is_new': True}
    repo.save_reading_record.assert_awaited_once()
    record = repo.save_reading_record.await_args.args[0]
    assert record.user_id == 'owner' and record.article_id == 'article'
    repo.get_user_profile.assert_not_awaited()
    repo.update_user_profile.assert_not_awaited()
