"""newsletter_subscribers DynamoDB 전담 — 통계 대시보드(newsletter.py) 읽기 전용.

구독 자체(생성/해지)는 이 admin 패키지가 아니라 service/backend 의
handlers/subscribe.py 가 담당한다 — 같은 테이블(SUBSCRIBERS_TABLE)을 별도 Lambda
패키지에서 읽기만 한다. 쓰기 경로가 필요해지면 여기 추가하지 말고 subscribe.py 쪽에
맞춘다(스키마를 바꾸면 두 곳 다 고친다 — posts_repo.py/letters_repo.py 와 같은 패턴).
"""
from __future__ import annotations

from shared.ddb_client import subscribers_table


def list_all() -> list[dict]:
    """전체 구독자의 email/status/created_at.

    posts_repo.py/letters_repo.py 에서와 같은 이유로 LastEvaluatedKey 를 끝까지
    따라간다 — Scan 결과를 페이지네이션 없이 한 번만 읽으면 뒷페이지 구독자가
    조용히 통계에서 빠진다.
    """
    items: list[dict] = []
    kwargs: dict = {
        "ProjectionExpression": "email, #s, created_at",
        "ExpressionAttributeNames": {"#s": "status"},
    }
    while True:
        resp = subscribers_table().scan(**kwargs)
        items.extend(resp.get("Items", []))
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return items
