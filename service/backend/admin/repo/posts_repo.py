"""cms_posts DynamoDB 전담 (CMS spec §5.1).

라우트 계층은 DynamoDB 를 모른다. 여기서만 테이블을 안다.

2026-08-04: pgvector RDS(sedaily-mbti-pgvector-v2-dev) 삭제에 따라 SQL 버전을
DynamoDB(sedaily-mbti-cms-posts-dev)로 재구축. 테이블 설계는
docs/worklog/2026-08/2026-08-04-transform-pipeline-decommission.md 참조.

발행분 조회(공개 API용)는 여기 두지 않는다 — 공개 API 는 admin 이 아니라 v2 패키징에서
도는 별도 Lambda 라 이 모듈을 import 할 수 없다. 같은 테이블을 보는 읽기 전용 버전을
v2/clients/cms_posts_ddb_client.py 에 따로 둔다. 스키마를 바꾸면 두 곳 다 고친다.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from boto3.dynamodb.conditions import Key

from shared.ddb_client import posts_table
from shared.slug import slugify

_VALID_STATUS = ("draft", "published", "archived")

# update() 가 건드릴 수 있는 필드. status/published_at 은 set_status() 전담.
_UPDATABLE = (
    "channels", "publish_date", "mbti_group", "editor_id",
    "headline", "subtitle", "closing_line", "body_inline", "cover_image_url",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_dict(item: dict) -> dict:
    """저장 item -> API 응답 모양. 필드명을 storage 와 1:1 로 맞춰서 update()/
    set_status() 가 get() 결과를 그대로 다시 put_item 할 수 있게 한다."""
    return {
        "id": item["id"],
        "slug": item["slug"],
        "status": item["status"],
        "channels": list(item.get("channels") or []),
        "publish_date": item["publish_date"],
        "mbti_group": item.get("mbti_group"),
        "editor_id": item.get("editor_id"),
        "headline": item.get("headline", ""),
        "subtitle": item.get("subtitle"),
        "closing_line": item.get("closing_line"),
        "body_inline": item.get("body_inline") or {},
        "cover_image_url": item.get("cover_image_url") or "",
        "created_by": item.get("created_by"),
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
        "published_at": item.get("published_at"),
    }


def _unique_slug(publish_date: str, headline: str) -> str:
    """기존 slug 와 충돌하면 -2, -3 을 붙인다 (spec §5.1.2).

    slug-index GSI 는 정확매치 Query 만 지원해서 접두어 충돌 후보까지 보려면
    Scan 이 필요하다. CMS 글은 수동 작성이라 볼륨이 작으므로(수십~수백 건)
    Scan 비용은 무시할 만하다.
    """
    base = slugify(publish_date, headline)
    resp = posts_table().scan(
        FilterExpression="begins_with(slug, :base)",
        ExpressionAttributeValues={":base": base},
        ProjectionExpression="slug",
    )
    existing = {i["slug"] for i in resp.get("Items", [])}
    if base not in existing:
        return base
    n = 2
    while f"{base}-{n}" in existing:
        n += 1
    return f"{base}-{n}"


def create(data: dict, created_by: str) -> dict:
    slug = data.get("slug") or _unique_slug(
        data["publish_date"], data.get("headline", "")
    )
    now = _now_iso()
    item = {
        "id": str(uuid.uuid4()),
        "slug": slug,
        "status": "draft",
        "channels": data.get("channels") or [],
        "publish_date": data["publish_date"],
        "mbti_group": data.get("mbti_group") or None,
        "editor_id": data.get("editor_id") or None,
        "headline": data.get("headline", ""),
        "subtitle": data.get("subtitle"),
        "closing_line": data.get("closing_line"),
        "body_inline": data.get("body_inline") or {},
        "cover_image_url": data.get("cover_image_url"),
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
        "published_at": None,
    }
    posts_table().put_item(Item=item)
    return _to_dict(item)


def get(post_id: str) -> dict | None:
    resp = posts_table().get_item(Key={"id": post_id})
    item = resp.get("Item")
    if not item or item.get("deleted_at"):
        return None
    return _to_dict(item)


def list_posts(
    status: str | None,
    channel: str | None,
    limit: int = 50,
    date: str | None = None,
) -> list[dict]:
    table = posts_table()
    if status:
        resp = table.query(
            IndexName="status-publish_date-index",
            KeyConditionExpression=Key("status").eq(status),
            ScanIndexForward=False,  # publish_date DESC
        )
        items = resp.get("Items", [])
    else:
        # status 미지정 — 전체 조회(드문 어드민 케이스). 볼륨이 작아 Scan 으로 처리.
        items = table.scan().get("Items", [])

    items = [i for i in items if not i.get("deleted_at")]
    if channel:
        items = [i for i in items if channel in (i.get("channels") or [])]
    if date:
        items = [i for i in items if i.get("publish_date") == date]
    items.sort(
        key=lambda i: (i.get("publish_date", ""), i.get("created_at", "")),
        reverse=True,
    )
    return [_to_dict(i) for i in items[:limit]]


def update(post_id: str, data: dict) -> dict | None:
    """부분 수정 — data 에 있는 키만 바꾼다. 없는 키는 손대지 않는다.

    명시적으로 null 을 보내면 그 필드는 실제로 비워진다 (SQL 버전과 동일 동작,
    2026-07-28 스모크에서 부분 수정 시 누락 필드가 날아가는 사고가 있어서 이 계약을
    유지한다 — data 에 '있는' 키만 덮어쓰고 '없는' 키는 절대 건드리지 않는다).
    """
    current_item = posts_table().get_item(Key={"id": post_id}).get("Item")
    if not current_item or current_item.get("deleted_at"):
        return None

    for key in _UPDATABLE:
        if key in data:
            current_item[key] = data[key] if data[key] is not None else None
    current_item["updated_at"] = _now_iso()

    posts_table().put_item(Item=current_item)
    return _to_dict(current_item)


def set_status(post_id: str, status: str) -> dict | None:
    if status not in _VALID_STATUS:
        raise ValueError(f"invalid status: {status}")

    item = posts_table().get_item(Key={"id": post_id}).get("Item")
    if not item or item.get("deleted_at"):
        return None

    item["status"] = status
    if status == "published" and not item.get("published_at"):
        item["published_at"] = _now_iso()
    item["updated_at"] = _now_iso()

    posts_table().put_item(Item=item)
    return _to_dict(item)


def soft_delete(post_id: str) -> bool:
    item = posts_table().get_item(Key={"id": post_id}).get("Item")
    if not item or item.get("deleted_at"):
        return False
    item["deleted_at"] = _now_iso()
    item["updated_at"] = _now_iso()
    posts_table().put_item(Item=item)
    return True
