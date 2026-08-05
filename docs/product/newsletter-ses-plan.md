# AI LENS 뉴스레터 (AWS SES) — 리소스 생성 계획서

> .clauderules (a) 문서화 계획. 이 문서 + 사용자 명시 승인 전에는 어떤 AWS 리소스도 생성하지 않는다.
> 작성 2026-05-17 / 브랜치 feat/ses-newsletter / 계정 887078546492(ai_nova)

## 1. 목적

매일 아침 구독자가 고른 에디터(NT 민철 / NF 하은 / ST 준서 / SF 소율)의
"오늘의 한 통"을 이메일로 발송. 데이터는 기존 v2 daily_letters 재사용.

## 2. 현실 블로커 (생성 전 해소 필요)

- **SES 샌드박스** — `ProductionAccessEnabled: false`. 검증 수신자에게만 일 200건.
  실구독자 발송은 AWS 프로덕션 액세스 요청(심사 ~24h, ops/박예빈) 후 가능.
- **검증 발신 도메인 없음** — `letter@mbti.sedaily.ai` 미존재. DKIM 검증 선행 필요.
- → Phase 1(코드·dry-run)은 블로커와 무관하게 진행 가능. 실발송만 Phase 2.

## 3. 생성 대상 리소스 + 파라미터 + 비용

| 리소스 | 이름/파라미터 | 생성 방식 | 월 비용(추정) |
|---|---|---|---|
| DynamoDB | `sedaily-mbti-newsletter-subscribers-dev` · PK `email`(S) · GSI `group-index`(mbti_group) · PAY_PER_REQUEST | 콘솔/CLI(승인 후) | 구독 1만 기준 ~$0 (온디맨드, 일 1회 스캔 미미) |
| Lambda | `sedaily-mbti-v2-newsletter-dev` · python3.11 · 512MB · timeout 300s · 기존 v2 lambda role 재사용 | **수동 생성(.clauderules — 함수 identity 콘솔)** | 일 1회 ~수초 → ~$0 |
| EventBridge | `sedaily-mbti-v2-newsletter-schedule` · `cron(0 22 * * ? *)` = KST 07:00 | CLI(승인 후) | $0 |
| SES 발신 ID | 도메인 `mbti.sedaily.ai`(또는 결정값) DKIM 검증 | CLI + DNS(ops) | $0 (발송 1천건당 $0.10) |
| SES Config Set | `ailens-newsletter` · 이벤트(bounce/complaint/delivery) → SNS → 억제 | CLI(승인 후) | $0 |
| SNS | `sedaily-mbti-newsletter-events` (반송/스팸 처리) | CLI(승인 후) | $0 |

발송 비용: SES $0.10 / 1,000건. 구독 1만 × 일 1회 = 월 ~30만건 ≈ **$30/월**. 그 외 ~$0.

## 4. IAM

기존 v2 Lambda 실행 role에 정책 추가(승인 후, 최소권한):
`ses:SendEmail`, `ses:SendBulkEmail`, `dynamodb:Query/Scan/UpdateItem`(구독자 테이블 한정 ARN),
`sns:Publish`(이벤트 토픽). secret env 쓰기는 항상 수동.

## 5. 단계

- **Phase 1 (코드, 승인 불요 — AWS 생성 0)**: 핸들러·렌더·구독자/발송 모듈·HTML 템플릿·deploy-v2.sh 등록·로컬 dry-run. ← 본 브랜치 작업
- **Phase 0 (ops 병행)**: 발신 도메인 DKIM 검증 + SES 프로덕션 액세스 요청
- **Phase 2 (승인 후 생성)**: 위 표 리소스 생성(announce+ID추적) → 검증 주소 실송 테스트 → 구독자 연결 → 운영

## 6. 안전장치

- `NEWSLETTER_DRY_RUN=1`(기본): SES 미호출, 렌더 결과 로그만. 실발송은 명시적으로 0 설정 + 프로덕션 액세스 후.
- 수신거부: 모든 메일에 1클릭 unsubscribe(토큰) + `List-Unsubscribe` 헤더 (CAN-SPAM/법적 필수).
- 반송·스팸신고 → SNS → 구독자 status=suppressed 자동 갱신.
- 발송 전 구독자 `status=active AND consent=true` 필터 강제.

## 7. Phase 2/B3 실행 런북 (사용자 직접 — 에이전트 가드 차단분)

세션 진행 상태: 코드·테이블·검증 완료. 아래는 에이전트 자동가드가 막아
사용자가 콘솔/CLI로 직접 해야 하는 것. (`region us-east-1`, account 887078546492)

이미 완료(에이전트): DynamoDB `sedaily-mbti-newsletter-subscribers-dev` 생성·테스트행,
SES identity `mbti.sedaily.ai` 생성(+DKIM 검증·프로덕션 액세스 True), 실발송 1건 검증,
핸들러/구독API/프런트 폼/deploy-v2.sh 등록.

### B3-1. IAM (역할에 인라인 정책 추가)
```
aws iam put-role-policy --role-name sedaily-mbti-v2-collector-dev-role-nbf99tic \
  --policy-name NewsletterSesDdb --policy-document '{"Version":"2012-10-17","Statement":[
   {"Sid":"NewsletterSES","Effect":"Allow","Action":["ses:SendEmail"],"Resource":"*"},
   {"Sid":"NewsletterSubscribersDDB","Effect":"Allow","Action":["dynamodb:GetItem","dynamodb:PutItem","dynamodb:UpdateItem","dynamodb:Query","dynamodb:Scan"],
    "Resource":["arn:aws:dynamodb:us-east-1:887078546492:table/sedaily-mbti-newsletter-subscribers-dev",
                "arn:aws:dynamodb:us-east-1:887078546492:table/sedaily-mbti-newsletter-subscribers-dev/index/*"]}]}'
```

### B3-2. Lambda 함수 2개 — 콘솔 수동 생성(.clauderules: 함수 identity 콘솔)
공통: python3.11 / x86_64 / 역할 `service-role/sedaily-mbti-v2-collector-dev-role-nbf99tic`

| 함수 | handler | timeout | mem | env |
|---|---|---|---|---|
| `sedaily-mbti-v2-subscribe-dev` | `v2.handlers.subscribe.lambda_handler` | 30 | 256 | `SUBSCRIBERS_TABLE=sedaily-mbti-newsletter-subscribers-dev` |
| `sedaily-mbti-v2-newsletter-dev` | `v2.handlers.newsletter.lambda_handler` | 300 | 512 | PG_V2_*(today-letters Lambda 복사) + `S3_ARTICLE_BODY_V2_BUCKET=sedaily-mbti-article-body-v2-dev` + `SUBSCRIBERS_TABLE=...` + `NEWSLETTER_FROM=AI LENS <letter@mbti.sedaily.ai>` + `NEWSLETTER_CONFIG_SET=`(빈값) + `NEWSLETTER_DRY_RUN=1` |

생성 후 코드 업로드: `cd service/backend && ./v2/deploy-v2.sh subscribe && ./v2/deploy-v2.sh newsletter`

### B3-3. API Gateway (HTTP API chzwwtjtgk) 라우트
`POST /api/v2/subscribe`, `GET /api/v2/unsubscribe` → `sedaily-mbti-v2-subscribe-dev` 통합,
CORS allow-origin `https://mbti.sedaily.ai`. (콘솔: API chzwwtjtgk → Routes → Create)

### B3-4. (A) EventBridge — 뉴스레터 일 1회
규칙 `sedaily-mbti-v2-newsletter-schedule` `cron(0 22 * * ? *)`(KST 07:00)
→ target `sedaily-mbti-v2-newsletter-dev`, lambda add-permission(events.amazonaws.com).
실발송 전환: 테스트 1회 `NEWSLETTER_DRY_RUN=0` 수동 invoke 확인 후 env를 0으로.

### B3-5. (C) 발송 이력/평판 (후속)
SES configuration set `ailens-newsletter` + SNS `sedaily-mbti-newsletter-events`
(bounce/complaint/delivery) → 구독자 status=suppressed 자동화. 그 후
Lambda env `NEWSLETTER_CONFIG_SET=ailens-newsletter`.

> 에이전트가 위 IAM/APIGW/EventBridge CLI를 실행하려면 사용자가
> `.claude/settings.local.json` 에 해당 Bash 허용 룰 추가 필요(가드는 에이전트가 못 풂).
> Lambda 함수 최초 생성은 룰과 무관하게 항상 콘솔 수동(.clauderules 하드룰).

## 배포 진행 로그 (2026-05-17)

[완료]
- B3-1 IAM: NewsletterSesDdb 정책 attach 완료 (NewsletterSES + NewsletterSubscribersDDB Sid)
- B3-2 Lambda: subscribe-dev / newsletter-dev 둘 다 Active
  (python3.11, role=sedaily-mbti-v2-collector-dev-role-nbf99tic, same zip lambda_package_v2.zip)
- B3-3 API GW: 라우트 2개 등록 완료
  - POST /api/v2/subscribe → subscribe-dev Lambda
  - GET /api/v2/unsubscribe → subscribe-dev Lambda
  - integration AWS_PROXY 2.0, AutoDeploy=True (dev 스테이지)
  - lambda:InvokeFunction permission (statement-id=apigw-subscribe) 부여
  - API ID: chzwwtjtgk, source-arn 와일드카드

[막힌 지점]
- curl https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev/api/v2/subscribe
  → 500 Internal Server Error
- CloudWatch 로그 아직 안 본 상태
- 다음 세션 첫 명령: aws logs tail /aws/lambda/sedaily-mbti-v2-subscribe-dev
  --region us-east-1 --since 10m --format short

[남은 작업]
- B3-3 디버깅: 500 원인 파악 (페이로드 파싱 / IAM / 코드 의존성 중)
- B3-4 EventBridge: newsletter Lambda를 cron 스케줄로 트리거 (스펙 §7 B3-4)
- B3-5 실발송 검증: DRY_RUN=1 → 0 전환, SES 실송신 1건 확인

[학습된 패턴 — 향후 마이크로서비스 배포 시 적용]
- ! 명령 인라인 JSON 깨짐 → heredoc 또는 file:// 방식 사용
- 출력은 요약 X, 통째로 핸드오프 (NoSuchEntity 루프 방지)
- AutoDeploy=True 사전 확인 시 create-deployment 불필요
- 같은 Lambda + 같은 integration으로 여러 라우트 가능 (핸들러가 path/method 분기)
