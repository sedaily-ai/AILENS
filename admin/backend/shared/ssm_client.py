"""SSM SecureString fetch + 5분 TTL 모듈 레벨 cache.

cold start 마다 새로 fetch 하지만 같은 invocation 안에서는 cache 사용.
warm Lambda 라면 5분 TTL 적용 — Admin-3 라운드의 prompt cache 와 동일 패턴.
"""

import os
import time
from typing import Optional

import boto3

REGION = os.environ.get("AWS_REGION", "us-east-1")
TTL_SECONDS = 300

_client = boto3.client("ssm", region_name=REGION)
_cache: dict[str, tuple[str, float]] = {}


def get_secure(name: str, *, force_refresh: bool = False) -> str:
    """SecureString 값 fetch. TTL 안에 동일 name 재호출 시 cache hit."""
    now = time.time()
    if not force_refresh and name in _cache:
        value, fetched_at = _cache[name]
        if now - fetched_at < TTL_SECONDS:
            return value

    resp = _client.get_parameter(Name=name, WithDecryption=True)
    value = resp["Parameter"]["Value"]
    _cache[name] = (value, now)
    return value


def put_secure(name: str, value: str) -> None:
    """SecureString 값 update (overwrite). cache 갱신."""
    _client.put_parameter(
        Name=name,
        Value=value,
        Type="SecureString",
        Overwrite=True,
    )
    _cache[name] = (value, time.time())


def invalidate(name: Optional[str] = None) -> None:
    if name is None:
        _cache.clear()
    else:
        _cache.pop(name, None)
