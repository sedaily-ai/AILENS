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
# (lens-mustknow-sonnet-5)과 DynamoDB seen 테이블(sedaily-lens-mustknow-
# seen-dev)은 이미 콘솔/CLI로 별도 생성 완료(2026-08-22).
#
# 2026-08-23 — 리소스명에서 "mbti"를 걷어내는 작업으로 sedaily-mbti-* →
# sedaily-lens-*로 전부 재생성했다(구 리소스는 데이터 유실 감수하고 삭제 —
# 아직 프로토타입 단계라 다운타임/데이터 손실 허용된 상태에서 진행).
# 이 스크립트도 그 새 이름 기준으로 갱신 — 실제로는 이미 만들어진
# 리소스라 재실행하면 대부분 "already exists" 에러가 난다(최초 셋업
# 기록용, deploy.sh 참고는 이미지 갱신용).
set -euo pipefail

REGION="us-east-1"
ACCOUNT_ID="887078546492"
CLUSTER="sedaily-lens-frontpage-auto"  # 재사용, 새로 안 만듦
FAMILY="sedaily-lens-mustknow-auto"

# 태그는 CLI마다 형식이 달라 따로 둔다 — 값은 전부 동일. ECS
# register-task-definition은 소문자 key/value 셸 shorthand로 넣으면
# "Second instance of key value encountered" 파싱 에러가 나서(실제로
# 겪음) tags-ecs.json 파일로 대신 넣는다.
#
# 2026-08-24 — Service 태그를 lens → atlas4 로 변경. 미래전략부 Atlas 크레딧
# 지원(8~9월) 집계는 활성 비용할당 태그인 Service 키를 읽고, atlas* 접두어가
# Atlas 작업으로 집계된다. mustknow 체인은 lane 4다. WorkItem=atlas-4444 는
# 담당자 내부 마커로 유지하지만, WorkItem 키는 payer 비용할당 태그로 활성화돼
# 있지 않아 청구 데이터에 나타나지 않는다 — 집계에 실제로 잡히는 것은 Service 뿐.
# Atlas lane 원복(AI-dashboard ops/atlas-lane-rollback) — Service 를 lens 로 되돌렸다.
#    tags-ecs.json 의 Service 값도 같은 변경에서 lens 로 바꿨다. 다시 atlas4 를 넣지 않는다.
SERVICE_TAG="lens"

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
# 정책 이름은 라이브와 일치시킨다 — 2026-08-24 확인 시 AWS 에는 "eventbridge-runtask" 로
# 붙어 있었고 이 스크립트만 "RunMustknowAutoTask" 였다. 그대로 재실행하면 같은 내용의
# 정책이 두 개(이름만 다르게) 붙어 권한 감사 때 혼란이 생긴다.
#
# 이 정책에는 ecs:TagResource 가 필요하다. EventBridge 타깃에
# PropagateTags=TASK_DEFINITION 을 쓰면 RunTask 가 태스크에 태그를 붙이는데, 그 권한이
# 없으면 RunTask 자체가 실패한다. 권한을 먼저 넣고 그 다음에 put-targets 를 적용할 것.
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
# eventbridge-target.json 의 PropagateTags=TASK_DEFINITION 는 필수다. 이게 없으면
# RunTask 로 뜨는 Fargate 태스크에 태그가 하나도 안 붙어서 컴퓨트 비용이 전부
# 미태깅(Not Applicable)으로 샌다 — task definition 을 태깅해도 실행 태스크는
# 별개다. 2026-08-24 에 실제로 이 상태였던 것을 확인하고 추가했다.
#
# ⚠ 순서 의존: 위 1/5 의 ecs:TagResource 권한이 먼저 들어가 있어야 한다. 권한 없이
# PropagateTags 를 적용하면 RunTask 가 실패해 6x-daily 배치가 멈춘다.
# 적용 후에는 다음 실행에서 실제 태스크에 태그가 붙었는지 확인할 것:
#   aws ecs list-tags-for-resource --resource-arn <실행된 task ARN> --region us-east-1
# put-targets 성공만으로 판정하지 않는다.
aws events put-targets --rule "${FAMILY}-6x-daily" --targets file://eventbridge-target.json --region "$REGION"

echo "완료 — 규칙은 DISABLED 상태로 생성됨. 수동 run-task로 충분히 검증한 뒤"
echo "  aws events enable-rule --name ${FAMILY}-6x-daily --region $REGION"
echo "로 활성화할 것."
