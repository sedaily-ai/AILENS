#!/usr/bin/env bash
# frontend (AI LENS, ailens.sedaily.ai) 배포 — Docker + ECS Fargate.
#
# 2026-09-04 — EC2+PM2+SSM Run Command 방식(옛 버전은 git 히스토리 참조,
# `provision-fargate.sh` 상단 주석에 마이그레이션 배경)에서 전환. 코드
# 변경 후 이미지만 다시 빌드·push하고 ECS 서비스에 새 배포를 강제한다 —
# pipelines/frontpage_auto/deploy.sh와 같은 컨벤션이지만, 그쪽은 스케줄
# RunTask(EventBridge가 매번 family의 최신 리비전을 자동으로 씀)라
# update-service가 필요 없고, 이쪽은 상시 ECS Service라 명시적으로
# force-new-deployment를 걸어야 새 태스크 정의 리비전으로 롤링 배포된다.
#
# 사용:
#   cd service/frontend
#   ./deploy.sh
#
# 전제:
#   - `provision-fargate.sh`로 인프라(ECR/IAM/ALB/ECS 클러스터·서비스)가
#     이미 프로비저닝돼 있어야 한다 — 이 스크립트는 이미지 갱신 전용.
#   - Docker Desktop(또는 등가) 실행 중, `--platform linux/arm64` 빌드
#     가능해야 한다(Fargate 태스크 정의가 ARM64).
#   - output: "standalone" (next.config.ts) → .next/standalone/ 생성,
#     Dockerfile이 이걸 그대로 컨테이너 이미지에 담는다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

REGION="us-east-1"
ACCOUNT_ID="887078546492"
REPO="sedaily-lens-frontend"
CLUSTER="sedaily-lens-frontend"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO}"

echo "=== 1/4 이미지 빌드 (linux/arm64 — Fargate 태스크 정의와 일치) ==="
# 빌드 컨텍스트는 반드시 이 폴더(service/frontend/) — next.config.ts의
# outputFileTracingRoot가 여기로 고정돼 있다(Dockerfile 상단 주석 참조).
docker build --platform linux/arm64 -t "${REPO}:latest" .

echo ""
echo "=== 2/4 ECR push ==="
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
docker tag "${REPO}:latest" "${ECR_URI}:latest"
docker push "${ECR_URI}:latest"

echo ""
echo "=== 3/4 태스크 정의 새 리비전 등록 ==="
# --tags 필수(비용태깅_규칙.md §5) — task definition은 불변이라 새
# 리비전은 이전 리비전의 태그를 상속하지 않는다. 매 배포마다 다시 줘야
# 한다.
aws ecs register-task-definition --cli-input-json file://taskdef.json --region "$REGION" \
  --tags file://tags-ecs.json \
  --query "taskDefinition.{Family:family,Revision:revision}" --output json

echo ""
echo "=== 4/4 ECS 서비스 롤링 배포 ==="
aws ecs update-service --cluster "$CLUSTER" --service "$CLUSTER" \
  --task-definition "$CLUSTER" --force-new-deployment \
  --region "$REGION" --query "service.{Status:status,DesiredCount:desiredCount,RunningCount:runningCount}" --output json

echo "  배포 완료 대기 중..."
aws ecs wait services-stable --cluster "$CLUSTER" --services "$CLUSTER" --region "$REGION"

ALB_DNS=$(aws elbv2 describe-load-balancers --names sedaily-lens-frontend-alb \
  --region "$REGION" --query "LoadBalancers[0].DNSName" --output text)
echo ""
echo "=== 헬스체크 (ALB 직접) ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${ALB_DNS}/")
echo "  http://${ALB_DNS}/ → $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
  echo "WARNING: 헬스체크가 200이 아님 — 수동 확인 필요." >&2
fi

echo ""
echo "=== 배포 완료 ==="
echo "ALB: http://${ALB_DNS}/"
echo "실도메인(CloudFront가 이미 ALB를 오리진으로 쓰는 경우만 반영됨): https://ailens.sedaily.ai"
