#!/usr/bin/env bash
# 지면 1면 자동 발행 파이프라인의 AWS 인프라 최초 프로비저닝 기록.
#
# CloudFormation/CDK 없이 aws cli로 순서대로 실행한 내용을 그대로 남긴 스크립트이다.
# 이미 만들어진 리소스에는 "already exists" 에러가 나므로 최초 셋업 기록용이며,
# 이미지 갱신 배포는 deploy.sh를 쓴다.
set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="887078546492"
CLUSTER="sedaily-lens-frontpage-auto"
REPO="sedaily-lens-frontpage-auto"

# 비용 태그는 docs/architecture/비용태깅_규칙.md 스키마를 따른다(mustknow_auto와 같은 패턴,
# WorkItem 태그는 mustknow 계열에만 붙이므로 여기서는 생략).
# 주의: 크레딧 지원 종료일(2026-09-30) 이후 SERVICE_TAG를 "lens"로 되돌려야 하며,
# tags-ecs.json의 Service 값도 함께 바꾼다.
SERVICE_TAG="atlas4"  # 9/30 이후 "lens"

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
# 이 정책에는 ecs:TagResource가 필요하다. EventBridge 타깃에 PropagateTags=TASK_DEFINITION을
# 쓰면 RunTask가 태스크에 태그를 붙이는데, 권한이 없으면 RunTask 자체가 실패한다.
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
# eventbridge-target.json의 PropagateTags=TASK_DEFINITION은 필수이다. 없으면 RunTask로 뜨는
# Fargate 태스크(컴퓨트 비용)에 태그가 붙지 않는다(태스크 정의 태그와 실행 태스크 태그는 별개).
aws events put-targets --rule "${CLUSTER}-daily" --targets file://eventbridge-target.json --region "$REGION"

echo "완료 — 기본 VPC(vpc-07a3a75110d6594aa)의 public 서브넷 + default 보안그룹 사용"
echo "(인바운드 불필요, 아웃바운드는 default SG가 전부 허용)."
