#!/usr/bin/env bash
# AI LENS 프런트엔드 — EC2+PM2 → ECS Fargate 마이그레이션, AWS 인프라
# 최초 프로비저닝 기록.
#
# pipelines/frontpage_auto/provision.sh와 같은 레포 컨벤션(CDK/CloudFormation
# 안 씀, aws cli 순서 그대로 스크립트로 남김) — 재실행하면 대부분
# "already exists" 에러가 난다. 최초 셋업 기록용이지 매번 돌리는 배포
# 스크립트가 아니다(이미지만 갱신하려면 deploy.sh 참고).
#
# 2026-09-04 — 오늘 세션에서 겪은 배포 실패 3종(tar xattr, pm2가 최초
# 등록 경로를 영원히 재사용, /tmp 잔해 누적)이 전부 "가변 EC2에 계속
# 덧쓰기" 구조의 증상이었던 게 확인돼 마이그레이션 결정.
#
# 이 스크립트는 CloudFront를 건드리지 않는다 — Fargate 서비스를 EC2와
# 병행 운영 상태로 먼저 완전히 세팅하고, ALB로 직접 헬스체크까지 확인한
# 뒤 별도로 CloudFront 오리진을 스왑한다(README나 worklog의 트래픽 전환
# 절차 참조). EC2(ailens-ssr-*)는 이 스크립트로 손대지 않는다.
set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="887078546492"
VPC_ID="vpc-07a3a75110d6594aa"
# 기본 VPC의 기존 퍼블릭 서브넷 2개(서로 다른 AZ, ALB 최소 요건) — 새로
# 안 만들고 재사용. us-east-1f는 지금 EC2와 같은 AZ, us-east-1d는
# 파이프라인(sedaily-lens-frontpage-auto)이 이미 쓰는 서브넷.
SUBNET_1="subnet-0c6f948312e9eef83"  # us-east-1f
SUBNET_2="subnet-0b5a146ca8ed1ddfe"  # us-east-1d
# CloudFront origin-facing 관리형 prefix list — 지금 EC2 SG
# (sg-026385217d66ed9e1)와 동일한 "CloudFront만 허용" 패턴.
CF_PREFIX_LIST="pl-3b927c52"

CLUSTER="sedaily-lens-frontend"
REPO="sedaily-lens-frontend"

# Atlas lane 원복(AI-dashboard ops/atlas-lane-rollback) — Service 를 lens 로 되돌렸다
#   (tags-ecs.json 의 Service 값도 같은 변경에서 lens) —
#   docs/architecture/비용태깅_규칙.md 참조. 태그 값은 이 변수 한 곳에서만
#   — 사본마다 하드코딩하면 새는 구멍이 생긴다(같은 문서 §6, 실제 전례).
SERVICE_TAG="lens"

TAGS_KV="Key=Project,Value=Sedaily-LENS Key=CostCenter,Value=sedaily-ai Key=ServiceName,Value=Sedaily-LENS Key=Environment,Value=prod Key=Service,Value=${SERVICE_TAG} Key=Workload,Value=frontend"  # elbv2 (Key=/Value= 공백 구분)
TAGS_EQ="Project=Sedaily-LENS,CostCenter=sedaily-ai,ServiceName=Sedaily-LENS,Environment=prod,Service=${SERVICE_TAG},Workload=frontend"  # logs
TAGS_JSON="[{\"Key\":\"Project\",\"Value\":\"Sedaily-LENS\"},{\"Key\":\"CostCenter\",\"Value\":\"sedaily-ai\"},{\"Key\":\"ServiceName\",\"Value\":\"Sedaily-LENS\"},{\"Key\":\"Environment\",\"Value\":\"prod\"},{\"Key\":\"Service\",\"Value\":\"${SERVICE_TAG}\"},{\"Key\":\"Workload\",\"Value\":\"frontend\"}]"  # ecr
# ECS(cluster --tags)는 ECR과 달리 소문자 key/value를 요구한다(실제
# 실행에서 "Unknown parameter in tags[0]: Key, must be one of: key, value"
# 로 확인 — pipelines/frontpage_auto/provision.sh 주석의 "ecr, ecs cluster
# 둘 다 TAGS_JSON" 설명은 부정확했다).
TAGS_JSON_ECS="[{\"key\":\"Project\",\"value\":\"Sedaily-LENS\"},{\"key\":\"CostCenter\",\"value\":\"sedaily-ai\"},{\"key\":\"ServiceName\",\"value\":\"Sedaily-LENS\"},{\"key\":\"Environment\",\"value\":\"prod\"},{\"key\":\"Service\",\"value\":\"${SERVICE_TAG}\"},{\"key\":\"Workload\",\"value\":\"frontend\"}]"  # ecs cluster
TAG_SPEC_SG="ResourceType=security-group,Tags=[{Key=Project,Value=Sedaily-LENS},{Key=CostCenter,Value=sedaily-ai},{Key=ServiceName,Value=Sedaily-LENS},{Key=Environment,Value=prod},{Key=Service,Value=${SERVICE_TAG}},{Key=Workload,Value=frontend}]"

echo "=== 1/8 ECR 리포지토리 ==="
aws ecr create-repository --repository-name "$REPO" --region "$REGION" \
  --image-scanning-configuration scanOnPush=true \
  --tags "$TAGS_JSON"

echo "=== 2/8 IAM 역할 2개 (태스크 실행 / 앱 권한) ==="
# execution-role — ECS 에이전트가 이미지 pull + REVALIDATE_SECRET을
# SSM에서 가져와 컨테이너 시작 시 주입하는 데 쓴다(지금 EC2가 배포마다
# .env.production.local 파일을 그대로 복사해 이어받던 방식을 대체 —
# 더 이상 평문 파일을 릴리스마다 옮기지 않는다).
aws iam create-role --role-name sedaily-lens-frontend-execution-role \
  --assume-role-policy-document file://trust-policy-ecs-tasks.json
aws iam attach-role-policy --role-name sedaily-lens-frontend-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam put-role-policy --role-name sedaily-lens-frontend-execution-role \
  --policy-name RevalidateSecretRead --policy-document file://execution-role-secrets-policy.json

# task-role — 앱이 런타임에 직접 호출하는 AWS API가 없다(공개 API
# Gateway만 호출, 기존 ailens-ssr-ec2-role 설명과 동일 이유) — 확장
# 대비 빈 역할만 생성.
aws iam create-role --role-name sedaily-lens-frontend-task-role \
  --assume-role-policy-document file://trust-policy-ecs-tasks.json

echo "=== 3/8 CloudWatch 로그그룹 (30일 보관) ==="
aws logs create-log-group --log-group-name "/ecs/$CLUSTER" --region "$REGION" --tags "$TAGS_EQ"
aws logs put-retention-policy --log-group-name "/ecs/$CLUSTER" --retention-in-days 30 --region "$REGION"

echo "=== 4/8 보안그룹 2개 (ALB / Fargate 태스크) ==="
ALB_SG_ID=$(aws ec2 create-security-group --group-name sedaily-lens-frontend-alb-sg \
  --description "AI LENS frontend ALB - CloudFront origin only (80)" --vpc-id "$VPC_ID" \
  --region "$REGION" --tag-specifications "$TAG_SPEC_SG" --query "GroupId" --output text)
aws ec2 authorize-security-group-ingress --group-id "$ALB_SG_ID" \
  --ip-permissions "IpProtocol=tcp,FromPort=80,ToPort=80,PrefixListIds=[{PrefixListId=${CF_PREFIX_LIST}}]" \
  --region "$REGION"

TASK_SG_ID=$(aws ec2 create-security-group --group-name sedaily-lens-frontend-task-sg \
  --description "AI LENS frontend Fargate task - ALB only (3000)" --vpc-id "$VPC_ID" \
  --region "$REGION" --tag-specifications "$TAG_SPEC_SG" --query "GroupId" --output text)
aws ec2 authorize-security-group-ingress --group-id "$TASK_SG_ID" \
  --ip-permissions "IpProtocol=tcp,FromPort=3000,ToPort=3000,UserIdGroupPairs=[{GroupId=${ALB_SG_ID}}]" \
  --region "$REGION"

echo "  ALB_SG=$ALB_SG_ID  TASK_SG=$TASK_SG_ID"

echo "=== 5/8 ALB + 타깃그룹 + 리스너 ==="
ALB_ARN=$(aws elbv2 create-load-balancer --name sedaily-lens-frontend-alb \
  --subnets "$SUBNET_1" "$SUBNET_2" --security-groups "$ALB_SG_ID" \
  --scheme internet-facing --type application --region "$REGION" \
  --tags $TAGS_KV --query "LoadBalancers[0].LoadBalancerArn" --output text)

TG_ARN=$(aws elbv2 create-target-group --name sedaily-lens-frontend-tg \
  --protocol HTTP --port 3000 --vpc-id "$VPC_ID" --target-type ip \
  --health-check-path / --health-check-protocol HTTP \
  --region "$REGION" --tags $TAGS_KV --query "TargetGroups[0].TargetGroupArn" --output text)

aws elbv2 create-listener --load-balancer-arn "$ALB_ARN" \
  --protocol HTTP --port 80 \
  --default-actions "Type=forward,TargetGroupArn=${TG_ARN}" \
  --region "$REGION" --tags $TAGS_KV > /dev/null

ALB_DNS=$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB_ARN" \
  --region "$REGION" --query "LoadBalancers[0].DNSName" --output text)
echo "  ALB_DNS=$ALB_DNS"

echo "=== 6/8 ECS 클러스터 ==="
aws ecs create-cluster --cluster-name "$CLUSTER" --region "$REGION" --tags "$TAGS_JSON_ECS"

echo "=== 7/8 태스크 정의 등록 ==="
aws ecs register-task-definition --cli-input-json file://taskdef.json --region "$REGION" --tags file://tags-ecs.json

echo "=== 8/8 ECS 서비스 ==="
# propagateTags=TASK_DEFINITION 필수 — 없으면 실제 실행 중인 태스크
# (컴퓨트 비용)에 태그가 하나도 안 붙는다(비용태깅_규칙.md §5, 파이프라인도
# 이걸 놓쳐서 나중에 고친 전례).
aws ecs create-service --cluster "$CLUSTER" --service-name "$CLUSTER" \
  --task-definition "$CLUSTER" --desired-count 1 --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_1},${SUBNET_2}],securityGroups=[${TASK_SG_ID}],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=${TG_ARN},containerName=frontend,containerPort=3000" \
  --deployment-configuration "minimumHealthyPercent=100,maximumPercent=200" \
  --propagate-tags TASK_DEFINITION \
  --region "$REGION" > /dev/null

echo ""
echo "완료 — CloudFront는 안 건드림(EC2가 계속 실서비스 중)."
echo "확인: aws ecs wait services-stable --cluster $CLUSTER --services $CLUSTER --region $REGION"
echo "헬스체크: curl -s -o /dev/null -w '%{http_code}\n' http://${ALB_DNS}/"
echo "태그 검증(서비스 stable 이후): aws ecs list-tags-for-resource --resource-arn <task ARN> --region $REGION"
