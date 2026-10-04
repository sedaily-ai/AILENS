"""cms_posts 공개 조회 전용 DynamoDB 클라이언트 (읽기만).

admin/repo/posts_repo.py 와 동일한 테이블(sedaily-mbti-cms-posts-dev)을 조회한다.
admin 과 v2 는 별도 Lambda 패키지여서 서로 import 할 수 없으므로 읽기 전용 구현을
별도로 두며, 스키마 변경 시 양쪽을 함께 수정해야 한다.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import boto3
from boto3.dynamodb.conditions import Attr, Key

from clients.ddb.dynamodb import drain_query

_TABLE_NAME = os.environ.get("CMS_POSTS_TABLE", "sedaily-mbti-cms-posts-dev")
_REGION = os.environ.get("AWS_REGION", "us-east-1")
_resource = boto3.resource("dynamodb", region_name=_REGION)

# 목록 조회 경로 전환 스위치("legacy" | "channel"). Lambda 환경변수로 제어하며,
# 환경변수 변경만으로 즉시 롤백할 수 있다. "channel" 전환 전 선행 조건은 다음과 같다.
#   1) admin/backend/infrastructure/create-channel-index.sh 로 GSI 생성 및 ACTIVE 대기
#   2) admin/backend/infrastructure/backfill_channel_field.py --apply 로 channel 필드 백필
#   3) 채널별 건수를 legacy 경로 결과와 대조
# 백필 전 아이템은 channel-publish_date-index 에서 누락되어 공개 목록에서 사라진다.
_LIST_INDEX_MODE = os.environ.get("CMS_LIST_INDEX_MODE", "legacy")


def _table():
    return _resource.Table(_TABLE_NAME)


def _list_published_posts_legacy(
    channel: str, date: Optional[str], limit: int
) -> List[Dict[str, Any]]:
    """발행 글 전체를 status 인덱스로 읽은 뒤 Python 에서 channel/date 로 필터링한다.

    발행 글 수에 비례해 느려지므로 _list_published_posts_by_channel() 로 대체할 예정이며,
    전환 전까지 안전망으로 유지한다."""
    # 1MB 페이지 한도로 뒷페이지가 누락되지 않도록 drain_query 로 전 페이지를 수집한다.
    kwargs: Dict[str, Any] = {
        "IndexName": "status-publish_date-index",
        "KeyConditionExpression": Key("status").eq("published"),
        "ScanIndexForward": False,
    }
    items = drain_query(_table(), **kwargs)
    items = [i for i in items if not i.get("deleted_at")]
    items = [i for i in items if channel in (i.get("channels") or [])]
    if date:
        items = [i for i in items if i.get("publish_date") == date]
    items.sort(
        key=lambda i: (i.get("publish_date", ""), i.get("published_at") or ""),
        reverse=True,
    )
    return items[:limit]


def _list_published_posts_by_channel(
    channel: str, date: Optional[str], limit: int
) -> List[Dict[str, Any]]:
    """channel-publish_date-index 로 해당 채널 아이템만 조회한다.

    status/deleted_at 은 FilterExpression 으로 거르며, 이미 채널로 좁혀진 결과에만
    적용되므로 legacy 경로의 전체 조회 비용이 발생하지 않는다."""
    filter_expr = Attr("status").eq("published") & Attr("deleted_at").not_exists()
    if date:
        filter_expr = filter_expr & Attr("publish_date").eq(date)
    kwargs: Dict[str, Any] = {
        "IndexName": "channel-publish_date-index",
        "KeyConditionExpression": Key("channel").eq(channel),
        "FilterExpression": filter_expr,
        "ScanIndexForward": False,
    }
    items = drain_query(_table(), **kwargs)
    items.sort(
        key=lambda i: (i.get("publish_date", ""), i.get("published_at") or ""),
        reverse=True,
    )
    return items[:limit]


def list_published_posts(
    channel: str, date: Optional[str], limit: int = 20
) -> List[Dict[str, Any]]:
    """발행된 CMS 글. 삭제분(deleted_at)과 초안은 제외한다.

    조회 경로는 _LIST_INDEX_MODE 로 결정한다(파일 상단 주석 참조)."""
    if _LIST_INDEX_MODE == "channel":
        return _list_published_posts_by_channel(channel, date, limit)
    return _list_published_posts_legacy(channel, date, limit)


def get_published_post_by_slug(slug: str, channel: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """slug 로 발행 글을 조회한다.

    channel 은 Postgres 구현(clients/pg/cms_posts.py)과의 인터페이스 호환용이며,
    DynamoDB 는 slug 가 아이템별로 고유하므로 사용하지 않는다."""
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
