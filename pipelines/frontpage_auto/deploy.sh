#!/usr/bin/env bash
# 코드 변경 후 이미지를 다시 빌드·push하고 태스크 정의를 새 리비전으로 등록한다.
# EventBridge 규칙은 태스크 정의를 family 이름으로 참조하므로 최신 리비전이 자동 적용된다.
#
# 사용법: pipelines/ 에서 실행 — cd pipelines && ./frontpage_auto/deploy.sh
set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="887078546492"
REPO="sedaily-lens-frontpage-auto"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO}"

echo "=== 1/3 이미지 빌드 (linux/arm64 — Fargate 태스크 정의와 일치) ==="
docker build --platform linux/arm64 -f frontpage_auto/Dockerfile -t "${REPO}:latest" .

echo "=== 2/3 ECR push ==="
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
docker tag "${REPO}:latest" "${ECR_URI}:latest"
docker push "${ECR_URI}:latest"

echo "=== 3/3 태스크 정의 새 리비전 등록 ==="
# 실행 태스크(컴퓨트 비용)에 태그가 붙으려면 태스크 정의 태그 외에
# eventbridge-target.json의 PropagateTags=TASK_DEFINITION과
# eventbridge-runtask-policy.json의 ecs:TagResource 권한이 함께 필요하다.
aws ecs register-task-definition --cli-input-json file://frontpage_auto/taskdef.json --region "$REGION" \
  --tags file://frontpage_auto/tags-ecs.json \
  --query "taskDefinition.{Family:family,Revision:revision}" --output json

echo "완료 — 다음 EventBridge 트리거(매일 07:00 KST)부터 새 이미지로 실행됨."
echo "지금 바로 확인하려면: aws ecs run-task --cluster sedaily-lens-frontpage-auto --task-definition sedaily-lens-frontpage-auto --launch-type FARGATE --network-configuration '{\"awsvpcConfiguration\":{\"subnets\":[\"subnet-0b5a146ca8ed1ddfe\"],\"securityGroups\":[\"sg-05cb5f7bc29891cf8\"],\"assignPublicIp\":\"ENABLED\"}}' --region us-east-1"
