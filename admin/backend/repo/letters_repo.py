"""daily_letters DynamoDB 전담 — AI 레터 편집 (CMS spec §5.3).

파이프라인이 쓰는 테이블이라 수정 범위를 좁게 잡는다. editor_id / letter_date /
article_id 는 레터의 정체성이라 편집 대상에서 제외한다 — _UPDATABLE 에 없으므로
자동으로 무시된다.

2026-08: MBTI 페르소나 개념 폐기로 하루 4편(그룹별) 대신 1편만 생성되는 방향으로
파이프라인이 바뀐다. mbti_group 필드는 admin 프론트를 포함해 더 이상 아무도
읽지 않아 serialization 에서 제거했다 (기존 DDB row 에 값이 남아 있어도 무해하게
무시된다). 그 값에 따라 동작을 분기하던 정렬 로직(4그룹 고정 순서)도 이미
제거해서 created_at 순으로 정렬한다.

2026-08-04: pgvector RDS(sedaily-mbti-pgvector-v2-dev) 삭제에 따라 SQL 버전을
DynamoDB(sedaily-mbti-daily-letters-dev)로 재구축. cms_posts 마이그레이션과
같은 패턴(admin/repo/posts_repo.py 참조).

발행 글 공개 조회(today-letters API)는 여기 두지 않는다 — admin 과 v2 는 별도
Lambda 패키지라 이 모듈을 import 할 수 없다. 읽기 전용 버전을
v2/clients/daily_letters_ddb_client.py 에 따로 둔다. 스키마를 바꾸면 두 곳 다 고친다.

레터 row 자체의 생성(insert)은 여기 없다 — Editor Pick 파이프라인 전담이고,
그 쪽은 이번 마이그레이션 범위 밖이다(articles 후보 테이블이 아직 복구 안 됨).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from boto3.dynamodb.conditions import Key

from shared.ddb_client import letters_table

# 편집 허용 필드만 — 정체성 필드(editor_id/letter_date/article_id)는 제외.
# podcast_audio_url: article_id 기반 자동 생성이 안 되는 레터(빈 article_id 등)를
# 위한 수동 업로드 경로 — admin/routes/media.py 프리사인 업로드로 받은 URL을 그대로 저장.
_UPDATABLE = ("headline", "subtitle", "closing_line", "body_inline", "keywords", "podcast_audio_url")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_dict(item: dict) -> dict:
    return {
        "id": item["id"],
        "letter_date": item["letter_date"],
        "editor_id": item.get("editor_id"),
        "headline": item.get("headline", ""),
        "subtitle": item.get("subtitle"),
        "closing_line": item.get("closing_line"),
        "body_inline": item.get("body_inline") or {},
        "keywords": item.get("keywords") or [],
        "mode": item.get("mode"),
        "created_at": item.get("created_at"),
        "podcast_audio_url": item.get("podcast_audio_url"),
    }


def list_by_date(date: str) -> list[dict]:
    resp = letters_table().query(
        IndexName="letter_date-index",
        KeyConditionExpression=Key("letter_date").eq(date),
    )
    items = [i for i in resp.get("Items", []) if not i.get("deleted_at")]
    items.sort(key=lambda i: i.get("created_at") or "")
    return [_to_dict(i) for i in items]


def get(letter_id: str) -> dict | None:
    resp = letters_table().get_item(Key={"id": letter_id})
    item = resp.get("Item")
    if not item or item.get("deleted_at"):
        return None
    return _to_dict(item)


def update(letter_id: str, data: dict) -> dict | None:
    """부분 수정 — 허용 필드 중 data 에 있는 것만 바꾼다."""
    item = letters_table().get_item(Key={"id": letter_id}).get("Item")
    if not item or item.get("deleted_at"):
        return None

    for key in _UPDATABLE:
        if key in data:
            item[key] = data[key]
    item["updated_at"] = _now_iso()

    letters_table().put_item(Item=item)
    return _to_dict(item)


def soft_delete(letter_id: str) -> bool:
    item = letters_table().get_item(Key={"id": letter_id}).get("Item")
    if not item or item.get("deleted_at"):
        return False
    item["deleted_at"] = _now_iso()
    item["updated_at"] = _now_iso()
    letters_table().put_item(Item=item)
    return True
