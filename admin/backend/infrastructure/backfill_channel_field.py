"""1회성 백필 — sedaily-mbti-cms-posts-dev 기존 아이템에 `channel` 스칼라
필드를 채운다 (2026-09-07, 사이트 전역 응답 지연 조사).

배경: service/backend의 공개 목록 조회(list_published_posts())가
`status-publish_date-index` GSI로 "발행된 글 전체"를 읽은 뒤 Python에서
channel/date로 필터링하고 있었다 — 콘텐츠가 쌓일수록 매 요청이 느려지는
근본 원인(실측: channel=lens 목록 조회 9.8초, 발행글 3,531건 전체 스캔).
`channel-publish_date-index`(신규 GSI, create-channel-index.sh 참조)로
DynamoDB가 채널 하나만 걸러 읽게 바꾸는 마이그레이션의 절반 — 쓰기
경로는 repo/posts_repo.py::create()/update()가 이미 새 글부터 `channel`을
채우도록 고쳤고(_primary_channel()), 이 스크립트는 그 전에 이미 있던
기존 아이템에 소급 적용한다.

**실행 순서 (반드시 이 순서로):**
1. admin/backend 배포 — posts_repo.py 변경사항 반영, 이후 생성/수정되는
   글은 전부 자동으로 channel을 갖는다.
2. create-channel-index.sh 로 GSI 생성 (또는 이 스크립트를 먼저 돌려도
   무방 — GSI는 이미 있는 속성이든 나중에 추가되는 속성이든 매 write마다
   자동으로 반영되므로 순서가 결과에 영향을 주지 않는다. 다만 GSI가 아직
   없는 상태에서 이 스크립트를 돌리면 그냥 base table만 갱신되고, 나중에
   GSI를 만들면 그 시점의 테이블 상태를 스캔해 자동으로 채워진다).
3. 이 스크립트 실행 — 기존 3,531건 전부에 channel 채움.
4. `aws dynamodb query --index-name channel-publish_date-index ...`로
   채널별 건수가 기존 `status-publish_date-index` 채널 필터링 결과와
   일치하는지 대조 검증.
5. 검증 통과 후에만 service/backend/clients/cms_posts_ddb_client.py의
   list_published_posts()를 새 GSI로 전환 + 배포.

channels가 비어있는 아이템(있다면)은 channel=None으로 남는다 — 그런
아이템은 애초에 어느 채널 목록에도 안 뜨던 것들이라(기존 코드도
`channel in (i.get("channels") or [])`가 항상 False) 동작 변화 없음.

Dry-run 기본값 — 실제로 반영하려면 --apply 를 명시해야 한다.
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter

import boto3

TABLE_NAME = "sedaily-mbti-cms-posts-dev"


def _primary_channel(channels: list | None) -> str | None:
    return (channels or [None])[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="실제로 UpdateItem 실행(기본은 dry-run)")
    parser.add_argument("--region", default="us-east-1")
    args = parser.parse_args()

    table = boto3.resource("dynamodb", region_name=args.region).Table(TABLE_NAME)

    to_update: list[tuple[str, str | None, str | None]] = []  # (id, old_channel, new_channel)
    channel_counts: Counter[str] = Counter()
    scanned = 0

    scan_kwargs: dict = {"ProjectionExpression": "id, channels, channel"}
    while True:
        resp = table.scan(**scan_kwargs)
        for item in resp.get("Items", []):
            scanned += 1
            channels = item.get("channels") or []
            new_channel = _primary_channel(channels)
            old_channel = item.get("channel")
            channel_counts[new_channel or "(없음)"] += 1
            if old_channel != new_channel:
                to_update.append((item["id"], old_channel, new_channel))
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        scan_kwargs["ExclusiveStartKey"] = last_key

    print(f"스캔한 아이템: {scanned}건")
    print("채널별 분포(백필 후 기준):")
    for ch, n in sorted(channel_counts.items(), key=lambda kv: -kv[1]):
        print(f"  {ch}: {n}건")
    print(f"channel 값이 바뀌는(=새로 채워지는) 아이템: {len(to_update)}건")

    if not to_update:
        print("백필할 아이템 없음 — 종료.")
        return

    if not args.apply:
        print("\n[dry-run] --apply 없이 실행돼 실제 반영 안 함. 예시 5건:")
        for post_id, old, new in to_update[:5]:
            print(f"  {post_id}: {old!r} -> {new!r}")
        return

    updated = 0
    failed: list[str] = []
    for post_id, _old, new_channel in to_update:
        try:
            table.update_item(
                Key={"id": post_id},
                UpdateExpression="SET channel = :c",
                ExpressionAttributeValues={":c": new_channel},
            )
            updated += 1
        except Exception as exc:  # noqa: BLE001 — 백필 스크립트, 실패 건만 모아 마지막에 보고
            failed.append(f"{post_id}: {exc}")

    print(f"\n적용 완료: {updated}건")
    if failed:
        print(f"실패: {len(failed)}건", file=sys.stderr)
        for line in failed:
            print(f"  {line}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
