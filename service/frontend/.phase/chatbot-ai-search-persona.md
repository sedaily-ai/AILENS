# Chatbot · AI 검색 — 페르소나 기반 뉴스 대화

## 작업일: 2026-05-23
## 브랜치: feat/chatbot · PR: #5

## 의도 (Why)

"AI 검색"이 단순한 키워드 검색·요약 도구가 아니라, **MBTI 4 페르소나(시현 NT / 지원 NF / 정훈 ST / 하은 SF) 중 한 명과 뉴스를 두고 대화하는 경험**이 되도록 한다.

- 같은 기사·같은 질문도 페르소나마다 톤·관점·해석이 달라야 한다. (NT는 데이터·논리로 단정적, NF는 본질을 함께 사유, ST는 군더더기 없는 팩트, SF는 친구 대화체)
- 헤더의 "AI 검색" 진입 시 페르소나를 먼저 고르고, 그 페르소나의 시스템 프롬프트로 응답이 생성된다.
- 한 페르소나와의 대화는 일관된 톤을 유지하며, 페르소나를 바꾸면 새 대화로 초기화된다 (톤이 섞이지 않도록).
- MBTI 본문 리라이팅(Opus 4.6, `mbti-opus-46`) 과는 다른 컨텍스트의 사용 — 그래서 비용·워크로드도 분리한다.

## 무엇을 바꿨나 (What)

### 1) Bedrock — application inference profile 신규 생성

| 항목 | 값 |
|---|---|
| 이름 | `mbti-sonnet-46` |
| ARN | `arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/iqlj0wamhnt3` |
| Region | us-east-1 |
| Source | `arn:aws:bedrock:us-east-1:887078546492:inference-profile/us.anthropic.claude-sonnet-4-6` (US cross-region) |
| Tags | `Model=sonnet-4.6`, `Project=Sedaily-MBTI`, `Environment=dev`, `Service=mbti`, `CostCenter=sedaily-ai`, `ServiceName=Sedaily-MBTI`, `Workload=chatbot` |

`Workload=chatbot` 태그로 챗봇/AI 검색 비용을 MBTI 변환(`mbti-opus-46`) 비용과 분리해 추적한다.

**함정**: 처음에 foundation model ARN(`anthropic.claude-sonnet-4-6`)을 `copyFrom`으로 시도 → `On Demand inference 지원 안 함` 에러. Sonnet 4.6은 cross-region inference profile(`us.*` 또는 `global.*`)을 거쳐야만 호출되며, application inference profile은 그 system profile을 `copyFrom`으로 잡아야 한다.

### 2) Backend — chatbot_handler 모델 전환

- `service/backend/config/constants.py` — `BEDROCK_MODEL_ID_CHATBOT` 상수 신규 추가
- `service/backend/handlers/chatbot_handler.py` — 3개의 Bedrock 호출 지점(sync `invoke_model`, tool-use loop, streaming `invoke_model_with_response_stream`) 모두 Haiku 3.5 → Sonnet 4.6 ARN으로 교체
- 페르소나 시스템 프롬프트(`prompts/chatbot/{nt,nf,st,sf}.md`)는 기존 그대로 — `mbti_group` 파라미터로 분기하는 메커니즘이 이미 있었음

### 3) Frontend — 4 페르소나 선택 UI

`service/frontend/src/components/mbti/SmartSearchOverlay.tsx`:

- 빈 상태(`messages.length === 0`)에 4 페르소나 카드 그리드 추가 (시현/지원/정훈/하은)
- 카드 클릭 시 내부 `activePersona` state 전환 → `mbti_group`으로 전송 → 백엔드 페르소나별 톤으로 응답
- 외부 `selectedGroup` 변경 시 `activePersona` 동기화
- 대화 진행 중 페르소나 바꾸면 새 대화로 초기화 (톤 일관성 보존)
- 페르소나 이름·역할을 백엔드 `prompts/chatbot/*.md`와 정합 (이전: 민철/하은/준서/소율 → 변경: 시현/지원/정훈/하은)

## 페르소나 4명 (백엔드 ↔ 프론트 정합)

| MBTI | 이름 | 역할 | 톤 |
|---|---|---|---|
| NT | 김시현 | 전략분석팀 수석연구원 | 데이터·논리, 단정적·간결 |
| NF | 박지원 | 오피니언팀 논설위원 | 본질 사유, 함께 생각하는 톤 |
| ST | 이정훈 | 팩트체크 에디터 | 군더더기 없는 격식체 |
| SF | 김하은 | MZ 독자 담당 에디터 | 친구 대화체, `~거든요/~잖아요` |

## 비용 메모

| 모델 | 입력 단가 | 출력 단가 |
|---|---|---|
| Haiku 3.5 (이전) | $0.25 / 1M tokens | $1.25 / 1M tokens |
| Sonnet 4.6 (현재) | $3.00 / 1M tokens | $15.00 / 1M tokens |

토큰당 약 12배. 페르소나 일관성·문장 품질·뉴스 해석 깊이가 챗봇 컨셉의 핵심 가치라 감수. 실제 사용량은 `Workload=chatbot` 태그로 Bedrock 콘솔/CloudWatch에서 추적.

## 배포

- Backend: `./deploy.sh api` → `sedaily-mbti-chatbot-dev` 포함 18개 API Lambda 업데이트 (constants.py가 zip에 같이 들어가므로 전체 sync)
- Frontend: `./deploy.sh` → S3 `sedaily-mbti-frontend-dev` + CloudFront `E1QS7PY350VHF6` 무효화
- Smoke test: `POST /api/chat` `{mbti_group:"NT"}` → "김시현입니다. 서울경제신문 AI LENS 전략분석팀 수석연구원으로..." 응답 확인

## 다음 단계 후보

- 대화 진행 중 상단 헤더에 작은 페르소나 토글 추가 (현재는 빈 상태에서만 전환 가능)
- 페르소나별 추천 기사 컨텍스트 강화 (`recent_articles`를 mbti_group 기반으로 필터)
- 채팅 화면에 "다른 페르소나 의견 듣기" 버튼 (같은 질문을 4명 모두에게 자동 디스패치)
- 사용량/비용 대시보드: `Workload=chatbot` 태그로 일/주 단위 집계
