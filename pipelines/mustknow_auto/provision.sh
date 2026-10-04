#!/usr/bin/env bash
# 필수뉴스 자동 발행 파이프라인의 AWS 인프라 최초 프로비저닝 기록.
# CloudFormation/CDK 없이 aws cli로 순서대로 실행한 내용을 남긴 스크립트이며,
# 이미 만들어진 리소스에는 "already exists" 에러가 나므로 기록용이다.
#
# frontpage_auto와 ECR 리포지토리·Docker 이미지·ECS 클러스터를 공유한다. Dockerfile이
# pipelines/ 전체를 복사하므로 taskdef.json의 workingDirectory 오버라이드만으로
# 같은 이미지에서 다른 진입점을 실행한다. Bedrock inference profile
# (lens-mustknow-sonnet-5)과 DynamoDB seen 테이블(sedaily-lens-mustknow-seen-dev)은
# 이 스크립트 밖에서 별도로 생성돼 있다.
set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="887078546492"
CLUSTER="sedaily-lens-frontpage-auto"  # 재사용, 새로 안 만듦
FAMILY="sedaily-lens-mustknow-auto"

# 태그 형식은 CLI마다 달라 변수를 따로 둔다(값은 동일). ECS register-task-definition에
# 소문자 key/value shorthand를 쓰면 "Second instance of key value encountered" 파싱
# 에러가 나므로 tags-ecs.json 파일로 넣는다.
#
# 미래전략부 Atlas 크레딧 집계는 활성 비용할당 태그인 Service 키를 읽고, atlas* 접두어를
# Atlas 작업으로 집계한다(mustknow 체인은 lane 4). WorkItem은 payer 비용할당 태그로
# 활성화돼 있지 않아 청구 데이터에 나타나지 않으며 담당자 내부 마커일 뿐이다.
# 주의: 크레딧 지원 종료일(2026-09-30) 이후 SERVICE_TAG를 "lens"로 되돌리고
# tags-ecs.json의 Service 값도 함께 바꾼다.
SERVICE_TAG="atlas4"  # 9/30 이후 "lens"

TAGS_KV="Key=Project,Value=Sedaily-LENS Key=CostCenter,Value=sedaily-ai Key=ServiceName,Value=Sedaily-LENS Key=Environment,Value=dev Key=Service,Value=${SERVICE_TAG} Key=Workload,Value=mustknow-auto Key=WorkItem,Value=atlas-4444"  # iam (대문자 Key/Value)
TAGS_EQ="Project=Sedaily-LENS,CostCenter=sedaily-ai,ServiceName=Sedaily-LENS,Environment=dev,Service=${SERVICE_TAG},Workload=mustknow-auto,WorkItem=atlas-4444"  # logs
TAGS_JSON="[{\"Key\":\"Project\",\"Value\":\"Sedaily-LENS\"},{\"Key\":\"CostCenter\",\"Value\":\"sedaily-ai\"},{\"Key\":\"ServiceName\",\"Value\":\"Sedaily-LENS\"},{\"Key\":\"Environment\",\"Value\":\"dev\"},{\"Key\":\"Service\",\"Value\":\"${SERVICE_TAG}\"},{\"Key\":\"Workload\",\"Value\":\"mustknow-auto\"},{\"Key\":\"WorkItem\",\"Value\":\"atlas-4444\"}]"  # events (--region 명시 필수 — 안 그러면 "Cross-region api call is not allowed" 에러)

echo "=== 1/5 IAM 역할 2개 (태스크 앱 권한 / EventBridge 호출) ==="
echo "    (execution-role은 frontpage_auto 것 재사용 — 범용 ECS 실행 권한이라 서비스별 구분 불필요)"
aws iam create-role --role-name sedaily-lens-mustknow-auto-task-role \
  --assume-role-policy-document file://trust-policy-ecs-tasks.json \
  --tags $TAGS_KV
aws iam put-role-policy --role-name sedaily-lens-mustknow-auto-task-role \
  --policy-name MustknowAutoAccess --policy-document file://task-policy.json

aws iam create-role --role-name sedaily-lens-mustknow-auto-eventbridge-role \
  --assume-role-policy-document file://trust-policy-events.json \
  --tags $TAGS_KV
# 정책 이름은 라이브 AWS 값("eventbridge-runtask")과 일치시킨다. 다른 이름으로 재실행하면
# 같은 내용의 정책이 둘 붙어 권한 감사 때 혼란이 생긴다.
#
# 이 정책에는 ecs:TagResource가 필요하다. EventBridge 타깃에 PropagateTags=TASK_DEFINITION을
# 쓰면 RunTask가 태스크에 태그를 붙이는데, 권한이 없으면 RunTask 자체가 실패한다.
# 권한을 먼저 넣고 put-targets를 적용한다.
aws iam put-role-policy --role-name sedaily-lens-mustknow-auto-eventbridge-role \
  --policy-name eventbridge-runtask --policy-document file://eventbridge-runtask-policy.json

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
# eventbridge-target.json의 PropagateTags=TASK_DEFINITION은 필수이다. 없으면 RunTask로 뜨는
# Fargate 태스크에 태그가 붙지 않아 컴퓨트 비용이 미태깅(Not Applicable)으로 집계된다
# (태스크 정의 태그와 실행 태스크 태그는 별개).
#
# 순서 의존: 1/5의 ecs:TagResource 권한이 먼저 있어야 한다. 없으면 RunTask가 실패해
# 6x-daily 배치가 멈춘다. 적용 후 다음 실행에서 실제 태스크에 태그가 붙었는지 확인한다
# (put-targets 성공만으로 판정하지 않는다).
#   aws ecs list-tags-for-resource --resource-arn <실행된 task ARN> --region us-east-1
aws events put-targets --rule "${FAMILY}-6x-daily" --targets file://eventbridge-target.json --region "$REGION"

echo "완료 — 규칙은 DISABLED 상태로 생성됨. 수동 run-task로 충분히 검증한 뒤"
echo "  aws events enable-rule --name ${FAMILY}-6x-daily --region $REGION"
echo "로 활성화할 것."
