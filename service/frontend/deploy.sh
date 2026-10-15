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
umask 077
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/config/resources.env"

WAIT=1
[ "${1:-}" = "--no-wait" ] && WAIT=0

# 단계별 소요 시간 출력(2026-10-01) — 어디가 느린지 매번 바로 보이게.
T0=$SECONDS
TL=$SECONDS
lap() { echo "  [${1}] $(( SECONDS - TL ))s (누적 $(( SECONDS - T0 ))s)"; TL=$SECONDS; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

REGION="us-east-1"
ACCOUNT_ID="$AWS_ACCOUNT_ID"
REPO="$SERVICE_FRONTEND_ECS_SERVICE"
CLUSTER="$SERVICE_FRONTEND_ECS_CLUSTER"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO}"

# 첫 이미지 push/태스크 등록 전에 계정·기존 서비스·비용 태그를 검사한다.
test "$(aws sts get-caller-identity --query Account --output text)" = "$AWS_ACCOUNT_ID"
aws ecs describe-services --cluster "$CLUSTER" --services "$REPO" --region "$REGION" --output json > /tmp/lens-frontend-preflight.json
python3 - /tmp/lens-frontend-preflight.json tags-ecs.json <<'PYPREFLIGHT'
import json,sys
state=json.load(open(sys.argv[1]));tags=json.load(open(sys.argv[2]))
if state.get('failures') or len(state.get('services',[]))!=1 or state['services'][0].get('status')!='ACTIVE':
    raise SystemExit('기존 ECS 서비스 확인 실패 — 변경 전에 중단')
if not any(tag['key']=='Service' and tag['value']=='lens' for tag in tags):
    raise SystemExit('신규 task definition Service=lens 태그 필요')
PYPREFLIGHT

# 실행 중인 이전 이미지 digest를 보존한다. latest 태그 재지정 후에도 복구 가능해야 한다.
BEFORE_TASK=$(python3 -c 'import json;print(json.load(open("/tmp/lens-frontend-preflight.json"))["services"][0]["taskDefinition"])')
aws ecs describe-task-definition --task-definition "$BEFORE_TASK" --region "$REGION" > /tmp/lens-frontend-before-definition.json
RUNNING_TASKS=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$REPO" --desired-status RUNNING --region "$REGION" --query 'taskArns' --output text)
test -n "$RUNNING_TASKS"
aws ecs describe-tasks --cluster "$CLUSTER" --tasks $RUNNING_TASKS --region "$REGION" > /tmp/lens-frontend-before-running.json
BEFORE_DIGEST=$(python3 - "$BEFORE_TASK" <<'PYDIGEST'
import json,sys
state=json.load(open('/tmp/lens-frontend-before-running.json'))
tasks=state.get('tasks',[])
if state.get('failures') or not tasks or any(task['taskDefinitionArn']!=sys.argv[1] for task in tasks):
    raise SystemExit('진행 중인 다른 롤링 배포 — 변경 전에 중단')
digests={c.get('imageDigest','') for task in tasks for c in task.get('containers',[]) if c['name']=='frontend'}
if len(digests)!=1:raise SystemExit('이전 실행 이미지가 단일 digest가 아님')
print(next(iter(digests)))
PYDIGEST
)
python3 scripts/release_task.py --definition /tmp/lens-frontend-before-definition.json --repository "$ECR_URI" --digest "$BEFORE_DIGEST" --output /tmp/lens-frontend-rollback-task.json

echo "=== 1/4 이미지 빌드 (linux/arm64 — Fargate 태스크 정의와 일치) ==="
# 2026-10-13 모노레포 전환 — 빌드 컨텍스트는 **레포 루트**(../..) 다.
# service/frontend 가 @ailens/domain(packages/) 에 의존하므로 컨텍스트에 packages/ 가
# 포함돼야 npm ci(워크스페이스)가 성립한다. Dockerfile 은 -f 로 명시한다
# (Dockerfile·next.config.ts outputFileTracingRoot 주석 참조).
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
: "${NEXT_PUBLIC_API_URL:?계정 API 공개 URL을 공급하세요}"
: "${NEXT_PUBLIC_CMS_API_URL:?CMS 공개 URL을 공급하세요}"
python3 - "$NEXT_PUBLIC_API_URL" "$NEXT_PUBLIC_CMS_API_URL" <<'PYURL'
import sys
from urllib.parse import urlsplit
for value in sys.argv[1:]:
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise SystemExit('공개 API URL은 자격증명 없는 HTTPS 주소여야 합니다.')
PYURL
docker build --platform linux/arm64 -t "${REPO}:latest" \
  --build-arg NEXT_PUBLIC_API_URL --build-arg NEXT_PUBLIC_CMS_API_URL \
  -f "$SCRIPT_DIR/Dockerfile" "$REPO_ROOT"
lap "빌드"

echo ""
echo "=== 2/4 ECR push ==="
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
RELEASE_TAG="release-$(date -u +%Y%m%dT%H%M%S)-$(python3 -c 'import uuid;print(uuid.uuid4().hex[:12])')"
docker tag "${REPO}:latest" "${ECR_URI}:${RELEASE_TAG}"
docker push "${ECR_URI}:${RELEASE_TAG}"
lap "ECR push"

echo ""
echo "=== 3/4 태스크 정의 새 리비전 등록 ==="
# --tags 필수(비용태깅_규칙.md §5) — task definition은 불변이라 새
# 리비전은 이전 리비전의 태그를 상속하지 않는다. 매 배포마다 다시 줘야
# 한다.
NEW_DIGEST=$(aws ecr describe-images --repository-name "$REPO" --image-ids "imageTag=$RELEASE_TAG" --region "$REGION" --query 'imageDetails[0].imageDigest' --output text)
python3 scripts/release_task.py --definition taskdef.json --repository "$ECR_URI" --digest "$NEW_DIGEST" --output /tmp/lens-frontend-new-task.json
NEW_TASK_ARN=$(aws ecs register-task-definition --cli-input-json file:///tmp/lens-frontend-new-task.json --region "$REGION" \
  --tags file://tags-ecs.json --query 'taskDefinition.taskDefinitionArn' --output text)
test "$(aws ecs list-tags-for-resource --resource-arn "$NEW_TASK_ARN" --region "$REGION" --query "tags[?key=='Service'].value | [0]" --output text)" = lens

echo ""
echo "=== 4/4 ECS 서비스 롤링 배포 ==="
aws ecs update-service --cluster "$CLUSTER" --service "$CLUSTER" \
  --task-definition "$NEW_TASK_ARN" --force-new-deployment \
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

# CloudFront 캐시 무효화(2026-10-01) — 배포 직후 옛 빌드의 HTML·RSC 페이로드가 캐시에 남아(실측: /start RSC가 12시간 전 것) 옛 폰트 참조 등이
# 계속 내려갔다. 경로 "/*"는 1경로로 계산되어 월 1,000경로까지 무료다. 실패해도 배포 자체는 성공이므로 경고만 낸다.
# (이미지 변환 캐시도 같이 비워져 배포 직후 첫 요청은 다시 변환된다 — 서버 디스크 캐시와 CloudFront가 곧 다시 채운다.)
CF_DIST_ID="$SERVICE_CF_DIST_ID"
echo ""
echo "=== CloudFront 캐시 무효화 ==="
aws cloudfront create-invalidation --distribution-id "$CF_DIST_ID" --paths "/*" --query 'Invalidation.[Id,Status]' --output text \
  || echo "WARNING: CloudFront 무효화 실패 — 수동으로 실행하거나 최대 5분(TTL) 기다릴 것." >&2
lap "CloudFront 무효화 요청"

ALB_DNS=$(aws elbv2 describe-load-balancers --names sedaily-lens-frontend-alb \
  --region "$REGION" --query "LoadBalancers[0].DNSName" --output text)
echo ""
echo "=== 헬스체크 (ALB 직접) ==="
# 로컬(사무실 IP)에서는 ALB로 직접 못 닿아 시간 초과가 날 수 있다 — set -e로 스크립트가 죽지 않게 || true(2026-10-01).
HTTP_CODE=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" "http://${ALB_DNS}/" || true)
echo "  http://${ALB_DNS}/ → $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
  echo "WARNING: ALB 직접 헬스체크가 200이 아님(로컬에서 ALB에 닿지 않을 수 있음) — https://ailens.sedaily.ai 로 확인할 것." >&2
fi

echo ""
echo "=== 스모크 테스트 (운영 주소, CloudFront 무효화 반영까지 재시도) ==="
# 주요 주소가 기대한 코드를 주는지 확인한다. 실패해도 이미 배포된 뒤라 되돌리지는 않고, 스크립트를 실패로 끝내 놓치지 않게 한다(2026-10-04).
SMOKE_FAILED=0
"$(dirname "$0")/scripts/smoke.sh" https://ailens.sedaily.ai || SMOKE_FAILED=1

echo ""
echo "=== 배포 완료 (총 $(( SECONDS - T0 ))s) ==="
echo "ALB: http://${ALB_DNS}/"
echo "실도메인(CloudFront가 이미 ALB를 오리진으로 쓰는 경우만 반영됨): https://ailens.sedaily.ai"
[ "$SMOKE_FAILED" = "0" ] || { echo "경고: 스모크 테스트 실패 — 위 목록을 확인하고 필요하면 이전 리비전으로 되돌릴 것." >&2; exit 1; }
