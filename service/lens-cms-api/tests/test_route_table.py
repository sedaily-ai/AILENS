"""main.py 분리(라우트 모듈화) 회귀 검사: 라우트 수와 정적 경로가 {slug} 경로보다 먼저 매칭되는 순서."""
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent))
os.environ.setdefault("ADMIN_INTERNAL_TOKEN", "test")
sys.modules.setdefault("db", MagicMock())  # 임포트 시 DB 풀을 만들지 않게 한다

from starlette.routing import Match  # noqa: E402

import main  # noqa: E402


def _endpoint(method, path):
    scope = {"type": "http", "path": path, "method": method, "root_path": "", "query_string": b"", "headers": []}
    for r in main.app.routes:
        if hasattr(r, "methods") and r.matches(scope)[0] == Match.FULL:
            return r.endpoint.__name__
    return None


def test_route_count_includes_account_storage():
    # 165 → 162: 관심사 설정 제거(7d573c50)로 /api/v2/issue-letters/me/interests GET·PUT, /me/feed 3개가 빠졌다.
    # 162 → 159: 완료 판정 다이어트로 /internal/personal/lens/activity·/rewards·/format-preference 3개가 빠졌다.
    # 159 → 158: 저장 문장 관련 글 다이어트로 /internal/personal/lens/sentence-inputs/{sentence_id}가 빠졌다.
    assert len([r for r in main.app.routes if hasattr(r, "methods")]) == 158


def test_removed_record_routes_are_gone_but_view_reporting_stays():
    for path in ("/internal/personal/lens/activity", "/internal/personal/lens/rewards", "/internal/personal/lens/format-preference"):
        assert _endpoint("GET", path) is None
    assert _endpoint("POST", "/internal/personal/lens/activity/sessions") == "session"
    assert _endpoint("POST", "/internal/personal/lens/activity/events") == "event"
    assert _endpoint("GET", "/internal/personal/lens/recommendation-inputs") == "recommendation_inputs"


def test_static_paths_win_over_param_paths():
    assert _endpoint("GET", "/api/v2/issue-letters/bundles") == "issue_letter_bundles"
    assert _endpoint("GET", "/api/v2/issue-letters/editors") == "issue_letter_editors"
    assert _endpoint("GET", "/admin/posts/by-source-url") == "admin_find_post_by_source_url"
    assert _endpoint("GET", "/internal/personal/archives/popular") == "internal_popular_archives"
    assert _endpoint("GET", "/internal/personal/lens/preferences") == "preferences"
    assert _endpoint("GET", "/internal/personal/lens/content/resolve") == "resolve"
