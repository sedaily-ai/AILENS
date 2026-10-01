#!/usr/bin/env bash
# 지면 1면 자동 발행 파이프라인의 AWS 인프라 최초 프로비저닝 기록.
#
# CloudFormation/CDK를 안 쓰는 이 저장소 컨벤션대로(admin/backend
# deploy-admin-api.sh 등과 같은 이유) 직접 aws cli로 순서대로 실행한
# 것을 그대로 스크립트로 남긴다 — 2026-08-21에 이 순서 그대로 실행해서
# 검증 완료(로컬 Docker 빌드+실행 → ECR push → IAM 역할 2개 →
# CloudWatch 로그그룹 → ECS 클러스터 → 태스크 정의 → 수동 run-task로
# 실제 Fargate 검증 → EventBridge 규칙+타겟).
#
# 이미 만들어진 리소스라 재실행하면 대부분 "already exists" 에러가
# 난다 — 이건 최초 셋업 기록용이지, 매번 돌리는 배포 스크립트가
# 아니다(이미지만 갱신하려면 deploy.sh 참고).
#
# 2026-08-23 — 리소스명에서 "mbti"를 걷어내는 작업으로 sedaily-mbti-* →
# sedaily-lens-*로 전부 재생성했다(구 리소스는 데이터 유실 감수하고 삭제 —
# 아직 프로토타입 단계라 다운타임/데이터 손실 허용된 상태에서 진행).
set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="887078546492"
CLUSTER="sedaily-lens-frontpage-auto"
REPO="sedaily-lens-frontpage-auto"

# 2026-09-03 비용태깅 감사 — 이 스크립트는 애초에 태그를 하나도 안 붙이고
# 있었다(mustknow_auto/provision.sh는 처음부터 tags-ecs.json 등으로 태깅됨).
# docs/architecture/비용태깅_규칙.md 스키마 그대로, mustknow_auto와 같은
# 패턴 — 다만 WorkItem은 "mustknow 계열에만, 선택"이라 여긴 안 붙인다.
# Atlas lane 원복(AI-dashboard ops/atlas-lane-rollback) — Service 를 lens 로 되돌렸다.
#    tags-ecs.json 의 Service 값도 같은 변경에서 lens 로 바꿨다.
SERVICE_TAG="lens"

TAGS_KV="Key=Project,Value=Sedaily-LENS Key=CostCenter,Value=sedaily-ai Key=ServiceName,Value=Sedaily-LENS Key=Environment,Value=dev Key=Service,Value=${SERVICE_TAG} Key=Workload,Value=frontpage-auto"  # iam (대문자 Key/Value)
TAGS_EQ="Project=Sedaily-LENS,CostCenter=sedaily-ai,ServiceName=Sedaily-LENS,Environment=dev,Service=${SERVICE_TAG},Workload=frontpage-auto"  # logs
TAGS_JSON="[{\"Key\":\"Project\",\"Value\":\"Sedaily-LENS\"},{\"Key\":\"CostCenter\",\"Value\":\"sedaily-ai\"},{\"Key\":\"ServiceName\",\"Value\":\"Sedaily-LENS\"},{\"Key\":\"Environment\",\"Value\":\"dev\"},{\"Key\":\"Service\",\"Value\":\"${SERVICE_TAG}\"},{\"Key\":\"Workload\",\"Value\":\"frontpage-auto\"}]"  # events, ecr, ecs cluster (--region 명시 필수)

echo "=== 1/7 ECR 리포지토리 ==="
aws ecr create-repository --repository-name "$REPO" --region "$REGION" \
  --image-scanning-configuration scanOnPush=true \
  --tags "$TAGS_JSON"

echo "=== 2/7 IAM 역할 3개 (태스크 실행 / 앱 권한 / EventBridge 호출) ==="
aws iam create-role --role-name sedaily-lens-frontpage-auto-task-role \
  --assume-role-policy-document file://trust-policy-ecs-tasks.json \
  --tags $TAGS_KV
aws iam put-role-policy --role-name sedaily-lens-frontpage-auto-task-role \
  --policy-name FrontpageAutoAccess --policy-document file://task-policy.json

aws iam create-role --role-name sedaily-lens-frontpage-auto-execution-role \
  --assume-role-policy-document file://trust-policy-ecs-tasks.json \
  --tags $TAGS_KV
aws iam attach-role-policy --role-name sedaily-lens-frontpage-auto-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

aws iam create-role --role-name sedaily-lens-frontpage-auto-eventbridge-role \
  --assume-role-policy-document file://trust-policy-events.json \
  --tags $TAGS_KV
# 이 정책에는 ecs:TagResource가 필요하다(mustknow_auto/provision.sh와 같은
# 이유) — EventBridge 타깃에 PropagateTags=TASK_DEFINITION을 쓰면 RunTask가
# 태스크에 태그를 붙이는데, 그 권한이 없으면 RunTask 자체가 실패한다.
aws iam put-role-policy --role-name sedaily-lens-frontpage-auto-eventbridge-role \
  --policy-name RunFrontpageAutoTask --policy-document file://eventbridge-runtask-policy.json

echo "=== 3/7 CloudWatch 로그그룹 (30일 보관) ==="
aws logs create-log-group --log-group-name "/ecs/$CLUSTER" --region "$REGION" --tags "$TAGS_EQ"
aws logs put-retention-policy --log-group-name "/ecs/$CLUSTER" --retention-in-days 30 --region "$REGION"

echo "=== 4/7 ECS 클러스터 ==="
aws ecs create-cluster --cluster-name "$CLUSTER" --region "$REGION" --tags "$TAGS_JSON"

echo "=== 5/7 태스크 정의 등록 ==="
aws ecs register-task-definition --cli-input-json file://taskdef.json --region "$REGION" --tags file://tags-ecs.json

echo "=== 6/7 EventBridge 규칙(매일 07:00 KST = 22:00 UTC 전날) ==="
aws events put-rule --name "${CLUSTER}-daily" \
  --schedule-expression "cron(0 22 * * ? *)" --state ENABLED \
  --description "매일 아침 7시(KST) 지면 1면 자동 발행" --region "$REGION"
aws events tag-resource --resource-arn "arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/${CLUSTER}-daily" --tags "$TAGS_JSON" --region "$REGION"

echo "=== 7/7 EventBridge 타겟(위 태스크 정의 연결) ==="
# eventbridge-target.json의 PropagateTags=TASK_DEFINITION은 필수다 — 이게
# 없으면 RunTask로 뜨는 Fargate 태스크(컴퓨트 비용)에 태그가 하나도 안
# 붙는다. task definition을 태깅해도 실행 태스크는 별개(2026-09-03 실측
# 확인 — frontpage_auto는 이 필드 자체가 없어서 지금까지 전부 미태깅이었다).
aws events put-targets --rule "${CLUSTER}-daily" --targets file://eventbridge-target.json --region "$REGION"

echo "완료 — 기본 VPC(vpc-07a3a75110d6594aa)의 public 서브넷 + default 보안그룹 사용"
echo "(인바운드 불필요, 아웃바운드는 default SG가 전부 허용)."
