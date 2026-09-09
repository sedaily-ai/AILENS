"""audit log 조회 — PostgreSQL(lens-cms-api) id 내림차순 keyset 페이지네이션.

2026-09-09(v1.27): DynamoDB(CONFIG/AUDIT/<ISO ts> sk descending)에서
전환. 커서는 이제 audit_logs.id(문자열) — base64-JSON이었던 예전 커서
포맷과는 다르지만, 프런트는 이 값을 그대로 되돌려주기만 하는 opaque
토큰으로 다뤄서 포맷 변경이 영향 없다.
"""

import logging

from repo import audit_repo
from shared import response

logger = logging.getLogger(__name__)

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    params = query_params or {}

    raw_limit = params.get("limit", str(DEFAULT_LIMIT))
    try:
        limit = int(raw_limit)
    except ValueError:
        return response.err("limit must be integer", 400)
    limit = max(1, min(limit, MAX_LIMIT))

    cursor = params.get("cursor") or None
    if cursor is not None:
        try:
            int(cursor)
        except ValueError:
            return response.err("invalid cursor", 400)

    audits, next_cursor = audit_repo.list_events(limit, cursor)
    return response.ok({
        "audits": audits,
        "count": len(audits),
        "next_cursor": next_cursor,
    })
