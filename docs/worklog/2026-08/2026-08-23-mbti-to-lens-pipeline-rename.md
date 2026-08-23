# 2026-08-23 파이프라인 전용 AWS 리소스 mbti → lens 리네이밍 (Phase 1)

작성: Claude Code
관련: pipelines/frontpage_auto, pipelines/mustknow_auto, pipelines/common/bedrock_client.py

## 배경

제품명이 "MBTI"에서 "AI LENS"로 바뀐 지 오래인데 AWS 리소스 이름은 여전히
전부 `sedaily-mbti-*`로 남아있었다. 전체 계정을 훑어보니 S3 9개, DynamoDB
13개, Lambda ~25개, IAM 12개, CloudFront 3개(그 중 2개는 실제 공개
서비스 도메인), Cognito 유저풀, ACM 인증서, EventBridge 6개, Bedrock
inference profile 8개 등 100개가 넘는 리소스에 `mbti`가 박혀있음을 확인.
사용자가 "프로토타입 단계라 다운타임·데이터 유실 감수하고 전체 다
바꿔도 된다"고 확정(2026-08-23) — 다만 규모가 너무 커서 하루에 다 못
끝낸다고 판단, **1단계로 파이프라인 전용(실사용자에게 안 보이는) 리소스만
먼저 정리**하고 나머지(Cognito·ACM·공개 CloudFront·Lambda·S3/DynamoDB
콘텐츠 테이블 등 실서비스 데이터플레인)는 별도 작업으로 미뤘다.

## 한 것

### 새로 만든 리소스 (lens 네이밍)

| 종류 | 옛 이름/ID | 새 이름/ID |
|---|---|---|
| ECS 클러스터 | sedaily-mbti-frontpage-auto | sedaily-lens-frontpage-auto |
| ECS 태스크 정의 family | sedaily-mbti-frontpage-auto | sedaily-lens-frontpage-auto |
| ECS 태스크 정의 family | sedaily-mbti-mustknow-auto | sedaily-lens-mustknow-auto |
| ECR 리포지토리 | sedaily-mbti-frontpage-auto | sedaily-lens-frontpage-auto |
| IAM 역할 | sedaily-mbti-frontpage-auto-execution-role | sedaily-lens-frontpage-auto-execution-role |
| IAM 역할 | sedaily-mbti-frontpage-auto-task-role | sedaily-lens-frontpage-auto-task-role |
| IAM 역할 | sedaily-mbti-frontpage-auto-eventbridge-role | sedaily-lens-frontpage-auto-eventbridge-role |
| IAM 역할 | sedaily-mbti-mustknow-auto-task-role | sedaily-lens-mustknow-auto-task-role |
| IAM 역할 | sedaily-mbti-mustknow-auto-eventbridge-role | sedaily-lens-mustknow-auto-eventbridge-role |
| DynamoDB | sedaily-mbti-mustknow-seen-dev | sedaily-lens-mustknow-seen-dev (데이터 유실 — 어차피 재계산 가능한 dedup 캐시라 무해) |
| Bedrock inference profile | mbti-video-sonnet-46 (yeypch70w7ej) | lens-video-sonnet-46 (r9n8dvqc1t0r) |
| Bedrock inference profile | mbti-mustknow-sonnet-5 (bevq2226yzcq) | lens-mustknow-sonnet-5 (zmdham3vkj89) |
| EventBridge 규칙 | sedaily-mbti-frontpage-auto-daily | sedaily-lens-frontpage-auto-daily |
| EventBridge 규칙 | sedaily-mbti-mustknow-auto-6x-daily | sedaily-lens-mustknow-auto-6x-daily |
| CloudWatch 로그그룹 | /ecs/sedaily-mbti-frontpage-auto | /ecs/sedaily-lens-frontpage-auto |
| CloudWatch 로그그룹 | /ecs/sedaily-mbti-mustknow-auto | /ecs/sedaily-lens-mustknow-auto |
| SG (Bedrock VPC 엔드포인트용) | sg-016f92ece323d158a (sedaily-mbti-lens-bedrock-endpoint-sg) | sg-0f375f38878798166 (sedaily-lens-bedrock-endpoint-sg) |

VPC 엔드포인트(`vpce-0a3db42bd30a484d1`) 자체는 재생성하지 않았다 — ID가
안 바뀌니 DNS 이름(`BEDROCK_ENDPOINT_URL`)도 그대로라 코드 변경 불필요,
Name 태그만 `sedaily-lens-bedrock-runtime-vpce`로 바꾸고 위 새 SG로
갈아끼웠다.

코드 반영: `pipelines/common/bedrock_client.py`의 `MODEL_ID`,
`pipelines/mustknow_auto/classify.py`의 `MODEL`, `run.py`의
`SEEN_TABLE` 상수를 전부 새 ARN/이름으로 교체. `taskdef.json`·
`task-policy.json`·`eventbridge-target.json`·`eventbridge-runtask-
policy.json`·`deploy.sh`·`provision.sh`·`tags-ecs.json` 전부 새 이름
기준으로 갱신.

### 검증

새 인프라로 `run-task` 1회 실행 — discovery, seen 테이블 조회, Bedrock
분류(60/60건, 새 inference profile+IAM role로 정상 호출)까지 전부
새 리소스로 정상 동작 확인. 발행 단계에서 3건이 시도됐으나 **OpenAI API
크레딧 소진**(`insufficient_quota`)으로 레터 생성이 전부 실패 — 이건
이번 리네이밍과 무관한 별개 장애(플랫폼 청구 문제)라 사용자에게 별도
보고, platform.openai.com에서 크레딧 충전 필요.

### 옛 리소스 정리 (전부 삭제 완료)

EventBridge 규칙 2개(타겟 먼저 제거 후 삭제) → 옛 태스크 정의 8개
deregister(frontpage_auto 5개 리비전, mustknow_auto 2개, 진단용
mustknow-auto-diag 1개) → ECS 클러스터 삭제 → IAM 역할 5개(인라인
정책·관리형 정책 분리 후) 삭제 → DynamoDB 테이블 삭제 → Bedrock
inference profile 2개 삭제 → ECR 리포지토리 삭제(이미지 포함) →
CloudWatch 로그그룹 2개 삭제 → 옛 SG 삭제.

### 태그 정리 (전사 범위, 파이프라인 한정 아님)

Resource Groups Tagging API로 `Service=mbti` 태그가 붙은 리소스 106개를
찾아 전부 `Service=lens`, `Project=Sedaily-LENS`로 일괄 재태깅(CloudWatch
대시보드 1개는 API 미지원이라 제외 — 낮은 우선순위라 보류). 이건 태그
값만 바꾼 거라 실제 리소스 이름은 그대로다(원래 있던 리소스명 문제와는
별개 — 대부분 리소스가 애초에 태그를 거의 안 쓰고 있었다는 것도 이번에
확인).

## 결정

- **전체 리네이밍을 한 번에 하지 않고 파이프라인 전용 리소스부터** —
  Cognito 유저풀·ACM 인증서·공개 CloudFront 2개는 재생성 시 실사용자
  로그인 세션이 끊기고 도메인 SSL이 재발급/전파되는 동안 실제로 사이트가
  죽어있는 구간이 생겨서, "프로토타입이라 상관없다"는 답을 받았어도
  이 부분만은 별도로 시간 잡고 진행하는 게 맞다고 판단해 보류.
- DynamoDB 데이터는 유실 감수(사용자 확정) — seen 테이블은 dedup 캐시라
  비어도 다음 실행에서 자연히 다시 채워짐, 기능 손실 없음.

## 다음

- **Phase 2 (아직 미착수)**: 공유 리소스 — S3 9개, DynamoDB 나머지 12개
  (cms-posts, articles, engagement, subscribers 등 실 콘텐츠/구독자
  데이터), Lambda ~25개, IAM 나머지 7개, CloudFront 3개(2개는 공개
  도메인), Cognito 유저풀, ACM 인증서, API Gateway 2개, 나머지 Bedrock
  inference profile 6개(mbti-opus-46, mbti-haiku-45, mbti-eval-*,
  mbti-sonnet-46, mbti-letter-sonnet-45), SNS 토픽. 이건 실사용자
  영향이 커서 별도 세션에서 계획 세우고 진행할 것 — 특히 Cognito/ACM/
  CloudFront는 다운타임이 실제로 눈에 보이는 구간이라 언제 할지 사용자와
  먼저 맞출 것.
- 옛 OpenAI 계정 크레딧 소진 — 사용자가 platform.openai.com에서 충전해야
  레터/팟캐스트 등 OpenAI 의존 단계가 다시 동작함. 충전 후 mustknow_auto
  다음 스케줄 실행에서 정상 발행되는지 재확인 필요.
- CloudWatch 대시보드 1개(`sedaily-mbti-v2-bedrock-cost`)는 태그 API
  미지원으로 재태깅 스킵 — 필요하면 콘솔에서 수동으로.
