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


@pytest.fixture(autouse=True)
def _block_real_ssm(request, monkeypatch):
    """유닛 테스트가 실제 SSM 을 호출하지 못하게 막는다.

    ``PgVectorV2Client`` 는 ``password`` 인자가 없으면
    ``common.secrets.get_pg_password()`` 를 거쳐 SSM
    ``/sedaily-mbti/v2/pg-password`` 를 친다 (``pgvector_v2_client.py:159``).
    개발 워크스테이션에는 AWS 자격증명이 있으므로, 스텁이 없으면 유닛 테스트가
    **운영 Postgres 비밀번호를 실제로 가져오고** 단언 실패 메시지에 그 값을
    그대로 찍는다 — 터미널 스크롤백과 CI 로그로 자격증명이 새는 경로다.

    ``get_pg_password`` 는 호출 시점에 모듈 전역에서 ``get_secret`` 를 찾으므로,
    여기서 ``get_secret`` 하나만 막으면 모든 호출 경로가 덮인다. 클라이언트가
    ``from common.secrets import get_pg_password`` 로 이름을 바인딩해 두었기
    때문에 ``get_pg_password`` 자체를 패치하면 이미 바인딩된 참조를 놓친다.

    ``@pytest.mark.integration`` 테스트는 실제 AWS 를 쓰는 것이 목적이므로
    제외한다.
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
    """유닛 테스트가 운영 feature flag 를 읽지 못하게 **시끄럽게** 막는다.

    ``common.feature_flag`` 는 DynamoDB 기반이고 row 가 없으면 ``True`` 를
    돌려주는 fail-open 이다. 스텁 없이 부르면 유닛 테스트 결과가 **운영 플래그
    상태에 좌우된다** — 실제로 ``collector-paper-mode`` 가 운영에서 enabled 인
    탓에 ``test_core1_collector`` 의 garbage-filter 테스트 6건이 엉뚱한 이유
    (``no-paper-element``)로 실패하고 있었고, 정작 검증하려던 필터에는 도달조차
    못 했다.

    두 함수를 다르게 다룬다 — 결정적 기본값이 있느냐가 갈랐다.

    * ``is_enabled(name)`` → **예외.** 호출자가 줄 수 있는 기본값이 없어서
      무엇을 돌려주든 임의 선택이 된다. 조용히 ``True``/``False`` 를 주면
      운영 의존이 그대로 묻힌다. 측정 결과 미스텁 호출자가 0개라 오늘 깨지는
      것이 없고, 앞으로 플래그에 의존하는 코드를 테스트하려는 사람은 무엇을
      해야 하는지 즉시 알게 된다.
    * ``get_threshold(name, default)`` → **호출자의 ``default`` 를 반환.**
      이 함수의 의미 자체가 "관리자가 덮어쓰지 않았으면 기본값"이고, 테스트
      에서는 "덮어쓴 적 없음"이 자연스러운 상태다. 예외를 던지면
      ``core2_transform.py:163`` 처럼 정당하게 부르는 곳 11개가 깨지는데,
      그 테스트들이 원하는 건 임계값 자체가 아니라 기본 동작이다.

    스텁 방법은 ``test_core1_collector.py`` 의 ``_enable_paper_mode`` /
    ``_disable_paper_mode`` 참조.

    ``@pytest.mark.integration`` 은 실 AWS 가 목적이므로 제외한다.
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
