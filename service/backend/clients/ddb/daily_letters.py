"""daily_letters 공개 조회 전용 DynamoDB 클라이언트 (읽기 전용).

admin/repo/letters_repo.py 와 동일한 테이블(sedaily-mbti-daily-letters-dev)을 조회한다.
admin 과 v2 는 별도 Lambda 패키지여서 서로 import 할 수 없으므로 읽기 전용 구현을
별도로 두며, 스키마 변경 시 양쪽을 함께 수정해야 한다.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List

import boto3
from boto3.dynamodb.conditions import Key

from clients.ddb.dynamodb import drain_query

_TABLE_NAME = os.environ.get("DAILY_LETTERS_TABLE", "sedaily-mbti-daily-letters-dev")
_REGION = os.environ.get("AWS_REGION", "us-east-1")
_resource = boto3.resource("dynamodb", region_name=_REGION)

def _table():
    return _resource.Table(_TABLE_NAME)


def get_daily_letters(letter_date: str) -> List[Dict[str, Any]]:
    """해당 일자의 letter 행을 created_at 오름차순으로 반환한다(letters_repo.list_by_date 와 동일 정렬)."""
    # 1MB 페이지 한도를 넘는 날에도 누락되지 않도록 drain_query 로 전 페이지를 수집한다.
    kwargs: Dict[str, Any] = {
        "IndexName": "letter_date-index",
        "KeyConditionExpression": Key("letter_date").eq(letter_date),
    }
    items = drain_query(_table(), **kwargs)
    items = [i for i in items if not i.get("deleted_at")]
    items.sort(key=lambda i: i.get("created_at", ""))
    return items
