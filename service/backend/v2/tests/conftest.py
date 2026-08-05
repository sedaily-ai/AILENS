"""Pytest configuration for AI LENS v2 tests.

Registers v2-specific markers here (not in a backend-wide pytest.ini /
pyproject.toml) so v1 tests are untouched — per `.clauderules` #1, v1
configuration files must not be modified.

Also provides a session-scoped autouse fixture that wipes stale
test-prefix rows from pgvector v2 at session start and end. Per-test
fixtures still do their own pre/post wipe; this is belt-and-suspenders
against aborts (SIGKILL, network drop) that prevent per-test teardown
from running.

pytest auto-discovers this file because it lives in a test directory
(``backend/v2/tests/``). When running from ``backend/`` with
``python3 -m pytest v2/tests/...``, the hook below fires before test
collection and silences ``PytestUnknownMarkWarning`` for ``integration``
and ``slow``.
"""
from __future__ import annotations

import os

import pytest


# Test-data prefixes used by v2 test modules. Each new test file that
# inserts live rows should add its prefix here so the session-autouse
# cleanup covers it. Convention: ``test_v2_<task>_<scope>_``.
_TEST_PREFIXES: tuple[str, ...] = (
    "test_v2_1_3_",  # test_pgvector_v2_client.py — TASK-1.3
    "test_v2_2_1_",  # test_core1_collector.py — TASK-2.1 (pg rows only; S3 cleanup is per-test)
    "test_v2_2_3_",  # test_core2_transform.py, test_transform_v2_service.py — TASK-2.3
    "test_v2_2_4_",  # test_validator.py — TASK-2.4
    "test_v2_2_5_",  # test_backfill_from_v1.py — TASK-2.5
    "test_v2_2_6_",  # test_pgvector_v2_client.py article_selections methods — TASK-2.6
    "test_v2_3_1_",  # test_memory_manager.py — TASK-3.1 (Round 5-A)
    "test_v2_3_2_",  # test_context_broker.py — TASK-3.2 (Round 5-A)
    "test_v2_3_3_",  # test_recommend_agent.py — TASK-3.3 (Round 5-B)
    "test_v2_3_4_",  # test_core3_feed/record_interaction — TASK-3.4 (Round 5-C)
    "test_v2_3_5_",  # test_core3_consolidate + memory_manager.consolidate — TASK-3.5 (Round 5-D)
    "test_v2_3_8_",  # test_cloudwatch_metrics.py — Cost-1b (Bedrock token tracking)
)


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


@pytest.fixture(autouse=True)
def _block_real_cloudwatch(request, monkeypatch):
    """유닛 테스트가 운영 CloudWatch 네임스페이스에 쓰지 못하게 막는다.

    ``emit_count`` / ``emit_bedrock_tokens`` 는 ``_get_cw_client().
    put_metric_data(...)`` 로 **실제 PutMetricData** 를 호출한다
    (``cloudwatch_metrics.py:98``). 핸들러 코드가 도는 유닛 테스트는 그
    경로를 그대로 타므로, 개발 워크스테이션의 AWS 자격증명으로 운영
    네임스페이스 ``sedaily-mbti/v2`` 에 테스트 값이 섞여 들어간다. 실측:
    ``v2/tests/`` 1회 실행당 **PutMetricData 17회**.

    아무도 눈치채지 못한 이유는 ``emit_count`` 가 모든 예외를
    ``logger.warning`` 으로 삼키기 때문이다 — 성공하면 조용히 오염되고,
    실패해도 조용하다.

    SSM 과 달리 **예외를 던지지 않고 MagicMock 을 준다.** 근거는
    ``get_threshold`` 와 같다 — 메트릭은 fire-and-forget 관측 수단이라
    "안 나갔음"이 결정적이고 자연스러운 테스트 상태다. 예외를 던져 봐야
    ``emit_count`` 가 그 자리에서 삼켜 경고 로그만 남기므로 신호도 못 된다.
    MagicMock 이면 호출 기록이 남아 메트릭을 검증하고 싶은 테스트는
    그대로 단언할 수 있다.

    ``_get_cw_client`` 하나만 막으면 모든 emit 경로가 덮인다 —
    ``test_cloudwatch_metrics.py`` 가 이미 같은 지점을 패치해 검증한다
    (그 파일의 안쪽 ``patch`` 는 나중에 적용돼 이 fixture 를 덮으므로
    충돌하지 않는다).

    ``@pytest.mark.integration`` 은 실 AWS 가 목적이므로 제외한다.
    """
    if request.node.get_closest_marker("integration"):
        yield
        return

    from unittest.mock import MagicMock

    from v2.clients import cloudwatch_metrics as _cw

    monkeypatch.setattr(_cw, "_get_cw_client", lambda: MagicMock())
    yield


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_prefixes():
    """Session-wide belt-and-suspenders cleanup for v2 pgvector tests.

    Runs once at session setup and once at teardown, regardless of test
    outcomes. Silently no-ops when PG_V2_* env vars are missing
    (pure-unit runs) or when the DB is unreachable (e.g. SG not yet
    opened) — unit tests must be runnable without any live infra.

    Per-test fixtures (``pg_client`` in test_pgvector_v2_client.py) still
    do their own pre/post wipe. This session-scope fixture exists only to
    catch rows left by a SIGKILL'd or network-dropped previous session
    where per-test teardown couldn't run.
    """
    if not (os.getenv("PG_V2_HOST") and os.getenv("PG_V2_PASSWORD")):
        yield
        return

    # Lazy import so unit-only runs (no env vars) skip pg8000 entirely.
    from v2.clients.pgvector_v2_client import PgVectorV2Client

    def _wipe_safe() -> None:
        """Best-effort session cleanup — swallow every error so a cleanup
        glitch never fails the session. Per-test fixtures will still catch
        any residue that slips through here.

        SAFETY: prefix values come from the ``_TEST_PREFIXES`` constant
        above; they are never user- or test-body-controlled. The f-string
        composition below therefore has no injection surface.
        """
        try:
            client = PgVectorV2Client()
            for prefix in _TEST_PREFIXES:
                for sql in (
                    f"DELETE FROM user_interactions WHERE news_id LIKE '{prefix}%'",
                    f"DELETE FROM user_profiles WHERE user_id LIKE '{prefix}%'",
                    f"DELETE FROM article_selections WHERE news_id LIKE '{prefix}%'",
                    f"DELETE FROM article_versions WHERE news_id LIKE '{prefix}%'",
                    f"DELETE FROM articles WHERE news_id LIKE '{prefix}%'",
                ):
                    try:
                        client.conn.run(sql)
                    except Exception:
                        pass
            client.close()
        except Exception:
            pass

    _wipe_safe()
    try:
        yield
    finally:
        _wipe_safe()
