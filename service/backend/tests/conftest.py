"""Pytest configuration for AI LENS v2 tests.

Registers v2-specific markers here (not in a backend-wide pytest.ini /
pyproject.toml) so v1 tests are untouched — per `.clauderules` #1, v1
configuration files must not be modified.

pytest auto-discovers this file because it lives in a test directory
(``backend/v2/tests/``). When running from ``backend/`` with
``python3 -m pytest v2/tests/...``, the hook below fires before test
collection and silences ``PytestUnknownMarkWarning`` for ``integration``
and ``slow``.
"""
from __future__ import annotations

import pytest


def pytest_configure(config) -> None:
    """Register v2 markers so ``@pytest.mark.integration`` / ``slow`` work."""
    config.addinivalue_line(
        "markers",
        "integration: test requires live AWS resources "
        "(e.g. PG_V2_HOST, PG_V2_PASSWORD). Auto-skipped when env vars are unset.",
    )
    config.addinivalue_line(
        "markers",
        "slow: long-running test (e.g. multi-row perf benchmarks). "
        "Excluded by default; opt-in via ``-m slow``.",
    )


# 실제 AWS·배포된 API를 호출하는 테스트는 tests/integration/ 아래에 둔다. 폴더 기준으로 한 번에 마커를 붙여
# `pytest -m "not integration"`만으로 단위 테스트만 안전하게 돌 수 있게 한다(수집 단계 import 오류까지 피하려면 --ignore=tests/integration).
def pytest_collection_modifyitems(items) -> None:
    for item in items:
        if "integration" in item.path.parts:
            item.add_marker(pytest.mark.integration)


@pytest.fixture(autouse=True)
def _block_real_ssm(request, monkeypatch):
    """유닛 테스트가 실제 SSM 을 호출하지 못하도록 차단한다.

    개발 환경에는 AWS 자격증명이 있어 스텁이 없으면 운영 DB 비밀번호를 실제로 조회하고,
    단언 실패 메시지를 통해 그 값이 로그에 노출될 수 있다.
    ``get_pg_password`` 는 호출 시점에 모듈 전역의 ``get_secret`` 을 찾으므로 ``get_secret`` 만 막으면
    모든 호출 경로가 차단된다. 이미 바인딩된 ``get_pg_password`` 참조는 패치로 막을 수 없다.

    ``@pytest.mark.integration`` 테스트는 실제 AWS 사용이 목적이므로 제외한다.
    """
    if request.node.get_closest_marker("integration"):
        yield
        return

    from common import secrets as _secrets

    # 이전 실행이 캐시한 실제 값이 5분 TTL 안에 남아 있을 수 있다.
    _secrets._cache.clear()
    monkeypatch.setattr(
        _secrets, "get_secret", lambda param_name: f"fake-secret::{param_name}"
    )
    yield
    _secrets._cache.clear()


@pytest.fixture(autouse=True)
def _block_real_feature_flags(request, monkeypatch):
    """유닛 테스트가 운영 feature flag 를 읽지 못하도록 차단한다.

    ``common.feature_flag`` 는 DynamoDB 기반이며 row 가 없으면 ``True`` 를 반환하는 fail-open 이다.
    스텁 없이 호출하면 테스트 결과가 운영 플래그 상태에 좌우되므로 다음과 같이 처리한다.

    * ``is_enabled(name)``: 예외를 발생시킨다. 호출자가 지정할 기본값이 없어 반환값이 임의 선택이 되기 때문이다.
    * ``get_threshold(name, default)``: 호출자의 ``default`` 를 반환한다. 테스트에서는 관리자가 덮어쓰지 않은 상태가 자연스럽다.

    ``@pytest.mark.integration`` 은 실제 AWS 호출이 목적이므로 제외한다.
    """
    if request.node.get_closest_marker("integration"):
        yield
        return

    from common import feature_flag as _ff

    def _explode(name, *args, **kwargs):
        raise AssertionError(
            f"유닛 테스트가 feature flag {name!r} 를 스텁 없이 조회했다. "
            f"그대로 두면 실제 DynamoDB 를 읽어 테스트 결과가 운영 설정에 "
            f"좌우된다. 해당 핸들러 모듈의 feature_flag.is_enabled 를 "
            f"monkeypatch 로 고정하라 "
            f"(예: test_core1_collector.py 의 _disable_paper_mode)."
        )

    _ff._cache.clear()
    monkeypatch.setattr(_ff, "is_enabled", _explode)
    monkeypatch.setattr(_ff, "get_threshold", lambda name, default: default)
    yield
    _ff._cache.clear()
