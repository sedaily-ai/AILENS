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
#   ./deploy.sh              # 롤링 배포가 안정화될 때까지 대기(기본)
#   ./deploy.sh --no-wait    # update-service 직후 반환(2026-10-01) — 새 코드는
#                            # 보통 시작 후 ~40초면 서비스되지만 이전 태스크
#                            # 정리까지 기다리면 2분 이상 걸린다. 성공 여부는
#                            # 아래 안내 명령으로 별도 확인.
#
# 전제:
#   - `provision-fargate.sh`로 인프라(ECR/IAM/ALB/ECS 클러스터·서비스)가
#     이미 프로비저닝돼 있어야 한다 — 이 스크립트는 이미지 갱신 전용.
#   - Docker Desktop(또는 등가) 실행 중, `--platform linux/arm64` 빌드
#     가능해야 한다(Fargate 태스크 정의가 ARM64).
#   - output: "standalone" (next.config.ts) → .next/standalone/ 생성,
#     Dockerfile이 이걸 그대로 컨테이너 이미지에 담는다.
set -euo pipefail

WAIT=1
[ "${1:-}" = "--no-wait" ] && WAIT=0

# 단계별 소요 시간 출력(2026-10-01) — 어디가 느린지 매번 바로 보이게.
T0=$SECONDS
TL=$SECONDS
lap() { echo "  [${1}] $(( SECONDS - TL ))s (누적 $(( SECONDS - T0 ))s)"; TL=$SECONDS; }

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
lap "빌드"

echo ""
echo "=== 2/4 ECR push ==="
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
docker tag "${REPO}:latest" "${ECR_URI}:latest"
docker push "${ECR_URI}:latest"
lap "ECR push"

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

lap "태스크 정의·롤링 시작"

if [ "$WAIT" = "0" ]; then
  echo ""
  echo "=== --no-wait: 롤링 배포는 백그라운드로 진행 중 ==="
  echo "상태 확인: aws ecs describe-services --cluster $CLUSTER --services $CLUSTER --region $REGION --query 'services[0].deployments[0].rolloutState' --output text"
  echo "총 소요: $(( SECONDS - T0 ))s"
  exit 0
fi

echo "  배포 완료 대기 중..."
aws ecs wait services-stable --cluster "$CLUSTER" --services "$CLUSTER" --region "$REGION"
lap "롤링 안정화 대기"

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
echo "=== 배포 완료 (총 $(( SECONDS - T0 ))s) ==="
echo "ALB: http://${ALB_DNS}/"
echo "실도메인(CloudFront가 이미 ALB를 오리진으로 쓰는 경우만 반영됨): https://ailens.sedaily.ai"
