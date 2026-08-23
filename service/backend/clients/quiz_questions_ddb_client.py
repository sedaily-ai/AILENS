"""읽기 전용 — sedaily-mbti-quiz-questions-dev 테이블.

관리자(admin/backend/repo/quiz_repo.py)가 쓰기를 담당하고, 여기는 공개
읽기만 한다 — admin과 service가 별도 Lambda 패키지라 서로 import 할 수
없어서(cms_posts_ddb_client.py와 같은 이유). 스키마를 바꾸면 두 곳
(admin/backend/repo/quiz_repo.py, 여기) 다 고칠 것.
"""
import os
from typing import Any, Dict, List

import boto3
from boto3.dynamodb.conditions import Key

# admin 쪽(admin/backend/shared/ddb_client.py)은 이미 QUIZ_QUESTIONS_TABLE
# env override가 가능한데 이 클라이언트만 하드코딩이었다(2026-08-23 코드
# 리팩토링 감사에서 발견) — 같은 env var 이름으로 맞춤.
_TABLE_NAME = os.environ.get("QUIZ_QUESTIONS_TABLE", "sedaily-mbti-quiz-questions-dev")
_dynamodb = boto3.resource("dynamodb", region_name="us-east-1")


def list_published_quizzes(limit: int = 4) -> List[Dict[str, Any]]:
    """status=published 전체(soft-delete 제외) 중 발행일 최신순 최대 limit개.

    2026-08-09 — 원래는 publish_date가 오늘과 정확히 일치하는 것 하나만
    골랐는데("발행일에 맞는 문제 하나"), "여러 개를 동시에 노출하고 싶다,
    발행/내리기 체크만으로 고를 수 있게" 요청으로 바꿨다. status=published가
    이미 그 "체크박스"다 — 관리자가 발행한 건 전부(최대 limit개) 노출되고,
    내리면 바로 빠진다. 날짜 일치 조건은 없앴다(정렬 용도로만 씀).

    status-publish_date-index는 status(HASH)+publish_date(RANGE) — 정확한 날짜
    매치가 아니라 "전체 published"를 원하면 KeyConditionExpression에 publish_date
    조건 없이 status만 걸고, ScanIndexForward=False로 최신 발행일이 먼저 오게 한다.
    """
    table = _dynamodb.Table(_TABLE_NAME)
    items: List[Dict[str, Any]] = []
    kwargs: Dict[str, Any] = {
        "IndexName": "status-publish_date-index",
        "KeyConditionExpression": Key("status").eq("published"),
        "ScanIndexForward": False,
    }
    while len(items) < limit:
        resp = table.query(**kwargs)
        for item in resp.get("Items") or []:
            if not item.get("deleted_at"):
                items.append(item)
                if len(items) >= limit:
                    break
        last_key = resp.get("LastEvaluatedKey")
        if not last_key or len(items) >= limit:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return items
