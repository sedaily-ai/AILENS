"""Feature flag + threshold 조회 with 5-minute TTL cache.

사용 예:
    from common.feature_flag import is_enabled, get_threshold

    if not is_enabled('chatbot'):
        return {"statusCode": 503, "body": '{"error":"disabled"}'}

    batch_size = get_threshold('transform-max-articles', default=20)

DDB layout (sedaily-mbti-admin-config-dev):
    pk: 'CONFIG'
    sk: 'feature-flag/<name>'   value: {"enabled": true/false}
    sk: 'threshold/<name>'      value: {"threshold": <int>}

핵심 설계:
- DDB get_item per Lambda invoke (cached 5분) — Lambda warm 시 +1ms, cold 시 +20ms
- DDB error 시 stale cache → default fallback. fail-open / fail-safe (admin 이 의도 변경 안
  했으면 default 유지). secrets.py 의 fail-closed 와 의도적 차이.
- 같은 모듈 cache dict 재사용 — feature flag 는 key=name, threshold 는 key=`_threshold_<name>`
  으로 prefix 분리 (collision 회피).
- v1/v2/admin Lambda 모두 import 가능 (boto3 만 의존)
"""
import logging
import os
import time
from typing import Optional

import boto3

logger = logging.getLogger(__name__)

_TABLE_NAME = os.environ.get("ADMIN_CONFIG_TABLE", "sedaily-mbti-admin-config-dev")
_REGION = os.environ.get("AWS_REGION", "us-east-1")
_TTL_SECONDS = 300  # 5분
_DEFAULT_ON_MISSING = True  # row 없으면 enabled (안전 default — admin 이 명시 disable 만 차단)

# 모듈 레벨 cache: {flag_name: (enabled: bool, fetched_at: float)}
_cache: dict = {}
_table = None


def _get_table():
    global _table
    if _table is None:
        _table = boto3.resource("dynamodb", region_name=_REGION).Table(_TABLE_NAME)
    return _table


def is_enabled(name: str) -> bool:
    """Feature flag 조회. 5분 TTL cache. row 없으면 default True."""
    now = time.time()
    cached = _cache.get(name)
    if cached and (now - cached[1]) < _TTL_SECONDS:
        return cached[0]

    try:
        response = _get_table().get_item(Key={
            "pk": "CONFIG",
            "sk": f"feature-flag/{name}",
        })
        item = response.get("Item")
        if item is None:
            enabled = _DEFAULT_ON_MISSING
        else:
            enabled = bool(item.get("value", {}).get("enabled", _DEFAULT_ON_MISSING))
    except Exception as e:
        # DDB error 시 stale cache 우선, 없으면 fail-open
        if cached:
            return cached[0]
        logger.warning(f"feature_flag DDB error for {name}: {type(e).__name__}: {e}, using default {_DEFAULT_ON_MISSING}")
        return _DEFAULT_ON_MISSING

    _cache[name] = (enabled, now)
    return enabled


def get_threshold(name: str, default: int) -> int:
    """Threshold (numeric tunable) 조회. 5분 TTL cache. row 없으면 default 반환.

    DDB row 형식:
        pk='CONFIG', sk=f'threshold/{name}', value={"threshold": <int>}

    fail-safe — DDB error 시 stale cache 우선, 없으면 default. Lambda 호출 흐름이
    threshold 못 읽어도 fallback 값으로 정상 진행 가능 (feature flag 와 같은 fail-open
    철학). secrets.py 의 fail-closed 와 의도적 차이.

    Cache key prefix `_threshold_` 로 is_enabled 의 cache 와 분리 — 같은 name 으로
    flag/threshold 양쪽 사용해도 충돌 없음.
    """
    cache_key = f"_threshold_{name}"
    now = time.time()
    cached = _cache.get(cache_key)
    if cached and (now - cached[1]) < _TTL_SECONDS:
        return cached[0]

    try:
        response = _get_table().get_item(Key={
            "pk": "CONFIG",
            "sk": f"threshold/{name}",
        })
        item = response.get("Item")
        if item is None:
            value = default
        else:
            raw = item.get("value", {}).get("threshold", default)
            value = int(raw)  # DDB Number → Decimal → int 강제
    except Exception as e:
        if cached:
            return cached[0]
        logger.warning(f"feature_flag get_threshold error for {name}: {type(e).__name__}: {e}, using default {default}")
        return default

    _cache[cache_key] = (value, now)
    return value


def invalidate(name: Optional[str] = None) -> None:
    """수동 cache invalidate (테스트 / 즉시 반영 강제용).

    name=None → 전체 clear. name 지정 시 flag/threshold 양쪽 모두 제거 (key 와
    `_threshold_<name>` 두 entry 시도).
    """
    if name is None:
        _cache.clear()
    else:
        _cache.pop(name, None)
        _cache.pop(f"_threshold_{name}", None)
