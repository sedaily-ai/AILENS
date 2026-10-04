"""Feature flag + threshold 조회 with 5-minute TTL cache.

사용 예:
    from common.feature_flag import is_enabled, get_threshold

    if not is_enabled('chatbot'):
        return {"statusCode": 503, "body": '{"error":"disabled"}'}

    batch_size = get_threshold('transform-max-articles', default=20)

2026-09-09(v1.28): DynamoDB(sedaily-mbti-admin-config-dev, pk='CONFIG',
sk='feature-flag/<name>'|'threshold/<name>')에서 PostgreSQL(lens-cms-api,
`feature_flags`/`thresholds` 테이블) 경유로 전환. 이 모듈의 실제 프로덕션
호출자는 `handlers/chatbot_handler.py`/`handlers/question_handler.py`
(`is_enabled`만 사용, `get_threshold`는 현재 프로덕션 호출자 0 — 테스트
conftest.py만 참조) 둘뿐이라, 둘 다 v1.25에서 이미 설정된
`LENS_CMS_API_TOKEN` 평문 env var를 그대로 재사용한다(같은
`sedaily-mbti-lambda-execution-dev` 공유 역할이라 SSM 미경유).

핵심 설계:
- lens-cms-api HTTP GET per Lambda invoke (cached 5분) — 이전 DDB get_item
  과 지연시간 특성 동일(같은 VPC 밖 EC2 IP, DDB보다 약간 더 걸릴 수 있지만
  5분 캐시로 영향 미미).
- 백엔드 에러 시 stale cache → default fallback. fail-open / fail-safe
  (admin 이 의도 변경 안 했으면 default 유지). secrets.py 의 fail-closed
  와 의도적 차이.
- 같은 모듈 cache dict 재사용 — feature flag 는 key=name, threshold 는 key=`_threshold_<name>`
  으로 prefix 분리 (collision 회피).
"""
import json
import logging
import os
import time
import urllib.request
from config.constants import LENS_CMS_API_DEFAULT_URL

logger = logging.getLogger(__name__)

_API_URL = os.environ.get("LENS_CMS_API_URL", LENS_CMS_API_DEFAULT_URL)
_TOKEN = os.environ.get("LENS_CMS_API_TOKEN", "")
_TIMEOUT_SECONDS = 5
_TTL_SECONDS = 300  # 5분
_DEFAULT_ON_MISSING = True  # row 없으면 enabled (안전 default — admin 이 명시 disable 만 차단)

# 모듈 레벨 cache: {flag_name: (enabled: bool, fetched_at: float)}
_cache: dict = {}


def _get(path: str) -> dict:
    req = urllib.request.Request(
        f"{_API_URL}{path}", method="GET", headers={"X-Internal-Token": _TOKEN},
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
        return json.loads(res.read())


def is_enabled(name: str) -> bool:
    """Feature flag 조회. 5분 TTL cache. row 없으면 default True."""
    now = time.time()
    cached = _cache.get(name)
    if cached and (now - cached[1]) < _TTL_SECONDS:
        return cached[0]

    try:
        data = _get(f"/internal/config/feature-flags/{name}")
        raw = data.get("enabled")
        enabled = _DEFAULT_ON_MISSING if raw is None else bool(raw)
    except Exception as e:
        # 백엔드 에러 시 stale cache 우선, 없으면 fail-open
        if cached:
            return cached[0]
        logger.warning(f"feature_flag backend error for {name}: {type(e).__name__}: {e}, using default {_DEFAULT_ON_MISSING}")
        return _DEFAULT_ON_MISSING

    _cache[name] = (enabled, now)
    return enabled


def get_threshold(name: str, default: int) -> int:
    """Threshold (numeric tunable) 조회. 5분 TTL cache. row 없으면 default 반환.

    fail-safe — 백엔드 에러 시 stale cache 우선, 없으면 default. Lambda 호출
    흐름이 threshold 못 읽어도 fallback 값으로 정상 진행 가능 (feature flag
    와 같은 fail-open 철학). secrets.py 의 fail-closed 와 의도적 차이.

    Cache key prefix `_threshold_` 로 is_enabled 의 cache 와 분리 — 같은 name 으로
    flag/threshold 양쪽 사용해도 충돌 없음.
    """
    cache_key = f"_threshold_{name}"
    now = time.time()
    cached = _cache.get(cache_key)
    if cached and (now - cached[1]) < _TTL_SECONDS:
        return cached[0]

    try:
        data = _get(f"/internal/config/thresholds/{name}")
        raw = data.get("value")
        value = default if raw is None else int(raw)
    except Exception as e:
        if cached:
            return cached[0]
        logger.warning(f"feature_flag get_threshold error for {name}: {type(e).__name__}: {e}, using default {default}")
        return default

    _cache[cache_key] = (value, now)
    return value


