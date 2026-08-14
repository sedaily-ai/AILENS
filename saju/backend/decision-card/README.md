# decision-card — 오늘의 결정 카드 실시간 LLM 백엔드

`/decide` 페이지의 카드 문구를 Bedrock Claude 로 생성하는 Lambda(Function URL).
정적 사이트는 브라우저에서 Bedrock 을 직접 부를 수 없으므로(AWS 키 노출), 이 Lambda 가 대리 호출한다.

프런트 연동: `frontend/src/features/decision-card/lib/llm.ts`
→ `NEXT_PUBLIC_DECISION_API_URL` 에 이 Lambda 의 Function URL 을 넣으면 활성화. **미설정 시 로컬 mock(`deckEngine.ts`)으로 폴백(비용 $0).**

## 요청/응답
`POST` JSON `{ lang, decisionText, chosenOption, personaId, saju: { ilganOh } }` → `{ text }`
- `chosenOption`: `yes` | `no` | `maybe` | `later`
- `personaId`: `wise` | `bold` | `calm` | `kind`
- `saju.ilganOh`: `목` | `화` | `토` | `금` | `수` (없으면 목 기본)
- 응답 `text` 는 1~2문장, 카드에 새길 짧은 문구

## 모델 (env `BEDROCK_MODEL_ID`)
| 용도 | 값 |
|------|-----|
| **테스트(기본)** | `anthropic.claude-haiku-4-5` |
| 운영 | `anthropic.claude-sonnet-4-6` |

기타 env: `MAX_TOKENS`(기본 150 — 카드 문구는 짧게), `ALLOW_ORIGIN`(기본 `https://saju.sedaily.ai`), `AWS_REGION`(기본 us-east-1).

## 로컬 테스트 (`npm run dev` — Lambda 배포 불필요)
```bash
pip install boto3                       # 최초 1회 (chat-bedrock 로 이미 설치했다면 생략)
cd scripts/backend/lambda/decision-card
BEDROCK_MODEL_ID=anthropic.claude-haiku-4-5 python3 local_server.py   # → http://localhost:8788/

# 다른 터미널
cd frontend
echo 'NEXT_PUBLIC_DECISION_API_URL=http://localhost:8788/' >> .env.local
npm run dev                              # http://localhost:3000/decide 에서 실제 LLM 카드 생성
```
끝나면 `.env.local` 의 그 줄을 지우면 mock(무비용)으로 폴백. 전제: AWS 자격증명 + 해당 리전에서 그 모델의 Bedrock 액세스 허용.

## 배포
`saju-chat-bedrock` 과 동일 IAM 역할(`bedrock:InvokeModel` 권한 보유)을 재사용한다 — 새 역할 안 만들어도 됨.
```bash
cd scripts/backend/lambda/decision-card
zip fn.zip handler.py
aws lambda create-function \
  --function-name saju-decision-card \
  --runtime python3.12 --handler handler.handler \
  --role arn:aws:iam::887078546492:role/saju-chat-bedrock-role \
  --timeout 15 --memory-size 256 \
  --environment "Variables={BEDROCK_MODEL_ID=anthropic.claude-haiku-4-5,ALLOW_ORIGIN=https://saju.sedaily.ai}" \
  --zip-file fileb://fn.zip --region us-east-1
# Function URL 생성 (CORS 는 핸들러가 직접 처리)
aws lambda create-function-url-config \
  --function-name saju-decision-card --auth-type NONE --region us-east-1
```
코드 갱신: `zip fn.zip handler.py && aws lambda update-function-code --function-name saju-decision-card --zip-file fileb://fn.zip --region us-east-1`.

## ⚠️ 운영 주의
- **남용/비용 방지**: `auth-type NONE` 공개 엔드포인트는 누구나 호출 가능 → 실시간 비용 발생. 운영 전 CloudFront 앞단 rate limit / WAF 검토. `MAX_TOKENS` 로 1회 출력 상한(카드는 짧아야 하므로 150으로 낮게 고정).
- **$0 원칙**: 이 백엔드를 붙이는 순간 카드 1장당 비용이 발생한다. 엔드포인트 미설정 시 프런트는 `deckEngine.ts` mock 으로 동작해 비용 0 을 유지한다.
