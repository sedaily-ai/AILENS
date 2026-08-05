"""SSM SecureString 조회 with 5-minute TTL cache.

사용 예:
    from common.secrets import get_pg_password
    password = get_pg_password()  # 5분 cache, miss 시 SSM fetch

design:
- fail-closed (SSM error 시 raise — DB password 없으면 connection 의미 없음).
  feature_flag.py 와 다름 — flag 는 fail-open (admin 명시 disable 만 차단), 여기는
  fail-closed (붙을 수 없는데 거짓 enabled 로 진행하면 더 위험).
- 5분 TTL — feature_flag.py 와 일관. 향후 SSM rotation 적용 시 자동 반영.
- KMS Decrypt 권한 필요 (IAM role 에 ssm:GetParameter + kms:Decrypt for SSM ViaService).
- v1/v2/admin Lambda 모두 import 가능 (boto3 만 의존). zip root 기준 import:
  `from common.secrets import get_pg_password` — `backend.common.*` 아님.
"""
import os
import time
from typing import Optional

import boto3

_REGION = os.environ.get("AWS_REGION", "us-east-1")
_TTL_SECONDS = 300  # 5분 — feature_flag 와 일치

# 모듈 레벨 cache: {param_name: (value: str, fetched_at: float)}
_cache: dict = {}
_ssm = None


def _get_client():
    global _ssm
    if _ssm is None:
        _ssm = boto3.client("ssm", region_name=_REGION)
    return _ssm


def get_secret(param_name: str) -> str:
    """SSM SecureString 조회. 5분 TTL cache. 실패 시 raise (fail-closed)."""
    now = time.time()
    cached = _cache.get(param_name)
    if cached and (now - cached[1]) < _TTL_SECONDS:
        return cached[0]

    response = _get_client().get_parameter(Name=param_name, WithDecryption=True)
    value = response["Parameter"]["Value"]
    _cache[param_name] = (value, now)
    return value


def get_pg_password() -> str:
    """v2 Postgres master password 조회. env var PG_PASSWORD_SSM_PARAM 으로 path 지정.

    Default path: /sedaily-mbti/v2/pg-password (Admin-2c 신설).
    """
    param_name = os.environ.get("PG_PASSWORD_SSM_PARAM", "/sedaily-mbti/v2/pg-password")
    return get_secret(param_name)


def invalidate(param_name: Optional[str] = None) -> None:
    """수동 cache invalidate (테스트 / 즉시 반영 강제용)."""
    if param_name is None:
        _cache.clear()
    else:
        _cache.pop(param_name, None)
