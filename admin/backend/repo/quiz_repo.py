"""quiz_questions DynamoDB 전담 (posts_repo.py와 같은 구조).

라우트 계층은 DynamoDB를 모른다. 여기서만 테이블을 안다.

공개 읽기(홈 화면 "오늘의 단어 퀴즈")는 여기 두지 않는다 — 공개 API는 admin이
아니라 별도 Lambda(sedaily-mbti-v2-quiz-dev)라 이 모듈을 import 할 수 없다.
같은 테이블을 보는 읽기 전용 버전을
service/backend/clients/quiz_questions_ddb_client.py에 따로 둔다. 스키마를
바꾸면 두 곳 다 고친다.

posts_repo.py와 달리 slug/고유성 처리가 없다 — 퀴즈는 term 하나만 있는 훨씬
가벼운 콘텐츠라 스캔 기반 중복 검사가 필요 없다(2026-08-09, "위젯 구조 그대로
안 가져와도 된다, 단순한 형태로" 요청).

2026-08-09 — options(오답 3개) 추가. 처음엔 저장 안 하고 화면에서 다른 용어
풀 중에 그때그때 뽑게 했는데, 실제로 써보니 서로 무관한 용어가 오답으로
섞여서("보기가 없어서요" — 관리자가 오답을 직접 못 고르는 문제로 지적됨)
학습 효과가 떨어졌다. 관리자가 오답 3개를 직접 쓰게 한다.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key

from shared.ddb_client import quiz_questions_table

_VALID_STATUS = ("draft", "published")

_UPDATABLE = ("term", "explain", "publish_date", "options")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_dict(item: dict) -> dict:
    return {
        "id": item["id"],
        "term": item.get("term", ""),
        "explain": item.get("explain", ""),
        "options": list(item.get("options") or []),
        "status": item["status"],
        "publish_date": item.get("publish_date"),
        "created_by": item.get("created_by"),
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
        "published_at": item.get("published_at"),
    }


def create(data: dict, created_by: str) -> dict:
    now = _now_iso()
    item = {
        "id": str(uuid.uuid4()),
        "term": data.get("term", ""),
        "explain": data.get("explain", ""),
        "options": data.get("options") or [],
        "status": "draft",
        "publish_date": data.get("publish_date"),
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
        "published_at": None,
    }
    quiz_questions_table().put_item(Item=item)
    return _to_dict(item)


def get(quiz_id: str) -> dict | None:
    resp = quiz_questions_table().get_item(Key={"id": quiz_id})
    item = resp.get("Item")
    if not item or item.get("deleted_at"):
        return None
    return _to_dict(item)


def list_quiz(status: str | None, limit: int = 50) -> list[dict]:
    table = quiz_questions_table()
    if status:
        items = []
        kwargs: dict = {
            "IndexName": "status-publish_date-index",
            "KeyConditionExpression": Key("status").eq(status),
            "ScanIndexForward": False,  # publish_date DESC
        }
        while True:
            resp = table.query(**kwargs)
            items.extend(resp.get("Items", []))
            last_key = resp.get("LastEvaluatedKey")
            if not last_key:
                break
            kwargs["ExclusiveStartKey"] = last_key
    else:
        items = []
        scan_kwargs: dict = {}
        while True:
            resp = table.scan(**scan_kwargs)
            items.extend(resp.get("Items", []))
            last_key = resp.get("LastEvaluatedKey")
            if not last_key:
                break
            scan_kwargs["ExclusiveStartKey"] = last_key

    items = [i for i in items if not i.get("deleted_at")]
    items.sort(
        key=lambda i: (i.get("publish_date") or "", i.get("created_at") or ""),
        reverse=True,
    )
    return [_to_dict(i) for i in items[:limit]]


def update(quiz_id: str, data: dict) -> dict | None:
    """부분 수정 — posts_repo.update()와 같은 계약(있는 키만 덮어쓴다)."""
    current_item = quiz_questions_table().get_item(Key={"id": quiz_id}).get("Item")
    if not current_item or current_item.get("deleted_at"):
        return None

    for key in _UPDATABLE:
        if key in data:
            current_item[key] = data[key] if data[key] is not None else None
    current_item["updated_at"] = _now_iso()

    quiz_questions_table().put_item(Item=current_item)
    return _to_dict(current_item)


def set_status(quiz_id: str, status: str) -> dict | None:
    if status not in _VALID_STATUS:
        raise ValueError(f"invalid status: {status}")

    item = quiz_questions_table().get_item(Key={"id": quiz_id}).get("Item")
    if not item or item.get("deleted_at"):
        return None

    item["status"] = status
    if status == "published" and not item.get("published_at"):
        item["published_at"] = _now_iso()
    item["updated_at"] = _now_iso()

    quiz_questions_table().put_item(Item=item)
    return _to_dict(item)


def soft_delete(quiz_id: str) -> bool:
    item = quiz_questions_table().get_item(Key={"id": quiz_id}).get("Item")
    if not item or item.get("deleted_at"):
        return False
    item["deleted_at"] = _now_iso()
    item["updated_at"] = _now_iso()
    quiz_questions_table().put_item(Item=item)
    return True
