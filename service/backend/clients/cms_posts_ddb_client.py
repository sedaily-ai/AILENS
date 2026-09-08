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
from boto3.dynamodb.conditions import Attr, Key

from clients.dynamodb_client import drain_query

_TABLE_NAME = os.environ.get("CMS_POSTS_TABLE", "sedaily-mbti-cms-posts-dev")
_REGION = os.environ.get("AWS_REGION", "us-east-1")
_resource = boto3.resource("dynamodb", region_name=_REGION)

# "legacy" | "channel" — 2026-09-07, 사이트 전역 응답 지연 조사로 신설한
# channel-publish_date-index 로의 컷오버 스위치. Lambda 환경변수 하나로
# 즉시 롤백 가능하게 하려고 코드 배포와 실제 전환을 분리한다 — 이 값을
# "channel"로 바꾸기 전에 반드시:
#   1) admin/backend/infrastructure/create-channel-index.sh 로 GSI 생성,
#      ACTIVE 될 때까지 대기
#   2) admin/backend/infrastructure/backfill_channel_field.py --apply 로
#      기존 아이템 전체에 channel 필드 채움
#   3) 채널별 건수를 legacy 경로 결과와 대조 검증
# 이 순서를 안 지키고 전환하면 channel 필드가 없는(백필 전) 아이템이
# 신규 GSI에서 조용히 빠져 공개 목록에서 사라진다 — 롤백은 이 값을
# "legacy"로 되돌리는 즉시(코드 재배포 불필요, Lambda 콘솔/CLI 환경변수
# 변경만으로 적용).
_LIST_INDEX_MODE = os.environ.get("CMS_LIST_INDEX_MODE", "legacy")


def _table():
    return _resource.Table(_TABLE_NAME)


def _list_published_posts_legacy(
    channel: str, date: Optional[str], limit: int
) -> List[Dict[str, Any]]:
    """옛 경로 — status 하나로 발행된 글 "전체"를 읽은 뒤 Python에서
    channel/date 로 걸러낸다. 콘텐츠가 쌓일수록 매 요청이 느려지는 원인이
    됐다(2026-09-07 실측: channel=lens 조회 9.8초, 발행글 3,531건 전체
    스캔) — _list_published_posts_by_channel()로 대체 예정, 컷오버 전까지
    안전망으로 유지."""
    # Query 결과가 1MB 를 넘으면 DynamoDB 가 LastEvaluatedKey 로 다음 페이지를
    # 알려준다 — 안 따라가면 발행된 글이 많아질수록(리치텍스트 본문이 큰 글
    # 포함) 뒷페이지 글이 조용히 잘려나간다(2026-08-08, admin/repo/posts_repo.py
    # 와 동일 버그를 여기서도 발견 — 공개 사이트 목록에 영향).
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
    """새 경로(2026-09-07) — channel-publish_date-index 로 그 채널 아이템만
    읽는다. DynamoDB가 status/deleted_at 을 몰라 FilterExpression 으로
    거르지만, 이건 이미 channel 로 좁혀진(전체가 아니라 그 채널 것만)
    결과에 대한 필터라 legacy 경로의 "먼저 전체를 다 읽는" 비용과는
    질적으로 다르다."""
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

    _LIST_INDEX_MODE 컷오버 스위치는 이 파일 상단 주석 참조."""
    if _LIST_INDEX_MODE == "channel":
        return _list_published_posts_by_channel(channel, date, limit)
    return _list_published_posts_legacy(channel, date, limit)


def get_published_post_by_slug(slug: str, channel: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """channel은 cms_posts_pg_client.py와의 인터페이스 호환을 위한 파라미터다
    (Postgres는 여러 채널이 한 slug로 묶여 포맷 구분이 필요하지만, DynamoDB는
    아이템별로 slug가 이미 고유해 여기서는 의미 없음 — 받기만 하고 무시)."""
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
