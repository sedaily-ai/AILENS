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

from boto3.dynamodb.conditions import Key

from shared.ddb_client import posts_table
from shared.slug import slugify

_VALID_STATUS = ("draft", "published", "archived")

# update() 가 건드릴 수 있는 필드. status/published_at 은 set_status() 전담.
# media_embed_url(2026-08-16): 유튜브 등 웹 링크. 원래 letters 채널 글에
# 붙이는 용도로 만들었는데, 실제로는 channels:["home_player"] 전용 콘텐츠
# (관리자가 기사와 무관하게 직접 만드는 "제목+링크" 재생목록 항목,
# admin/frontend home-player 화면)의 핵심 필드로 쓰인다.
# display_order(2026-08-16): home_player 항목의 재생 순서(오름차순) — 다른
# 채널은 안 쓰지만 필드를 채널별로 나누지 않고 공용 스키마에 얹는 기존
# 패턴(source_url 등)을 그대로 따른다.
_UPDATABLE = (
    "channels", "publish_date", "editor_id",
    "headline", "subtitle", "closing_line", "body_inline", "cover_image_url",
    "source_url", "media_embed_url", "display_order",
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
        "channel": item.get("channel"),
        "publish_date": item["publish_date"],
        "editor_id": item.get("editor_id"),
        "headline": item.get("headline", ""),
        "subtitle": item.get("subtitle"),
        "closing_line": item.get("closing_line"),
        "body_inline": item.get("body_inline") or {},
        "cover_image_url": item.get("cover_image_url") or "",
        # 원문 기사 URL — 서울경제 원본 취재 기사로 되돌아가는 링크. 콘텐츠가
        # "취재된 원본을 바탕으로 AI가 재구성"한다는 걸 실제로 검증 가능하게
        # 만든다(2026-08-13, SEO/GEO/AEO 감사 — 신뢰 신호 없이 그 주장만
        # JSON-LD에 있던 문제). admin이 채널 상관없이 자유롭게 채운다.
        "source_url": item.get("source_url") or "",
        "media_embed_url": item.get("media_embed_url"),
        "display_order": item.get("display_order"),
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


def _primary_channel(channels: list | None) -> str | None:
    """channels[0] — 공개 목록 GSI(channel-publish_date-index, 2026-09-07,
    사이트 전역 응답 지연 조사)의 파티션키로 쓰는 스칼라 값. `channels`는
    배열이지만 실측(발행분 500건 샘플) 결과 글 하나가 둘 이상의 채널에
    동시에 속하는 경우가 0건이라, 이 단순화가 안전하다 — 여러 채널에
    걸치는 글이 실제로 생기면 그때 재설계(예: 채널별로 별도 GSI 항목을
    두는 얕은 복제 아이템 패턴)가 필요하다."""
    return (channels or [None])[0]


def create(data: dict, created_by: str) -> dict:
    slug = data.get("slug") or _unique_slug(
        data["publish_date"], data.get("headline", "")
    )
    now = _now_iso()
    channels = data.get("channels") or []
    item = {
        "id": str(uuid.uuid4()),
        "slug": slug,
        "status": "draft",
        "channels": channels,
        # channel(스칼라, 2026-09-07) — service/backend의 공개 목록 조회가
        # "발행된 글 전체를 읽은 뒤 Python에서 채널 필터링" 하던 걸
        # DynamoDB GSI로 직접 채널만 걸러 읽도록 바꾸는 마이그레이션의
        # 쓰기 측 절반. clients/cms_posts_ddb_client.py 주석 참조.
        "channel": _primary_channel(channels),
        "publish_date": data["publish_date"],
        "editor_id": data.get("editor_id") or None,
        "headline": data.get("headline", ""),
        "subtitle": data.get("subtitle"),
        "closing_line": data.get("closing_line"),
        "body_inline": data.get("body_inline") or {},
        "cover_image_url": data.get("cover_image_url"),
        "source_url": data.get("source_url"),
        "media_embed_url": data.get("media_embed_url"),
        "display_order": data.get("display_order"),
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
        # status 미지정 — 전체 조회(드문 어드민 케이스).
        # Scan/Query 는 1MB 를 넘으면 LastEvaluatedKey 로 다음 페이지를 알려준다 —
        # 이걸 안 따라가면 리치텍스트 본문(body_inline.body_html)이 큰 글이
        # 많아질수록 뒷페이지 글이 "DB엔 있는데 목록엔 안 보이는" 상태로
        # 조용히 잘려나간다(2026-08-08, 실제로 발행된 글이 admin 목록에
        # 안 보이는 리포트로 발견 — Scan 이 첫 페이지만 읽고 있었다).
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
    if "channels" in data:
        # channel 스칼라(2026-09-07 GSI 마이그레이션)를 channels 배열과
        # 항상 같이 갱신 — create()의 _primary_channel() 참조.
        current_item["channel"] = _primary_channel(current_item.get("channels"))
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
