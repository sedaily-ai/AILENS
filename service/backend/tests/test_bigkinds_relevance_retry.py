"""빅카인즈 관련도 정렬 거부를 영구히 기억하지 않고 잠시 뒤 다시 시도하는지 확인한다(네트워크 호출 없음)."""
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture
def bk(monkeypatch):
    secrets = types.ModuleType("common.secrets")
    secrets.get_secret = lambda name: "key"
    monkeypatch.setitem(sys.modules, "common.secrets", secrets)
    for name in ("services.timeline.bigkinds_search",):
        sys.modules.pop(name, None)
    import services.timeline.bigkinds_search as m
    m._relevance_rejected_until = 0.0
    return m


def test_relevance_is_retried_after_cooldown(bk, monkeypatch):
    calls = []

    def fake_post(key, query, f, u, size, sort_arg, inc):
        calls.append(next(k for k, v in bk._SORT_ARGUMENTS.items() if v == sort_arg))
        if sort_arg == bk._SORT_ARGUMENTS["relevance"] and len(calls) == 1:
            raise bk.BigKindsRejected("일시 거부")
        return []

    monkeypatch.setattr(bk, "_post_search", fake_post)
    now = [1000.0]
    monkeypatch.setattr(bk.time, "monotonic", lambda: now[0])

    assert bk.search_news("q", "2026-01-01", "2026-01-02", 5, sort="relevance").sort_applied == "date"  # 거부 → 최신순 대체
    assert calls == ["relevance", "date"]
    now[0] += 60  # 냉각 중에는 관련도를 다시 시도하지 않는다
    assert bk.search_news("q", "2026-01-01", "2026-01-02", 5, sort="relevance").sort_applied == "date"
    assert calls[2:] == ["date"]
    now[0] += 400  # 냉각 끝 → 다시 관련도 시도, 성공하면 복구
    assert bk.search_news("q", "2026-01-01", "2026-01-02", 5, sort="relevance").sort_applied == "relevance"
    assert calls[3:] == ["relevance"]
