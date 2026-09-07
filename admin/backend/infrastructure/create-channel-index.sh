#!/usr/bin/env bash
# 신규 GSI `channel-publish_date-index` 생성 (2026-09-07, 사이트 전역 응답
# 지연 조사 — service/backend/clients/cms_posts_ddb_client.py 주석,
# backfill_channel_field.py 참조).
#
# 지금까지 공개 목록 조회는 `status-publish_date-index`(해시=status)로
# "발행된 글 전체"를 읽은 뒤 Python에서 channel로 걸러냈다 — 채널 하나만
# 필요한 요청도 전체 발행 코퍼스를 읽는 구조라 콘텐츠가 쌓일수록 느려졌다
# (실측: channel=lens limit=1000 조회 9.8초, 3,531건 전체 스캔).
# 이 GSI는 채널을 파티션키로 둬서 DynamoDB가 그 채널 아이템만 읽게 한다.
#
# on-demand 테이블(PAY_PER_REQUEST)이라 다운타임 없이 추가 가능 — 기존
# 트래픽에 영향 없음. 기존 `status-publish_date-index`는 admin 자체 대시보드
# (admin/backend/repo/posts_repo.py::list_posts(), "채널 무관 상태별 전체
# 조회")가 계속 쓰므로 지우지 않는다.
#
# 실행 순서: backfill_channel_field.py 상단 docstring 참조.

set -euo pipefail

TABLE_NAME="sedaily-mbti-cms-posts-dev"
REGION="us-east-1"
INDEX_NAME="channel-publish_date-index"

echo "테이블: $TABLE_NAME ($REGION)"
echo "생성할 GSI: $INDEX_NAME (해시=channel, 정렬=publish_date)"
read -r -p "계속하시겠습니까? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "취소됨."
  exit 1
fi

aws dynamodb update-table \
  --table-name "$TABLE_NAME" \
  --region "$REGION" \
  --attribute-definitions \
    AttributeName=channel,AttributeType=S \
    AttributeName=publish_date,AttributeType=S \
  --global-secondary-index-updates \
    '[{"Create":{"IndexName":"'"$INDEX_NAME"'","KeySchema":[{"AttributeName":"channel","KeyType":"HASH"},{"AttributeName":"publish_date","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}}]'

echo ""
echo "GSI 생성 요청 완료 — 백그라운드로 backfilling 됨(기존 3,531건 기준 수 분 내 완료 예상)."
echo "상태 확인:"
echo "  aws dynamodb describe-table --table-name $TABLE_NAME --region $REGION \\"
echo "    --query 'Table.GlobalSecondaryIndexes[?IndexName==\`$INDEX_NAME\`].IndexStatus' --output text"
echo ""
echo "ACTIVE 될 때까지 대기 후 backfill_channel_field.py --apply 실행할 것."
