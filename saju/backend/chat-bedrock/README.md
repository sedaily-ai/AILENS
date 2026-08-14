# chat-bedrock — 사주 챗봇 실시간 LLM 백엔드

사주 챗봇의 **자유 입력 의도분류 + 매듭 서술 생성**을 Bedrock Claude 로 처리하는 Lambda(Function URL).
정적 사이트는 브라우저에서 Bedrock 을 직접 부를 수 없으므로(AWS 키 노출), 이 Lambda 가 대리 호출한다.

프런트 연동: [frontend/src/features/chatbot/lib/llm.ts](../../../../frontend/src/features/chatbot/lib/llm.ts)
→ `NEXT_PUBLIC_CHAT_API_URL` 에 이 Lambda 의 Function URL 을 넣으면 활성화. **미설정 시 챗봇은 기존 템플릿으로 폴백(비용 $0).**

## 요청/응답
`POST` JSON `{ task, lang, saju, concern?, narrowAnswers?, prior?, eraFacts?, userText? }` → `{ text }`
- `task`: `classify` | `hit` | `overlay` | `knot`
- `classify` 의 `text` 는 `career|money|relationship|overwhelmed|none` 중 하나

## 모델 (env `BEDROCK_MODEL_ID`)
Bedrock 모델 ID 는 `anthropic.` 접두사 사용:
| 용도 | 값 |
|------|-----|
| **테스트(기본)** | `anthropic.claude-haiku-4-5` |
| 운영 | `anthropic.claude-sonnet-4-6` |
| 운영(고품질) | `anthropic.claude-opus-4-8` |

기타 env: `MAX_TOKENS`(기본 400), `ALLOW_ORIGIN`(기본 `https://saju.sedaily.ai`), `AWS_REGION`(기본 us-east-1).

## 로컬 테스트 (`npm run dev` — Lambda 배포 불필요)
로컬 AWS 자격증명으로 Bedrock 을 직접 부르는 작은 서버를 띄워 dev 에서 바로 시험한다.
```bash
pip install boto3                       # 최초 1회
cd scripts/backend/lambda/chat-bedrock
BEDROCK_MODEL_ID=anthropic.claude-haiku-4-5 python3 local_server.py   # → http://localhost:8787/

# 다른 터미널
cd frontend
echo 'NEXT_PUBLIC_CHAT_API_URL=http://localhost:8787/' >> .env.local
npm run dev                              # http://localhost:3000/chat 에서 자유 입력이 LLM 으로 동작
```
끝나면 `.env.local` 의 그 줄을 지우면 템플릿(무비용)으로 폴백. 전제: AWS 자격증명 + 해당 리전에서 그 모델의 Bedrock 액세스 허용.

## 배포 (예시)
```bash
cd scripts/backend/lambda/chat-bedrock
zip fn.zip handler.py
aws lambda create-function \
  --function-name saju-chat-bedrock \
  --runtime python3.12 --handler handler.handler \
  --role <bedrock-invoke-가능한-IAM-역할-ARN> \
  --timeout 30 --memory-size 256 \
  --environment "Variables={BEDROCK_MODEL_ID=anthropic.claude-haiku-4-5,ALLOW_ORIGIN=https://saju.sedaily.ai}" \
  --zip-file fileb://fn.zip --region us-east-1
# Function URL 생성 (CORS 는 핸들러가 직접 처리)
aws lambda create-function-url-config \
  --function-name saju-chat-bedrock --auth-type NONE --region us-east-1
```
IAM 역할에는 `bedrock:InvokeModel` 권한 필요. 코드 갱신: `zip fn.zip handler.py && aws lambda update-function-code --function-name saju-chat-bedrock --zip-file fileb://fn.zip`.

## ⚠️ 운영 주의
- **남용/비용 방지**: `auth-type NONE` 공개 엔드포인트는 누구나 호출 가능 → 실시간 비용 발생. 운영 전 **CloudFront 앞단 rate limit / WAF, 또는 간단한 토큰 헤더 검증**을 둘 것. `MAX_TOKENS` 로 1회 출력 상한.
- **데이터 무결성**: `eraFacts` 는 예시 데이터다. 시스템 프롬프트가 "단정 통계 금지"를 명시하지만, **서울경제 실데이터 연동(`eraFacts.ts` 교체) 전까지는 통계 수치를 사실처럼 노출하지 말 것.**
- **$0 원칙**: 이 백엔드를 붙이는 순간 메시지당 비용이 발생한다(사이트 핵심 원칙에서 벗어남 — 사용자 명시 선택). 엔드포인트 미설정 시 프런트는 템플릿으로 동작해 비용 0 을 유지한다.
