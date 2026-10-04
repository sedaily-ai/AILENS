"""daily_letters 공개 조회 전용 DynamoDB 클라이언트 (읽기만).

admin/repo/letters_repo.py 와 같은 테이블(sedaily-mbti-daily-letters-dev)을 보지만,
admin/ 과 v2/ 는 별도 Lambda 패키지라 서로 import 할 수 없다 — 그래서 읽기 전용
버전을 여기 따로 둔다. 스키마를 바꾸면 두 곳 다 고친다.

2026-08-04: pgvector RDS(sedaily-mbti-pgvector-v2-dev) 삭제에 따라 신규 작성.
cms_posts_ddb_client.py 와 같은 패턴.

Editor Pick 쓰기 경로(insert)는 이번 마이그레이션 범위 밖 — articles 후보
테이블이 아직 복구 안 돼서 자동 생성 자체가 막혀 있다. 여기 있는 건 today-letters
공개 API 가 쓰는 읽기 전용 함수뿐이다.
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
    """Today Letters API 의 read 경로. 그날의 letter row (created_at 순 — MBTI 페르소나
    폐지 이후 4-persona 고정 순서는 더 이상 없다. admin/repo/letters_repo.py 의
    list_by_date 와 같은 정렬 기준으로 맞춘다)."""
    # admin/repo/letters_repo.py:list_by_date 와 동일한 페이지네이션 루프
    # (2026-08-09 이식) — 안 따라가면 하루치 레터가 1MB 페이지 한도를 넘는
    # 날에 뒷부분이 조용히 잘린다.
    kwargs: Dict[str, Any] = {
        "IndexName": "letter_date-index",
        "KeyConditionExpression": Key("letter_date").eq(letter_date),
    }
    items = drain_query(_table(), **kwargs)
    items = [i for i in items if not i.get("deleted_at")]
    items.sort(key=lambda i: i.get("created_at", ""))
    return items
