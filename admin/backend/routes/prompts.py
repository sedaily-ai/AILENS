"""prompt CRUD + version history.

DDB schema:
  pk = 'PROMPT#<category>/<name>'
  sk = 'v#<int>' (version row)
     | 'LATEST' (active_version 포인터)

list: scan FilterExpression sk='LATEST' → 13 entries.
get: LATEST 의 active_version → v#N content + 최근 10 version metadata.
update: active_version=N → put v#{N+1} + update LATEST.

⚠️ 5분 TTL cache (기존 prompt_loader 수정) 는 Admin-3 라운드. 이번은 admin DDB write 만.
"""

import logging

from boto3.dynamodb.conditions import Attr, Key

from shared import audit, ddb_client, response

logger = logging.getLogger(__name__)

_PROMPT_PREFIX = "PROMPT#"


def _strip_prefix(pk: str) -> str:
    if pk.startswith(_PROMPT_PREFIX):
        return pk[len(_PROMPT_PREFIX):]
    return pk


def _version_of(sk: str) -> int:
    """``'v#12'`` → ``12``. 형식이 깨진 행은 0 으로 취급해 뒤로 밀린다."""
    try:
        return int(str(sk).split("#", 1)[1])
    except (IndexError, ValueError):
        return 0


def _load_version_history(table, pk: str, limit: int = 10) -> list:
    """최근 ``limit`` 개 버전 메타데이터를 **버전 번호 내림차순**으로 반환.

    DynamoDB 의 sk 정렬에 의존하면 안 된다. ``sk`` 가 ``'v#<int>'`` 문자열이라
    사전순으로 정렬되므로 ``v#1, v#10, v#11, v#12, v#2, ... v#9`` 순이 된다.
    이전 구현은 ``ScanIndexForward=False, Limit=10`` 으로 DB 가 잘라 주기를
    기대했는데, 버전이 10 을 넘으면 상위 10개가
    ``[9,8,7,6,5,4,3,2,12,11]`` 로 나온다 — **최신인 v#12·v#11 이 목록 끝에
    처박히고 v#10 과 v#1 은 아예 빠진다.**

    고치는 방식으로 sk 를 zero-pad (``v#00012``) 하는 길도 있지만 기존 행
    마이그레이션과 쓰기 경로 변경이 따라온다. 여기서는 **한 프롬프트의 버전을
    모두 읽어 Python 에서 정수로 정렬**한다. 프롬프트당 버전 수는 작아
(현재 전부 v1) 비용이 무의미하고, 기존 데이터를 그대로 쓸 수 있다.

    1MB 페이지 한계를 넘길 만큼 버전이 쌓여도 되도록 ``LastEvaluatedKey`` 를
    따라간다.
    """
    items = []
    kwargs = {
        "KeyConditionExpression": Key("pk").eq(pk) & Key("sk").begins_with("v#"),
        "ProjectionExpression": "sk, created_at, actor",
    }
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        last = resp.get("LastEvaluatedKey")
        if not last:
            break
        kwargs["ExclusiveStartKey"] = last

    items.sort(key=lambda it: _version_of(it.get("sk", "v#0")), reverse=True)
    return [
        {
            "version": _version_of(item.get("sk", "v#0")),
            "created_at": item.get("created_at"),
            "actor": item.get("actor"),
        }
        for item in items[:limit]
    ]


def handle_list(body: dict, path_params: dict, query_params: dict) -> dict:
    table = ddb_client.prompts_table()
    items: list[dict] = []
    last_key = None
    while True:
        kwargs = {"FilterExpression": Attr("sk").eq("LATEST")}
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key
        resp = table.scan(**kwargs)
        items.extend(resp.get("Items", []))
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break

    prompts = [
        {
            "id": _strip_prefix(item.get("pk", "")),
            "active_version": int(item.get("active_version", 0)),
            "updated_at": item.get("updated_at"),
        }
        for item in items
    ]
    prompts.sort(key=lambda p: p["id"])
    return response.ok({"prompts": prompts})


def handle_get(body: dict, path_params: dict, query_params: dict) -> dict:
    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    if not category or not name:
        return response.err("category and name required", 400)

    pk = f"{_PROMPT_PREFIX}{category}/{name}"
    table = ddb_client.prompts_table()

    latest_resp = table.get_item(Key={"pk": pk, "sk": "LATEST"})
    latest = latest_resp.get("Item")
    if not latest:
        return response.err(f"prompt not found: {category}/{name}", 404)
    active_version = int(latest.get("active_version", 0))

    version_resp = table.get_item(Key={"pk": pk, "sk": f"v#{active_version}"})
    version_item = version_resp.get("Item") or {}
    active_content = version_item.get("content", "")

    history = _load_version_history(table, pk, limit=10)

    return response.ok({
        "id": f"{category}/{name}",
        "active_content": active_content,
        "active_version": active_version,
        "history": history,
    })


def handle_update(body: dict, path_params: dict, query_params: dict) -> dict:
    import datetime as dt

    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    if not category or not name:
        return response.err("category and name required", 400)

    new_content = body.get("content", "")
    if not new_content:
        return response.err("content required", 400)

    pk = f"{_PROMPT_PREFIX}{category}/{name}"
    table = ddb_client.prompts_table()

    latest_resp = table.get_item(Key={"pk": pk, "sk": "LATEST"})
    latest = latest_resp.get("Item")
    if not latest:
        return response.err(f"prompt not found: {category}/{name}", 404)
    prev_version = int(latest.get("active_version", 0))
    new_version = prev_version + 1

    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    table.put_item(Item={
        "pk": pk,
        "sk": f"v#{new_version}",
        "content": new_content,
        "created_at": now,
        "actor": "admin",
    })
    table.update_item(
        Key={"pk": pk, "sk": "LATEST"},
        UpdateExpression="SET active_version = :v, updated_at = :u",
        ExpressionAttributeValues={":v": new_version, ":u": now},
    )

    audit.log("prompt-update", {
        "prompt": f"{category}/{name}",
        "new_version": new_version,
        "prev_version": prev_version,
    })
    return response.ok({"ok": True, "new_version": new_version})
