"""AWS Secrets Manager fetch + 5분 TTL 모듈 레벨 cache.

ssm_client.py(SecureString)와 같은 패턴 — 이쪽은 Secrets Manager 전용.
콜드 스타트마다 새로 fetch, warm Lambda는 TTL 안에서 재사용.
"""

import json
import os
import time

import boto3

REGION = os.environ.get("AWS_REGION", "us-east-1")
TTL_SECONDS = 300

_client = boto3.client("secretsmanager", region_name=REGION)
_cache: dict[str, tuple[str, float]] = {}


def get_secret(secret_id: str, *, force_refresh: bool = False) -> str:
    """SecretString 원본(문자열) fetch. TTL 안에 동일 id 재호출 시 cache hit."""
    now = time.time()
    if not force_refresh and secret_id in _cache:
        value, fetched_at = _cache[secret_id]
        if now - fetched_at < TTL_SECONDS:
            return value

    resp = _client.get_secret_value(SecretId=secret_id)
    value = resp["SecretString"]
    _cache[secret_id] = (value, now)
    return value


def get_secret_json_field(secret_id: str, field: str, *, force_refresh: bool = False) -> str:
    """SecretString이 JSON 객체일 때 특정 필드만 뽑는다.

    예: sedaily-mbti/openai-api-key → {"OPENAI_API_KEY": "sk-..."}
        get_secret_json_field("sedaily-mbti/openai-api-key", "OPENAI_API_KEY")
    """
    raw = get_secret(secret_id, force_refresh=force_refresh)
    parsed = json.loads(raw)
    return parsed[field]
