#!/usr/bin/env bash
# 필수뉴스 자동 발행(Step1+Step2 통합) 파이프라인의 AWS 인프라 최초
# 프로비저닝 기록 — frontpage_auto/provision.sh와 같은 이유로 CloudFormation/
# CDK 없이 aws cli 순서 기록. 이미 만들어진 리소스라 재실행하면 대부분
# "already exists" 에러가 난다(최초 셋업 기록용, deploy.sh 참고는 이미지
# 갱신용).
#
# frontpage_auto와 ECR 리포지토리·Docker 이미지·ECS 클러스터를 그대로
# 재사용한다 — Dockerfile이 pipelines/ 전체를 COPY하므로 이 폴더도 이미
# 이미지 안에 있고, taskdef.json의 workingDirectory 오버라이드로 같은
# 이미지·다른 진입점으로 실행한다. Bedrock inference profile
# (mbti-mustknow-sonnet-5)과 DynamoDB seen 테이블(sedaily-mbti-mustknow-
# seen-dev)은 이미 콘솔/CLI로 별도 생성 완료(2026-08-22).
set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="887078546492"
CLUSTER="sedaily-mbti-frontpage-auto"  # 재사용, 새로 안 만듦
FAMILY="sedaily-mbti-mustknow-auto"

# 태그는 CLI마다 형식이 달라 따로 둔다 — 값은 전부 동일. ECS
# register-task-definition은 소문자 key/value 셸 shorthand로 넣으면
# "Second instance of key value encountered" 파싱 에러가 나서(실제로
# 겪음) tags-ecs.json 파일로 대신 넣는다.
TAGS_KV="Key=Project,Value=Sedaily-MBTI Key=CostCenter,Value=sedaily-ai Key=ServiceName,Value=Sedaily-MBTI Key=Environment,Value=dev Key=Service,Value=mbti Key=Workload,Value=mustknow-auto Key=WorkItem,Value=atlas-4444"  # iam (대문자 Key/Value)
TAGS_EQ="Project=Sedaily-MBTI,CostCenter=sedaily-ai,ServiceName=Sedaily-MBTI,Environment=dev,Service=mbti,Workload=mustknow-auto,WorkItem=atlas-4444"  # logs
TAGS_JSON='[{"Key":"Project","Value":"Sedaily-MBTI"},{"Key":"CostCenter","Value":"sedaily-ai"},{"Key":"ServiceName","Value":"Sedaily-MBTI"},{"Key":"Environment","Value":"dev"},{"Key":"Service","Value":"mbti"},{"Key":"Workload","Value":"mustknow-auto"},{"Key":"WorkItem","Value":"atlas-4444"}]'  # events (--region 명시 필수 — 안 그러면 "Cross-region api call is not allowed" 에러)

echo "=== 1/5 IAM 역할 2개 (태스크 앱 권한 / EventBridge 호출) ==="
echo "    (execution-role은 frontpage_auto 것 재사용 — 범용 ECS 실행 권한이라 서비스별 구분 불필요)"
aws iam create-role --role-name sedaily-mbti-mustknow-auto-task-role \
  --assume-role-policy-document file://trust-policy-ecs-tasks.json \
  --tags $TAGS_KV
aws iam put-role-policy --role-name sedaily-mbti-mustknow-auto-task-role \
  --policy-name MustknowAutoAccess --policy-document file://task-policy.json

aws iam create-role --role-name sedaily-mbti-mustknow-auto-eventbridge-role \
  --assume-role-policy-document file://trust-policy-events.json \
  --tags $TAGS_KV
aws iam put-role-policy --role-name sedaily-mbti-mustknow-auto-eventbridge-role \
  --policy-name RunMustknowAutoTask --policy-document file://eventbridge-runtask-policy.json

echo "=== 2/5 CloudWatch 로그그룹 (30일 보관) ==="
aws logs create-log-group --log-group-name "/ecs/$FAMILY" --region "$REGION" --tags "$TAGS_EQ"
aws logs put-retention-policy --log-group-name "/ecs/$FAMILY" --retention-in-days 30 --region "$REGION"

echo "=== 3/5 태스크 정의 등록 (기존 이미지 재사용, workingDirectory만 다름) ==="
aws ecs register-task-definition --cli-input-json file://taskdef.json --region "$REGION" --tags file://tags-ecs.json

echo "=== 4/5 EventBridge 규칙 — 하루 6회(08/12/15/18/21/23시 KST) ==="
echo "    KST = UTC+9 → UTC로 환산: 08→전날23, 12→03, 15→06, 18→09, 21→12, 23→14"
aws events put-rule --name "${FAMILY}-6x-daily" \
  --schedule-expression "cron(0 23,3,6,9,12,14 * * ? *)" --state DISABLED \
  --description "6x daily 08 12 15 18 21 23 KST mustknow classify and publish, enable after verification" \
  --region "$REGION"
aws events tag-resource --resource-arn "arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/${FAMILY}-6x-daily" --tags "$TAGS_JSON" --region "$REGION"

echo "=== 5/5 EventBridge 타겟(위 태스크 정의 연결) ==="
aws events put-targets --rule "${FAMILY}-6x-daily" --targets file://eventbridge-target.json --region "$REGION"

echo "완료 — 규칙은 DISABLED 상태로 생성됨. 수동 run-task로 충분히 검증한 뒤"
echo "  aws events enable-rule --name ${FAMILY}-6x-daily --region $REGION"
echo "로 활성화할 것."
