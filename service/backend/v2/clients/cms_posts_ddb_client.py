"""cms_posts 공개 조회 전용 DynamoDB 클라이언트 (읽기만).

admin/repo/posts_repo.py 와 같은 테이블(sedaily-mbti-cms-posts-dev)을 보지만,
admin/ 과 v2/ 는 별도 Lambda 패키지라 서로 import 할 수 없다 — 그래서 읽기 전용
버전을 여기 따로 둔다. 스키마를 바꾸면 두 곳(admin/repo/posts_repo.py 도) 다 고친다.

2026-08-04: pgvector RDS(sedaily-mbti-pgvector-v2-dev) 삭제에 따라 신규 작성.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import boto3
from boto3.dynamodb.conditions import Key

_TABLE_NAME = os.environ.get("CMS_POSTS_TABLE", "sedaily-mbti-cms-posts-dev")
_REGION = os.environ.get("AWS_REGION", "us-east-1")
_resource = boto3.resource("dynamodb", region_name=_REGION)


def _table():
    return _resource.Table(_TABLE_NAME)


def list_published_posts(
    channel: str, date: Optional[str], limit: int = 20
) -> List[Dict[str, Any]]:
    """발행된 CMS 글. 삭제분(deleted_at)과 초안은 제외한다."""
    resp = _table().query(
        IndexName="status-publish_date-index",
        KeyConditionExpression=Key("status").eq("published"),
        ScanIndexForward=False,
    )
    items = [i for i in resp.get("Items", []) if not i.get("deleted_at")]
    items = [i for i in items if channel in (i.get("channels") or [])]
    if date:
        items = [i for i in items if i.get("publish_date") == date]
    items.sort(
        key=lambda i: (i.get("publish_date", ""), i.get("published_at") or ""),
        reverse=True,
    )
    return items[:limit]


def get_published_post_by_slug(slug: str) -> Optional[Dict[str, Any]]:
    resp = _table().query(
        IndexName="slug-index",
        KeyConditionExpression=Key("slug").eq(slug),
    )
    items = resp.get("Items", [])
    if not items:
        return None
    item = items[0]
    if item.get("status") != "published" or item.get("deleted_at"):
        return None
    return item
