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
    # 158 → 162: 저장한 기사(v1.57) /internal/personal/lens/article-bookmarks 목록·상태·저장·해제 4개가 생겼다.
    # 162 → 155: 기능 다이어트 2차(2026-10-20)로 레터 테스트 메일 1개, 알림 설정·동의 GET·PUT 4개, 웹 푸시 기기 등록·해제 2개가 빠졌다.
    # 155 → 147: 알림 워커 제거(2026-10-20 기능 다이어트)로 /notifications/due GET·POST, context·inputs·candidates·plans·claim·send-claim 8개가 빠졌다.
    assert len([r for r in main.app.routes if hasattr(r, "methods")]) == 147


def test_feature_diet_2_routes_are_gone():
    assert _endpoint("POST", "/api/v2/issue-letters/subscriptions/test") is None
    assert _endpoint("GET", "/api/v2/issue-letters/subscriptions/preview") == "get_letter_subscription_preview"
    assert _endpoint("POST", "/api/v2/issue-letters/subscriptions") == "post_letter_subscription"
    for method in ("GET", "PUT"):
        for path in ("/internal/personal/lens/notifications/preferences", "/internal/personal/lens/notifications/consent"):
            assert _endpoint(method, path) is None
    assert _endpoint("POST", "/internal/personal/lens/push-subscriptions") is None
    assert _endpoint("DELETE", "/internal/personal/lens/push-subscriptions/x") is None
    # 알림 워커가 쓰던 경로도 워커와 함께 지웠다(2026-10-20 기능 다이어트로 알림 워커 제거).
    for method, path in (("GET", "/internal/personal/lens/notifications/due"),
                         ("POST", "/internal/personal/lens/notifications/due"),
                         ("GET", "/internal/personal/lens/notifications/context"),
                         ("GET", "/internal/personal/lens/notifications/inputs"),
                         ("GET", "/internal/personal/lens/notifications/candidates"),
                         ("POST", "/internal/personal/lens/notifications/plans"),
                         ("POST", "/internal/personal/lens/notifications/claim"),
                         ("POST", "/internal/personal/lens/notifications/send-claim")):
        assert _endpoint(method, path) is None
    # 워커와 함께 쓰던 추천 후보 경로는 대시보드가 쓰므로 남는다.
    assert _endpoint("POST", "/internal/personal/lens/recommendation-candidates") == "recommendation_candidates"


def test_article_bookmark_routes():
    assert _endpoint("GET", "/internal/personal/lens/article-bookmarks") == "article_bookmarks"
    assert _endpoint("GET", "/internal/personal/lens/article-bookmarks/42") == "article_bookmark"
    assert _endpoint("PUT", "/internal/personal/lens/article-bookmarks/42") == "save_article_bookmark"
    assert _endpoint("DELETE", "/internal/personal/lens/article-bookmarks/42") == "remove_article_bookmark"


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
