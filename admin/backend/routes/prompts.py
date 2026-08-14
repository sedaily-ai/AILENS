"""prompt CRUD + version history.

DDB schema:
  pk = 'PROMPT#<category>/<name>'
  sk = 'v#<int>' (version row)
     | 'LATEST' (active_version 포인터)

list: scan FilterExpression sk='LATEST' → 13 entries.
get: LATEST 의 active_version → v#N content + 최근 10 version metadata.
update: active_version=N → put v#{N+1} + update LATEST.
        LATEST 가 없으면 v#1 로 새로 만든다(아래 "upsert" 참고).

## content 는 손대지 않는다 (중요)

``content`` 는 ``service/backend/services/prompt_loader.load_prompt()`` 가 읽어
**그대로** Bedrock 에 넘기는 문자열이다 — 챗봇은 Anthropic ``system`` 블록,
질문 생성은 user 메시지 앞부분. 템플릿 치환도, 파싱도 없다. 따라서 content 에는
항상 모델이 읽을 산문만 들어가야 한다. JSON 을 넣으면 그 JSON 이 모델에게 간다.

## sections — 편집기용 구조 (2026-08-14)

관리자 화면은 프롬프트를 설명/구조/지침 3섹션 + 섹션별 첨부로 편집한다. 그
구조를 content 에 섞으면 위 원칙이 깨지므로, **같은 v#N 행의 별도 속성**
``sections_json`` 에 JSON 문자열로 둔다. 읽기 경로(prompt_loader)는 content 만
보기 때문에 추론에는 아무 영향이 없다.

  content       ← 3섹션을 이어붙인 산문 (모델이 읽는 것, 프런트가 조립)
  sections_json ← {description|structure|guidelines: {text, format, attachments…}}
                  (편집기가 되읽어 폼을 복원하는 것)

sections 는 optional 이다 — 없으면(옛 버전, /prompts/edit 의 평문 저장) 편집기가
content 전체를 한 섹션으로 취급해 폴백한다. DDB map 대신 JSON 문자열인 이유는
숫자가 Decimal 로 돌아오는 변환을 피하고 모양을 버전 무관하게 두기 위해서다.

⚠️ 5분 TTL cache (기존 prompt_loader 수정) 는 Admin-3 라운드. 이번은 admin DDB write 만.
"""

import json
import logging

from boto3.dynamodb.conditions import Attr, Key

from shared import audit, ddb_client, response

logger = logging.getLogger(__name__)

_PROMPT_PREFIX = "PROMPT#"

# DDB 아이템 1개 한계는 400KB. content 와 sections_json 이 첨부 본문을 각각
# 담으므로(산문 사본 + 구조 사본) 합계로 재고 여유를 둔다. 한글은 UTF-8 에서
# 3바이트라 글자 수로 재면 3배를 놓친다 — 반드시 인코딩 후 길이로 잰다.
_MAX_PAYLOAD_BYTES = 340 * 1024


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

    payload = {
        "id": f"{category}/{name}",
        "active_content": active_content,
        "active_version": active_version,
        "history": history,
    }

    # sections 는 있을 때만 실어 보낸다 — 옛 버전엔 없고, 그때 편집기는
    # active_content 를 한 섹션으로 열어야 한다. 기존 응답 필드는 그대로 둔다
    # (characterization 테스트가 고정하고 있다).
    sections = _parse_sections(version_item.get("sections_json"), pk, active_version)
    if sections is not None:
        payload["sections"] = sections

    return response.ok(payload)


def _parse_sections(raw, pk: str, version: int):
    """``sections_json`` 문자열 → dict. 깨졌으면 None (편집기가 content 로 폴백)."""
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        logger.warning(f"sections_json parse failed: {pk} v#{version}")
        return None
    return parsed if isinstance(parsed, dict) else None


def handle_update(body: dict, path_params: dict, query_params: dict) -> dict:
    import datetime as dt

    category = (path_params or {}).get("category", "")
    name = (path_params or {}).get("name", "")
    if not category or not name:
        return response.err("category and name required", 400)

    new_content = body.get("content", "")
    if not new_content:
        return response.err("content required", 400)

    # sections 는 optional — 평문만 저장하는 /prompts/edit 경로는 안 보낸다.
    sections = body.get("sections")
    if sections is not None and not isinstance(sections, dict):
        return response.err("sections must be an object", 400)
    sections_json = (
        json.dumps(sections, ensure_ascii=False) if sections is not None else None
    )

    payload_bytes = len(new_content.encode("utf-8"))
    if sections_json:
        payload_bytes += len(sections_json.encode("utf-8"))
    if payload_bytes > _MAX_PAYLOAD_BYTES:
        return response.err(
            f"prompt too large: {payload_bytes} bytes "
            f"(max {_MAX_PAYLOAD_BYTES}) — 첨부를 줄여 주세요",
            400,
        )

    pk = f"{_PROMPT_PREFIX}{category}/{name}"
    table = ddb_client.prompts_table()

    latest_resp = table.get_item(Key={"pk": pk, "sk": "LATEST"})
    latest = latest_resp.get("Item")

    # LATEST 가 없으면 새 프롬프트로 만든다(v#1). 예전엔 404 였는데, 그래서
    # 화면이 참조하는 id(letters/draft 등)를 API 로 만들 수가 없었다 — create
    # 라우트도 없어서 DDB 를 직접 건드려야 부트스트랩이 됐다. update_item 의
    # SET 은 아이템이 없으면 만들어 주므로 LATEST 쓰기는 그대로 두면 된다.
    created = latest is None
    prev_version = 0 if created else int(latest.get("active_version", 0))
    new_version = prev_version + 1

    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    version_item = {
        "pk": pk,
        "sk": f"v#{new_version}",
        "content": new_content,
        "created_at": now,
        "actor": "admin",
    }
    if sections_json:
        version_item["sections_json"] = sections_json

    table.put_item(Item=version_item)
    table.update_item(
        Key={"pk": pk, "sk": "LATEST"},
        UpdateExpression="SET active_version = :v, updated_at = :u",
        ExpressionAttributeValues={":v": new_version, ":u": now},
    )

    audit.log("prompt-update", {
        "prompt": f"{category}/{name}",
        "new_version": new_version,
        "prev_version": prev_version,
        "created": created,
        "has_sections": sections_json is not None,
        "bytes": payload_bytes,
    })
    return response.ok({
        "ok": True,
        "new_version": new_version,
        "created": created,
    })
