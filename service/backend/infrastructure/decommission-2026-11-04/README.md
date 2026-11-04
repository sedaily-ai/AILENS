# Lambda·DynamoDB 정리 기록 — 2026-11-04

DB 구조 단순화(DynamoDB 축소)의 일부. 미사용 Lambda 15개와 DynamoDB 테이블 11개를 **백업 → 1주일 차단 → 삭제** 순서로 정리한다. 이 디렉터리는 되돌릴 수 있게 남기는 기록이다. 형식은 [`../decommission-2026-07-30/README.md`](../decommission-2026-07-30/README.md)를 따른다.

## 진행 상태

| 단계 | 상태 |
|---|---|
| 1. 백업 (Lambda 설정·코드, API 경로, 스케줄, DynamoDB) | 완료 2026-11-04 |
| 2. 차단 (Lambda 실행 한도 0, 브리핑 스케줄 끄기, 워밍에서 post-dev 제외) | 완료 2026-11-04. 확인: 차단된 `/api/v2/external-content` → 503, 남긴 `/api/v2/health`·`/time-machine` → 200 |
| 3a. 즉시 삭제 (30일 실호출 0·호출 코드 없음) | 완료 2026-11-04 — Lambda 6개(voice-tts, voice-stt-presign, voice-stt-url, external-content, newsletter-subscribe, post) + `chzwwtjtgk` 경로 14개·통합 7개 + DynamoDB 6개(cms-posts, engagement, external-content, podcast, quiz-questions, ws-connections). 확인: `/api/v2/health`·`/time-machine` 200, 삭제 경로 404, DynamoDB 백업 11개 유지 |
| 3b. 1주일 관찰 후 삭제 | 대기 — 2026-11-11 이후. Lambda 9개(v2-posts, v2-quiz, article, chatbot, ws 3개, question, briefing) + DynamoDB 5개(personal, admin-config, mustknow-seen, daily-letters, newsletter-subscribers). 관찰: `Throttles` 지표 |

## 판단 근거 (2026-11-03~04 조회)

- CloudWatch `AWS/Lambda Invocations` 30일. `sedaily-mbti-lambda-warming`(5분마다, post·search·time-machine)이 30일에 8,640회를 자동으로 쌓으므로 **차감 후** 판단했다. post-dev 8,640회 = 전부 워밍.
- API Gateway 실제 경로(`apigatewayv2 get-routes`)와 Lambda 리소스 정책, EventBridge 대상.
- 프론트(`service/frontend`), 모바일(`apps/mobile`), 공용 클라이언트(`packages/api-client`), 관리자(`admin/`), 파이프라인 코드에서 경로 호출 여부 검색.
- 글 목록(`/api/v2/posts`)과 퀴즈(`/api/quiz`)는 프론트가 lens-cms-api(`CMS_API_URL`)를 부른다 — 옛 Lambda 경로는 안 쓴다.
- HTTP API `chzwwtjtgk`(stage `dev`, AutoDeploy=True)는 LENS 전용이다(다른 서비스 경로 0개, 11/4 확인). 처음엔 다른 서비스와 공유한다고 적었으나 정정 — `seodaily-eng-*` 경로 112개는 REST API `7w5nco7xn4`에 있고, 거기엔 LENS `POST /api/search`(search-dev)도 함께 있다. 그래도 API 전체가 아니라 대상 함수로 가는 경로·통합만 ID로 제거했다.

## 대상 Lambda (15)

| 함수 | 30일 실호출 | 연결 |
|---|---|---|
| `sedaily-mbti-voice-tts-dev` | 0 | `POST /api/voice/tts` |
| `sedaily-mbti-voice-stt-presign-dev` | 0 | `POST /api/voice/stt-presign` |
| `sedaily-mbti-voice-stt-url-dev` | 0 | `GET /api/voice/stt-url` (7/30엔 voice-tts와 짝이라 남겼으나 이제 셋 다 0, 호출 코드 없음) |
| `sedaily-mbti-external-content-dev` | 0 | `GET /api/v2/external-content[/{id}]` |
| `sedaily-mbti-newsletter-subscribe-dev` | 0 | `POST /api/newsletter/subscribe` (v2-subscribe가 대체) |
| `sedaily-mbti-post-dev` | 0 (워밍 8,640) | `/api/posts*` 5개, 워밍 대상 |
| `sedaily-mbti-v2-posts-dev` | 6 (마지막 10/22) | `GET /api/v2/posts[/{slug}]` — `CMS_DB_BACKEND` 미설정이라 DynamoDB 사본을 읽던 함수 |
| `sedaily-mbti-v2-quiz-dev` | 18 (마지막 10/6) | `/api/quiz/*` — lens-cms-api가 대체 |
| `sedaily-mbti-article-dev` | 1 | `GET /api/article/{id}`, `GET /api/articles` |
| `sedaily-mbti-chatbot-dev` | 3 | `POST /api/chat` — 프론트 호출 코드 없음 |
| `sedaily-mbti-ws-connect-dev` / `-ws-disconnect-dev` / `-ws-message-dev` | 각 1 (10/8) | WebSocket API `8181gs7j41` (관리자 채팅 `p4yjifd5v1`과는 별개) |
| `sedaily-mbti-question-dev` | 449 (마지막 10/14) | `/api/questions` — 10/14 이후 0, 호출 코드 없음 |
| `sedaily-mbti-briefing-dev` | 60 (스케줄) | `sedaily-mbti-daily-briefing`, `sedaily-mbti-afternoon-briefing` — 결과를 읽는 곳이 chatbot뿐 |

### 남긴 것

- `sedaily-mbti-v2-health-dev` — 호출 0이지만 7/30 결정 그대로(장애 대응용 헬스 엔드포인트).
- `sedaily-mbti-search-dev` — 실호출 2회지만 별도 REST API `7w5nco7xn4`에 물려 있어 다음에 따로 확인.
- 그 외 dashboard·archive·admin-api·time-machine·timeline·user·s3-articles(관리자 영상 리메이크)·today-letters·v2-subscribe·article-collector·timemachine-newspaper-capture는 사용 중.

## 대상 DynamoDB (11)

30일 읽기·쓰기 0 또는 10월 초·중순 이후 멈춤. 백업 ARN은 [`dynamodb-backups.txt`](dynamodb-backups.txt).

`sedaily-mbti-cms-posts-dev`, `-daily-letters-dev`, `-engagement-dev`, `-external-content-dev`, `-podcast-dev`, `-quiz-questions-dev`, `-ws-connections-dev`, `-personal-dev`(10/14 멈춤), `-admin-config-dev`(10/9 멈춤, admin-api `JOBS_BACKEND=pg`), `-newsletter-subscribers-dev`(v2-subscribe 환경변수에 이름이 남아 있어 마지막에), `sedaily-lens-mustknow-seen-dev`(10/9 멈춤).

**남김**: `sedaily-mbti-articles-dev`(타임머신 캐시, 매일 사용, TTL 꺼짐), `sedaily-mbti-admin-prompts-dev`(10/26 읽힘 — 읽는 코드 미확인).

DynamoDB 자체 백업(on-demand)은 태그를 붙일 수 없다(`TagResource`가 백업 ARN 거부). 11개 합계 약 30MB, 보관비 월 약 $0.003이라 미태깅으로 둔다.

## 파일

| 파일 | 내용 |
|---|---|
| `configs/<함수>.json` | `aws lambda get-function` 전체 응답. 코드 presigned URL 제거, 이름에 PASS·SECRET·TOKEN·KEY가 든 환경변수는 `<<REDACTED>>` |
| `configs/<함수>.policy.json` | Lambda 리소스 정책(누가 호출할 수 있었는지) |
| `apigw-snapshot.json` | 대상 함수로 가는 통합 15개·경로 32개(`chzwwtjtgk` 29, `8181gs7j41` 3) |
| `eventbridge-snapshot.json` | 브리핑 스케줄 2개, 워밍 규칙(대상 ID 포함) |
| `before-state.json` | 함수별 예약 동시성(전부 미설정), 가린 환경변수 이름 |
| `dynamodb-backups.txt` | 테이블별 백업 ARN |

코드 zip(15개, 337MB)은 저장소에 두지 않고 로컬 `~/ailens-lambda-archive-2026-11-04/code/`에 보관.

### ⚠️ 가린 값

`post`·`article`·`chatbot`·`question`의 `LENS_CMS_API_TOKEN`, `v2-posts`의 `LENS_PG_PASSWORD`. **`v2-posts`는 운영 Postgres 비밀번호를 환경변수에 평문으로 들고 있었다**(7/30 정리 때 빠진 함수). 함수를 지우면 노출도 같이 사라진다. 복원 시엔 운영자가 직접 다시 넣어야 한다.

## 복원

차단만 되돌리기(2단계 취소):

```bash
aws lambda delete-function-concurrency --function-name <함수> --profile sedaily --region us-east-1
aws events enable-rule --name sedaily-mbti-daily-briefing --profile sedaily --region us-east-1
aws events enable-rule --name sedaily-mbti-afternoon-briefing --profile sedaily --region us-east-1
aws events put-targets --rule sedaily-mbti-lambda-warming --profile sedaily --region us-east-1 \
  --targets Id=sedaily-mbti-post-dev,Arn=arn:aws:lambda:us-east-1:887078546492:function:sedaily-mbti-post-dev
```

삭제 후 복원은 7/30 README의 "복원 방법"과 같다(설정 JSON + 로컬 zip으로 `create-function`, `apigw-snapshot.json`으로 경로·통합·권한 재생성). DynamoDB는 `aws dynamodb restore-table-from-backup --target-table-name <이름> --backup-arn <ARN>`.
