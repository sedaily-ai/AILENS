# 2026-05-23 — 챗봇·음성·레터 멀티모달 + Nova Reel/Canvas

한 세션 안에서 진행된 네 갈래 작업. 시간순·인과관계대로 정리.
PR 4개 (#5, #6, #7, #8) 가 모두 같은 줄기 — "AI LENS 의 4 페르소나 (시현 NT / 지원 NF / 정훈 ST / 하은 SF) 가 텍스트·음성·영상·이미지 전 채널에서 일관된 톤으로 사용자와 대화하도록 만든다".

## Phase A — AI 검색 → Sonnet 4.6 페르소나 챗봇 (PR #5, merged)

**의도**
- AI 검색을 키워드 검색 도구가 아닌 "MBTI 4 페르소나와 1:1 대화하는 ChatGPT 식 챗봇"으로 재정의.
- 카드 클릭 → 페르소나 시스템 프롬프트 분기 → 같은 질문도 톤 다르게 응답.

**Bedrock 신규 리소스**
- application inference profile `mbti-sonnet-46`
  - ARN: `arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/iqlj0wamhnt3`
  - 소스: `us.anthropic.claude-sonnet-4-6` (US cross-region system profile)
  - **함정**: `anthropic.claude-sonnet-4-6` (foundation model ARN) 으로 copyFrom 시도 → `On Demand inference 지원 안 함` 에러. cross-region inference profile 을 거쳐야만 호출.
  - 태그: Service=mbti, Workload=chatbot, Environment=dev, CostCenter=sedaily-ai (`Workload=chatbot` 로 챗봇 비용을 MBTI 본문 변환(`mbti-opus-46`) 비용과 분리 추적)

**백엔드 변경**
- `service/backend/config/constants.py` — `BEDROCK_MODEL_ID_CHATBOT` 신규
- `service/backend/handlers/chatbot_handler.py` — 3개 invoke 지점 (sync / tool-use loop / streaming) Haiku 3.5 → Sonnet 4.6 ARN
- `service/backend/prompts/chatbot/{nt,nf,st,sf}.md` — "마크다운 강조 표기 금지" 규칙 추가 (`**볼드**`, `##` 헤더, `|표|`, `---` 금지)

**프론트엔드 변경**
- `service/frontend/src/components/mbti/SmartSearchOverlay.tsx`
  - 4 페르소나 카드 그리드 (활성 카드만 페르소나별 그라데이션·ring·체크 마크)
  - 페르소나 이름·역할을 백엔드 prompts/chatbot/*.md 와 정합 (이전: 민철/하은/준서/소율 → 변경: 시현/지원/정훈/하은)
  - mbti_group 으로 백엔드 호출

**배포·검증**
- `./deploy.sh api` (18 → 21개 API Lambda)
- smoke test: `POST /api/chat {mbti_group:"NT"}` → "김시현입니다. 서울경제신문 AI LENS 전략분석팀..." 응답 확인
- 운영 사이트 `mbti.sedaily.ai` 반영, CloudFront `E1QS7PY350VHF6` 무효화

---

## Phase B — WebSocket 토큰 streaming + ChatGPT 스타일 리디자인 (PR #6, merged)

**의도**
- 토큰이 한 번에 도착하는 HTTP API 의 buffer 동작 → 실제 streaming 체감으로.
- 응답 마크다운 raw 노출 문제 해결.
- 페르소나 선택 UI 를 ChatGPT 스타일로 (하단 fixed 입력바, 헤더 segment control).

**백엔드 — `handlers/websocket/`**
- `connect.py` — connectionId 를 DDB `sedaily-mbti-ws-connections-dev` 에 저장 (24h TTL, mbti_group 쿼리파라미터)
- `disconnect.py` — 연결 종료 시 즉시 정리
- `message.py` — `action=sendMessage` → 기존 `generate_chat_response_stream` 재사용 → Bedrock chunk 를 `apigatewaymanagementapi.post_to_connection` 으로 push
- 이벤트: `ai_start` → `ai_chunk` × N → `chat_end`

**AWS 신규 리소스 (4종)**
- WebSocket API: `sedaily-mbti-ws-api` — `wss://8181gs7j41.execute-api.us-east-1.amazonaws.com/dev`
- Lambda × 3: `sedaily-mbti-ws-{connect,disconnect,message}-dev`
- DDB: `sedaily-mbti-ws-connections-dev` (PK=connectionId, TTL=ttl, PAY_PER_REQUEST)
- IAM `sedaily-mbti-lambda-execution-dev`:
  - `execute-api:ManageConnections` (POST `@connections/*`)
  - `bedrock:InvokeModelWithResponseStream` (기존 `InvokeModel` 만 있었음 — streaming 별도 액션)

**프론트엔드**
- `shared/lib/chatbotWs.ts` — 1턴 단위 WS 클라이언트 (그룹 변경 시 재연결, onChunk/onStart/onEnd/onError 콜백)
- `shared/config/api.ts` — `NEXT_PUBLIC_WS_URL` + 운영 기본값
- `SmartSearchOverlay` 전면 재구성
  - "일반 검색" 모드 제거 (mode toggle 자체 삭제)
  - 페르소나 카드 더 큰 아바타·호버 인터랙션
  - ChatGPT 스타일: 헤더 단순화, 하단 fixed 입력바 (`textarea` + auto-resize + Enter 보내기 / Shift+Enter 줄바꿈)
  - `react-markdown` + `remark-gfm` 으로 본문 렌더 — 표·인용·코드·링크·리스트 모두 Toss/당근 톤 (테두리 제거, 그림자만)

**함정 / 학습**
- 첫 WS smoke test 시 `bedrock:InvokeModelWithResponseStream` 권한 없어서 streaming 호출만 거부. `InvokeModel` 과 별도 액션. IAM 정책에 두 액션 모두 명시.

**배포·검증**
- python `websockets` smoke test: connect → sendMessage → ai_chunk 24개 순차 도착 → chat_end (NT 페르소나 톤)
- 운영 사이트 무효화 후 4 페르소나 카드 + 토큰 단위 streaming 체감 확인

---

## Phase C — 음성 통화 + 핸즈프리 (PR #7, merged)

**의도**
- "전화영어 + ChatGPT 코칭 + unmute 미니멀" 컨셉을 같은 AI 검색 페이지 안에서 텍스트와 자유롭게 토글.
- **풀스크린 음성 모드는 폐기** — 페이지 구성 통합, 입력 영역만 모드별로 변형.
- 핸즈프리는 별도 모드가 아니라 "음성 모드 안의 옵션" (자동 듣기·말하기 토글).
- 헤더 segment control 두 개: `[😊 텍스트 | 🎤 음성]`.

**RINGGLE 코드 패턴 분석 → 우리에 맞춰 단순화**
- `services/title/internal/one/title/frontend/src/pages/Call.jsx` (3,777줄) — 통화 UI 시각 패턴 추출
  - 듣는 중 5막대 파동 / AI 응답 대기 3점 dot-wave / 자막 streaming
- `services/title/internal/one/title/backend/handlers/tts_stt.py` — `handle_get_transcribe_url`, `handle_tts` 두 함수 이식
- RINGGLE 의 AWS Transcribe Streaming WebSocket presign 패턴은 백엔드에만 이식하고, 1차 UI 는 **브라우저 Web Speech API** 로 시작 (한국어 챗봇 1턴 단발 인풋이라 정통 streaming presign 까지는 과함, future upgrade 자리만 만들어둠).

**백엔드 — `handlers/voice/`**
- `tts.py` — Polly 페르소나별 음성 매핑, plain text → base64 mp3
- `stt_presign.py` — AWS Transcribe Streaming WebSocket SigV4 presigned URL (ko-KR, 16kHz PCM). RINGGLE 패턴 그대로 이식. 미사용 상태로 future upgrade 자리 보존.

**한국어 Polly 음성 제약**
- 한국어 음성은 `Seoyeon`(standard/neural/generative) + `Jihye`(neural) 둘뿐 — 모두 여성. 남성 페르소나 시현·정훈도 여성 음성. voice/engine 조합만으로 차별화:
  - NT 시현: Jihye neural
  - NF 지원: Seoyeon neural
  - ST 정훈: Jihye neural
  - SF 하은: Seoyeon generative (가장 표현 풍부)
- **함정**: 처음 SSML `prosody pitch` 로 남성 페르소나 피치 하향 시도 → "Unsupported Neural feature" 에러. neural engine 은 SSML prosody pitch 미지원. plain text + voice/engine 조합으로 fallback.

**AWS 신규 리소스 (2 Lambda + IAM + 2 라우트)**
- Lambda × 2: `sedaily-mbti-voice-{stt-presign,tts}-dev` (`Workload=chatbot` 태그)
- IAM 추가: `transcribe:StartStreamTranscription(WebSocket)` + `polly:SynthesizeSpeech`
- HTTP API `chzwwtjtgk` 라우트: `POST /api/voice/{stt-presign,tts}`
- deploy.sh API_FUNCTIONS 에 voice 2개 추가 (총 23개)

**프론트엔드**
- `shared/lib/voiceChat.ts`
  - `VoiceRecognizer` — Web Speech API (ko-KR) 래퍼, `no-speech`/`aborted` 같은 정상 에러는 swallow
  - `synthesizeSpeech(text, mbti_group)` — `/api/voice/tts` 호출 → mp3 Blob URL
  - `playAudioUrl(url)` — Promise 기반 재생 + `revokeObjectURL` 자동 정리
- `SmartSearchOverlay` 인라인 음성 인터페이스
  - 큰 마이크 버튼 + 듣고 있어요/생각 중/말하는 중 상태 텍스트
  - 핸즈프리 토글 스위치 (음성 모드 진입 시 우상단 — 별도 모드 아닌 옵션)
  - 사용자 partial transcript 자막 + 듣기 중 5막대 파동
  - 핸즈프리 ON: final transcript → 자동 send → 응답 streaming → Polly TTS 재생 → 응답 끝나면 자동 재청취
  - 핸즈프리 OFF: 한 번만 듣고 idle

**TS 함정**
- 처음 `SpeechRecognition` 타입 별도 정의 → DOM lib 의 기본 타입과 충돌. 결국 `any` 로 다루는 방향이 안정 (webkit prefix 호환 + 다양한 브라우저).

**부가 변경**
- 헤더 라벨 `"AI 검색"` → `"대화"` (`src/widgets/Header/Header.tsx`). 도구·기계적 워딩 제거, 페르소나와 1:1 대화 컨셉과 일치.

---

## Phase D — 레터 페이지 멀티모달 + Nova Reel 영상 + 메인 피드 최신 + Nova Canvas 이미지 PoC (PR #8, 진행 중)

이 단계는 한 PR 안에서 네 흐름이 차례로:
1. 4채널 탭 폐기 → 한 페이지 통합 흐름
2. Amazon Nova Reel 로 5/22 NF 영상 첫 생성
3. 메인 피드 `/?tab=feed` 항상 최신 발행분 노출
4. (마지막) 인스타툰 이미지 PoC — 모델 access 막혀 Titan Image v2 로 한 장 받음

### D-1. 레터 페이지 4탭 폐기

**의도**
- 레터 상세에서 텍스트/이미지/팟캐스트/동영상 4탭 전환 소비 → 어색하다는 피드백.
- 한 레터를 **한 흐름**으로 소비. 팟캐스트는 음악 플레이어처럼 상단, 이미지는 본문 중간, 동영상은 하단.

**`LetterDetailClient.tsx` 재구성**
```
헤더 (페르소나 칩 + 제목 + 부제)
   ↓
🎵 LetterPodcastPlayer  ← 상단 (hasPodcast 일 때만)
   ↓
본문 1부 (단락 절반)
   ↓
🖼 LetterImageChannel  ← 본문 중간 (chart / photo / infographic / metaphor)
   ↓
본문 2부 (단락 나머지)
   ↓
LetterTextExtras (핵심 정리 / 닫는 줄 / 단어)
   ↓
🎬 LetterVideoChannel  ← 하단
```
- 본문 단락 ≥ 3개일 때만 중간 이미지 삽입 (짧은 글은 통째)
- `Channel` type, `channel` state, `setChannel` 4탭 UI 전부 제거
- `LetterTextChannel` → `LetterTextExtras` 로 리네임 (본문 본체는 `LetterBody` 가 직접 `LetterBlock` 호출)
- 미사용 `ChannelEmpty` 제거

### D-2. Amazon Nova Reel — 5/22 NF 영상 생성

**의도**
- 외부 도구(Whisk 등) 수동 워크플로우 대신 회사 AWS 계정 안에서 자동화 가능한 동영상 생성.
- `VIDEO_AVAILABLE_IDS` 가 5/18 4편 + 5/22 NT 1편만 — 5/22 NF/ST/SF 비어있던 자리 채우기.

**Bedrock 모델**
- `amazon.nova-reel-v1:0` — 6초 단일 샷, 1280×720, status `LEGACY` 표기지만 회사 계정(887078546492)에서 호출 가능
- async invoke 방식 (`bedrock-runtime start-async-invoke`)

**S3 출력 버킷**
- `sedaily-mbti-video-dev` (us-east-1, 신규 생성)
- 태그: Project=Sedaily-MBTI, Environment=dev, Service=mbti, CostCenter=sedaily-ai, **Workload=nova-reel**

**호출 흐름**
```
1. start-async-invoke (model=amazon.nova-reel-v1:0, taskType=TEXT_VIDEO)
   → invocationArn 즉시 반환 (vxyxakyizpm4)
2. get-async-invoke polling
   → InProgress (4회) → Completed (~1분 30초)
3. s3 sync s3://sedaily-mbti-video-dev/<jobid>/
4. output.mp4 (1.6MB) → service/frontend/public/video/2026-05-22/NF.mp4
5. VIDEO_AVAILABLE_IDS 에 'l-20260522-NF' 추가
```

**입력 JSON 예시**
```json
{
  "taskType": "TEXT_VIDEO",
  "textToVideoParams": {
    "text": "A serene Korean female editor in a sunlit Seoul newsroom, soft natural light through window blinds, holding a notebook with a pen, contemplative warm atmosphere, slow forward dolly camera, cinematic shallow depth of field, gentle film grain, editorial documentary style, 4K"
  },
  "videoGenerationConfig": {
    "durationSeconds": 6,
    "fps": 24,
    "dimension": "1280x720",
    "seed": 42
  }
}
```

**비용**
- 초당 약 $0.08 → 6초 ~$0.48/편, 4편 일괄 ~$1.92
- v1:1 (멀티샷, 최대 2분) 사용 시 ~$10/편

### D-3. 메인 피드 `/?tab=feed` 항상 최신 발행분

**문제**
- `FollowingFeed` 가 KST today (5/23) 호출 → API 빈 응답 → 14일 lookback 으로 어제(5/22) 까지 거슬러야 표시. 사용자 피드백 "여기에 보이는 레터들 항상 최신걸로 덮어주시죠".

**변경**
- `letters20260518.ts`
  - `LATEST_LETTERS_DATE` / `LATEST_LETTERS` 신규 export
  - `LOCAL_LETTERS_BY_DATE` 의 가장 큰 날짜 키를 `SORTED_DATES` 정렬로 자동 선택
  - **새 letters 추가 시 `LOCAL_LETTERS_BY_DATE` 한 줄만 추가하면 `LATEST_LETTERS` 자동 갱신**
- `shared/lib/todayLettersApi.ts`
  - `fetchTodayLetters` fallback 체인에 `LATEST_LETTERS` 추가
  - API 빈 + 요청 date 매칭 없음 → 즉시 LATEST 반환 (14일 lookback 안 돔)

**효과**
- 메인 피드 selectedDate state 는 KST today 유지 → 헤더 라벨 "오늘"
- 본문 4편은 실제 가장 최근 발행분 (현재 5/22)
- 첫 호출에 최신 도달

### D-4. 인스타툰 이미지 — Nova Canvas 시도 → Titan Image v2 fallback PoC

**의도**
- 레터 본문을 인스타툰·카드뉴스·만화 형태로 시각화해 동영상 위쪽에 배치.
- AWS 안에서만 (외부 OpenAI/Gemini 사용 불가).

**Bedrock 이미지 모델 access 조사**
- 회사 계정 active 텍스트→이미지 base generator: `amazon.nova-canvas-v1:0`, `amazon.titan-image-generator-v2:0` (둘 다 LEGACY)
- Stability AI 라인 13개 모두 보조 도구 (`upscale`, `inpaint`, `outpaint`, `remove-background`, `control-sketch/structure`, `style-guide/transfer`, `search-recolor/replace`) — **모두 input=TEXT+IMAGE** → 텍스트만으로 만화 base 생성 불가
- SDXL / SD3.5 Large / Stable Image Ultra 같은 base generator 는 **회사 계정 미활성** → Bedrock Model access 콘솔에서 신청 필요 (1~2영업일)

**함정 1 — Nova Canvas 락**
- `amazon.nova-canvas-v1:0` 호출 시도 → `Access denied. Model marked as Legacy and you have not been actively using the model in the last 30 days. Please upgrade to an active model on Amazon Bedrock`
- 30일 미사용 LEGACY 모델은 명시적 enable 필요. AWS 콘솔 Bedrock → Model access 에서 활성화.

**함정 2 — CLI binary format**
- `aws bedrock-runtime invoke-model` 호출 시 `--cli-binary-format raw-in-base64-out` 옵션 없으면 body 가 base64 디코드 실패. CLI v2 의 default 동작.

**Titan Image v2 PoC 결과**
- 1024×1024 PNG (1.4MB) `/tmp/titan-poc.png` 생성 성공
- 사용한 prompt: 한국 만화·인스타툰 톤, NF 지원 컨셉, 4가지 비용 영역 (skills/safety/education/finance) 아이콘, 한글 텍스트는 image 안에 넣지 않음 (Titan/Nova 한글 정확도 약함 → frontend overlay 분리 전략)
- 만화 표현력은 구식 모델 한계 — 사용자 결과 평가 후 다음 단계 결정

**다음 단계 후보**
1. Titan 결과 OK → 카드뉴스 4컷 양산 + frontend overlay 로 한글 캡션
2. Titan 부족 → Nova Canvas 콘솔 enable → 다시 PoC
3. Nova Canvas 도 부족 → Bedrock Model access 신청 (Stable Image Ultra / SD3.5 Large)

---

## 배포·운영 인프라 요약 (이번 세션에서 누적된 신규/변경 리소스)

| 종류 | 식별자 | 비고 |
|---|---|---|
| Bedrock application inference profile | `mbti-sonnet-46` (`iqlj0wamhnt3`) | Workload=chatbot |
| WebSocket API | `sedaily-mbti-ws-api` (`8181gs7j41`) | 챗봇 streaming |
| Lambda | `sedaily-mbti-ws-{connect,disconnect,message}-dev` | 챗봇 WS |
| Lambda | `sedaily-mbti-voice-{stt-presign,tts}-dev` | 음성 통화 |
| DDB | `sedaily-mbti-ws-connections-dev` (TTL=24h, PAY_PER_REQUEST) | WS connection 추적 |
| S3 | `sedaily-mbti-video-dev` (us-east-1) | Nova Reel output |
| IAM 추가 권한 | `bedrock:InvokeModelWithResponseStream`, `execute-api:ManageConnections`, `transcribe:StartStreamTranscription(WebSocket)`, `polly:SynthesizeSpeech` | 모두 `sedaily-mbti-lambda-execution-dev` |

## 작업 흐름 룰 (이번 세션에서 메모리화 한 것)

1. **메인 피드 항상 최신 발행분** — 새 letters 추가 시 `LOCAL_LETTERS_BY_DATE` 한 줄 등록, `LATEST_LETTERS` 자동 갱신. 새 영상(Nova Reel) / 팟캐스트 추가 시 `VIDEO_AVAILABLE_IDS` / `LETTER_PODCASTS` 도 함께 챙기기 — `feedback_mbti_today_feed_latest.md`
2. **Nova Reel async invoke 패턴** — start → polling → s3 sync → public 복사 → VIDEO_AVAILABLE_IDS 등록 → deploy — `project_mbti_nova_reel_video.md`
3. **Sonnet 4.6 inference profile** — system cross-region ARN 으로만 copyFrom 가능, foundation model ARN 직접 사용 불가 — `project_mbti_sonnet_chatbot.md`
4. **옵션 폼 X** — IA·구현 경로 선택 단계 모두 평문 대화 우선, AskUserQuestion 폼 자제 — `feedback_planning_dialogue.md` (이번 세션에서 강화)

작성일: 2026-05-23
