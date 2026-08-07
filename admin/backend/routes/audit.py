"""audit log 조회 — DDB CONFIG/AUDIT/<ISO ts> 의 sk descending.

커서는 LastEvaluatedKey 를 JSON → base64 한 값이다. cursor 는 선택 인자이고
next_cursor 는 추가 필드이므로 기존 프런트(limit 만 전송)는 영향받지 않는다.
"""

import base64
import binascii
import json
import logging

from boto3.dynamodb.conditions import Key

from shared import ddb_client, response

logger = logging.getLogger(__name__)

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


def _decode_cursor(raw: str) -> dict:
    """base64-JSON 커서를 ``ExclusiveStartKey`` dict 로 되돌린다.

    dict 인지 확인하는 게 핵심이다. ``"WzEsMl0="`` (``[1,2]``) 처럼 **유효한
    JSON 이지만 dict 가 아닌** 값은 ``json.loads`` 를 통과해 그대로 boto3
    ``ExclusiveStartKey`` 로 넘어가고, 거기서 터져 400 이어야 할 잘못된 입력이
    500 이 된다. 커서는 클라이언트가 주는 값이라 신뢰할 수 없다.
    """
    decoded = json.loads(base64.urlsafe_b64decode(raw.encode()).decode())
    if not isinstance(decoded, dict):
        raise ValueError(f"cursor must decode to an object, got {type(decoded).__name__}")
    return decoded


def _encode_cursor(key: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(key).encode()).decode()


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    params = query_params or {}

    raw_limit = params.get("limit", str(DEFAULT_LIMIT))
    try:
        limit = int(raw_limit)
    except ValueError:
        return response.err("limit must be integer", 400)
    limit = max(1, min(limit, MAX_LIMIT))

    kwargs: dict = {
        "KeyConditionExpression": Key("pk").eq("AUDIT"),
        "Limit": limit,
        "ScanIndexForward": False,
    }

    raw_cursor = params.get("cursor")
    if raw_cursor:
        try:
            kwargs["ExclusiveStartKey"] = _decode_cursor(raw_cursor)
        except (ValueError, binascii.Error, UnicodeDecodeError, json.JSONDecodeError):
            return response.err("invalid cursor", 400)

    resp = ddb_client.config_table().query(**kwargs)
    audits = [
        {
            "ts": item.get("sk"),
            "action": item.get("action"),
            "detail": item.get("detail"),
            "actor": item.get("actor"),
            "session": item.get("session"),
            "source_ip": item.get("source_ip"),
        }
        for item in resp.get("Items", [])
    ]
    last_key = resp.get("LastEvaluatedKey")
    return response.ok({
        "audits": audits,
        "count": len(audits),
        "next_cursor": _encode_cursor(last_key) if last_key else None,
    })
