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

echo "=== 1/7 ECR 리포지토리 ==="
aws ecr create-repository --repository-name "$REPO" --region "$REGION" \
  --image-scanning-configuration scanOnPush=true

echo "=== 2/7 IAM 역할 3개 (태스크 실행 / 앱 권한 / EventBridge 호출) ==="
aws iam create-role --role-name sedaily-lens-frontpage-auto-task-role \
  --assume-role-policy-document file://trust-policy-ecs-tasks.json
aws iam put-role-policy --role-name sedaily-lens-frontpage-auto-task-role \
  --policy-name FrontpageAutoAccess --policy-document file://task-policy.json

aws iam create-role --role-name sedaily-lens-frontpage-auto-execution-role \
  --assume-role-policy-document file://trust-policy-ecs-tasks.json
aws iam attach-role-policy --role-name sedaily-lens-frontpage-auto-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

aws iam create-role --role-name sedaily-lens-frontpage-auto-eventbridge-role \
  --assume-role-policy-document file://trust-policy-events.json
aws iam put-role-policy --role-name sedaily-lens-frontpage-auto-eventbridge-role \
  --policy-name RunFrontpageAutoTask --policy-document file://eventbridge-runtask-policy.json

echo "=== 3/7 CloudWatch 로그그룹 (30일 보관) ==="
aws logs create-log-group --log-group-name "/ecs/$CLUSTER" --region "$REGION"
aws logs put-retention-policy --log-group-name "/ecs/$CLUSTER" --retention-in-days 30 --region "$REGION"

echo "=== 4/7 ECS 클러스터 ==="
aws ecs create-cluster --cluster-name "$CLUSTER" --region "$REGION"

echo "=== 5/7 태스크 정의 등록 ==="
aws ecs register-task-definition --cli-input-json file://taskdef.json --region "$REGION"

echo "=== 6/7 EventBridge 규칙(매일 07:00 KST = 22:00 UTC 전날) ==="
aws events put-rule --name "${CLUSTER}-daily" \
  --schedule-expression "cron(0 22 * * ? *)" --state ENABLED \
  --description "매일 아침 7시(KST) 지면 1면 자동 발행" --region "$REGION"

echo "=== 7/7 EventBridge 타겟(위 태스크 정의 연결) ==="
aws events put-targets --rule "${CLUSTER}-daily" --targets file://eventbridge-target.json --region "$REGION"

echo "완료 — 기본 VPC(vpc-07a3a75110d6594aa)의 public 서브넷 + default 보안그룹 사용"
echo "(인바운드 불필요, 아웃바운드는 default SG가 전부 허용)."
