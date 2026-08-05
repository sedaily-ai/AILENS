# AI LENS 음성 통화 아키텍처

> Last update: 2026-05-24 — Haiku 4.5 전환 + dual-provider TTS + barge-in 통합 시점.
> 본 문서는 mbti.sedaily.ai 의 4 페르소나 음성 통화 (`SmartSearchOverlay` voice mode)
> 의 전체 로직·모듈·값·프롬프트를 실제 코드 기준으로 모은 reference.
> 인접 문서: `service/frontend/.phase/2026-05-24-ai-conversation-phase1-2.md`
> (Phase 1+2 변경 이력), `.phase/2026-05-24-voice-tts-dual-provider.md`
> (ElevenLabs 도입 상세).

---

## 1. 전체 흐름 (한 turn)

```
[사용자 발화]
    ↓ getUserMedia 48kHz mono (echoCancellation/noiseSuppression/autoGainControl ON)
[AudioCapture] service/frontend/src/shared/lib/audioCapture.ts
    ↓ AudioWorklet (public/audio-worklet/pcm-downsampler.js)
[16kHz Int16 PCM, 4096 samples (~256ms) chunk]
    ↓ WebSocket binary frame (Transcribe Event Stream codec)
[wss://transcribestreaming.us-east-1.amazonaws.com:8443 + SigV4 presigned]
    ↓ partial transcript 도착
[TranscribeStreamRecognizer.handleResults]
    ↓ partial 1500ms 무변동 OR 사용자 ↑ 버튼 → final 강제 promote
[onFinal(text) → sendAiVoice(text)]
    ↓ chatbot WS API Gateway action=sendMessage
[sedaily-mbti-ws-message-dev Lambda]
    ↓ Bedrock invoke_model_with_response_stream (Haiku 4.5)
    ↓ tool use loop (get_stock_price / get_market_index / search_news)
[stream chunk (delta text)]
    ↓ ws.send → onChunk
[Frontend: setMessages 화면 텍스트 + makeSentenceFlusher.push]
    ↓ sentence boundary OR firstSoftMs 800ms 경과
[speak(sentence)]
    ↓ POST /api/voice/tts (mbti_group)
[sedaily-mbti-voice-tts-dev Lambda]
    ↓ PERSONA_VOICE 분기
   ┌─ 시현/정훈 → ElevenLabs Multilingual v2 (https://api.elevenlabs.io)
   └─ 지원/하은 → AWS Polly (Seoyeon generative / Jihye neural)
    ↓ mp3 base64
[playAudioUrl → HTMLAudioElement.play()]
```

---

## 2. STT — 사용자 발화 인식

### 2.1 엔드포인트·인증

```
POST /api/voice/stt-presign  →  Lambda sedaily-mbti-voice-stt-presign-dev
body { language: "ko-KR", sample_rate: 16000 }
response.url = wss://transcribestreaming.us-east-1.amazonaws.com:8443
              /stream-transcription-websocket
              ?X-Amz-Algorithm=AWS4-HMAC-SHA256
              &X-Amz-Credential=...
              &X-Amz-Date=YYYYMMDDTHHMMSSZ
              &X-Amz-Expires=300
              &X-Amz-Security-Token=...
              &X-Amz-SignedHeaders=host
              &language-code=ko-KR
              &media-encoding=pcm
              &sample-rate=16000
              &X-Amz-Signature=...
expires_in = 300s
```

SigV4 query-param 서명 (`service/backend/handlers/voice/stt_presign.py`).
region=us-east-1, service=transcribe. Lambda 가 자체 IAM 의 STS 임시 자격증명을
서명에 사용 (`boto3.Session().get_credentials()`).

### 2.2 마이크 → PCM 파이프

| 항목 | 값 |
|---|---|
| `getUserMedia` constraints | `{ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }` |
| AudioContext sampleRate | 48000Hz (브라우저 기본) |
| Safari 호환 | `window.AudioContext \|\| window.webkitAudioContext` |
| iOS 자동재생 정책 | context.state suspended 시 `context.resume()` 호출 |
| Worklet processor | `pcm-downsampler` — 48kHz Float32 → 16kHz Int16 linear interpolation |
| flushThreshold | 4096 samples (~256ms) → main thread postMessage (transferable ArrayBuffer) |
| Silent gain (0) | destination 연결 — process() 호출 트리거 + 스피커 echo 방지 |

### 2.3 Event Stream binary codec (`transcribeEventStream.ts`)

AWS Transcribe Streaming spec 그대로 구현 (dep 없음).

```
Frame layout (big-endian):
  [4: totalLen][4: headersLen][4: preludeCRC]
  [headers][payload]
  [4: messageCRC]

Header entry: [1: nameLen][nameBytes utf-8][1: typeCode=7 string][2: valueLen][valueBytes utf-8]

CRC32: IEEE 802.3 reversed 0xEDB88320 (256-entry table)

AudioEvent 보낼 때 3 헤더:
  :content-type   = application/octet-stream
  :event-type     = AudioEvent
  :message-type   = event
payload = PCM int16 little-endian
```

수신: `decodeMessage(frame)` → prelude/message CRC 검증 → header parse →
`parseTranscriptEvent(msg)` (`:event-type === 'TranscriptEvent'`) →
`{ Transcript: { Results: [{ Alternatives, IsPartial, ResultId }] } }`.

### 2.4 사용자 턴 종료 판정 (`TranscribeStreamRecognizer`)

| 트리거 | 동작 |
|---|---|
| Transcribe 자체 `IsPartial=false` 도착 | `onFinal(text)` 즉시, `finalEmitted=true` |
| partial **1500ms** 무변동 | 마지막 partial 을 final 로 promote + `stop()` |
| 사용자 ↑ 버튼 (`submitCurrentPartial`) | `recognizer.stop()` + 빈 AudioEvent (EOF) + ws.close(1000) + 화면 partialTranscript 직접 sendAiVoice |
| WS close ev.code !== 1000 | `onError(WS 종료 (code N))` |

`silenceTimer` 는 partial 도착마다 reset, `finalEmitted` flag 로 native final
과 promote 중복 방지.

---

## 3. Chatbot — LLM 응답

### 3.1 Bedrock 모델

```python
# service/backend/config/constants.py
BEDROCK_MODEL_ID_CHATBOT = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
# 2026-05-24 Sonnet 4.6 → Haiku 4.5 cross-region 교체
# (5x 빠르고 1/5 비용. 페르소나 톤 유지 충분).
# 비용 태깅 inference profile mbti-haiku-45 는 별도 라운드 예정.
```

### 3.2 Invoke 파라미터 (`chatbot_handler.py`)

```python
{
  "anthropic_version": "bedrock-2023-05-31",
  "max_tokens": 2048,
  "system": [
    {
      "type": "text",
      "text": <persona_prompt + context + GENERAL_INSTRUCTIONS>,
      "cache_control": {"type": "ephemeral"}     # 30~50% input 비용 절감
    }
  ],
  "messages": <history + current user>,
  "tools": <_get_tools()>
}
```

`bedrock-runtime.invoke_model_with_response_stream` 으로 stream chunk
(delta text) → WS ws.send → frontend `onChunk`.

### 3.3 Persona prompt — `prompts/chatbot/{nt,nf,st,sf}.md`

NF 지원 예시 전문:

```markdown
당신은 '지원'입니다. 서울경제신문 AI LENS의 오피니언팀 논설위원이에요.

## 페르소나
- 이름: 박지원
- 성향: 성찰적이고 따뜻함. 현상 너머의 본질을 탐구
- 말투: 깊이 있으면서도 독자와 함께 생각하는 톤
- 구어체 혼용: ~이에요, ~해요 (부드럽게)

## 대화 규칙
1. RAG 컨텍스트 활용: 검색된 기사가 있으면 그 내용의 사회적 의미를 함께 설명
2. 모르는 건 모른다고: 검색 결과에 없는 내용은 추측 X
3. 가치와 의미 탐색: "이게 왜 중요한지", "우리 사회에 어떤 의미인지" 관점
4. 열린 질문 제시: 독자가 스스로 생각할 여지
5. 공감하되 편들지 않기: 다양한 관점을 균형 있게

## 금지 사항
- 마크다운 강조 표기 (**, ##, |표|, ---)
- 가벼운 감탄사 ("와", "대박")
- 원본 기사에 없는 사실 만들기
- 한쪽 편을 강하게 드는 것
- 냉소적·비판적 톤

## 답변 예시
Q: "요즘 청년 실업 뉴스 있어?"
A: "오늘 청년 고용률 관련 기사가 있어요. 수치적으로는 개선됐지만, 기사를
   자세히 보면 '질 좋은 일자리'가 늘었는지는 다른 문제거든요. 결국 묻게
   되는 건, 우리 사회가 '취업률'이라는 숫자로 청년 문제를 판단해도 되는
   건지예요. 이 주제에 대해 더 이야기 나눠볼까요?"
```

NT 시현·ST 정훈·SF 하은 도 같은 구조의 별도 파일.
Admin-3 이후 prompt 출처는 `sedaily-mbti-admin-prompts-dev` DDB (5분 TTL 캐시),
miss/error 시 `prompts/chatbot/<group>.md` fallback.

### 3.4 공통 `GENERAL_INSTRUCTIONS` (2026-05-24 강화)

```
[대화 톤 — 전화 통화처럼]
1. 친구와 전화로 한 호흡씩 주고받듯. 절대 기사·리포트처럼 X.
2. 한 답변 = 1~2문장, 50~120자. 그 이상 X. 사용자가 명시적으로
   "자세히 설명해줘" 라고 했을 때만 길게.
3. 마크다운 사용 금지: 헤더(#, ##), 리스트(-, •, 1.), 볼드(**…**),
   표, 구분선(---), 코드블록.
4. 이모지 금지: 📰 💭 🤔 😊 등 절대 X. 평문만.
5. 줄바꿈 사용 금지. 한 단락 한 호흡으로.
6. 답 끝에 매번 질문 다는 패턴 X. 자연스러우면 OK, 아니면 그냥 끝.
7. 길게 쓰고 싶어도 참고 — 한 통화 turn 은 짧게, 사용자가 더 물으면
   그때 이어 풀어주세요.

[도입 멘트·확인 멘트 절대 금지 — 매우 중요]
- "잠깐만요, 확인해볼게요" "찾아볼게요" "한번 보겠습니다" "알아볼게요"
  "정리해드릴게요" 같은 사전 안내 멘트 절대 X. 그대로 본론 시작.
- 도구 호출 전후로도 안내 멘트 X. 도구 결과 받자마자 핵심만 바로.
- "음, 그렇군요" "아 네" 같은 추임새도 첫 turn 에는 안 씀 — 바로 사실로.

[정보 정확성]
1. 도구 선택:
   - get_stock_price: "주가/시세/가격/얼마" 시세 키워드
   - get_market_index: "코스피/코스닥/지수" 키워드
   - search_news: 기업·인물·이슈·정책 언급 또는 뉴스 배경 요청
   - 도구 없이 답변: 일상 대화, 개념 설명, 역사 사실
2. 모르는 건 "잘 모르겠어요" — 추측하지 않기.
3. 투자 조언/추천 X.
4. 수치 만들어내지 않기.

답변은 한국어로 자연스럽게. 첫 단어부터 본론.
```

### 3.5 `NO_CONTEXT_INSTRUCTIONS` (뉴스 컨텍스트 없을 때)

```
[뉴스 컨텍스트 없음]
오늘의 뉴스 브리핑 데이터에 접근할 수 없는 상황입니다.
- 시장 데이터 (get_market_index / get_stock_price) 가 필요하면 도구
  바로 호출하고 결과 받자마자 본론 한 호흡으로 답하세요. 사용자에게
  양해 멘트 X.
- 뉴스 자체에 대한 질문이고 도구도 못 쓰는 경우에만 한 문장으로
  "지금은 뉴스 데이터가 없어서 자세히 못 짚어드려요" 정도. 그 이상 안 늘림.
- 절대 뉴스 내용을 지어내지 마세요.
```

### 3.6 Tool spec (Anthropic tool use)

```json
[
  {
    "name": "get_stock_price",
    "description": "한국 주식의 실시간 시세를 조회합니다. 장중에는 현재가, 장 마감 후에는 종가를 반환합니다. 종목명(예: 삼성전자) 또는 종목코드(예: 005930)로 검색할 수 있습니다.",
    "input_schema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "종목명 또는 종목코드 (예: '삼성전자', '005930', 'SK하이닉스')"
        }
      },
      "required": ["query"]
    }
  },
  {
    "name": "get_market_index",
    "description": "코스피(KOSPI) 또는 코스닥(KOSDAQ) 시장 지수를 조회합니다. 시장 분석 시 반드시 이 도구로 실제 지수를 확인하세요.",
    "input_schema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "시장 지수명 (예: '코스피', '코스닥', 'KOSPI', 'KOSDAQ')"
        }
      },
      "required": ["query"]
    }
  },
  {
    "name": "search_news",
    "description": "기업·인물·이슈 등 키워드로 서울경제 DB에서 최신 기사를 검색합니다. 주가가 없는 비상장 기업이나 일반 이슈·사건 관련 질문에 활용. get_stock_price 실패 시 자동 폴백.",
    "input_schema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "검색 키워드 (예: '삼성바이오에피스', '엔비디아 AI 칩', '미국 금리')"
        }
      },
      "required": ["query"]
    }
  }
]
```

Tool 실행 (`_execute_tool`):
- `get_stock_price` → `services/stock_service.get_stock_price(query)`
  (네이버 금융 스크레이핑)
- `get_market_index` → `services/stock_service.get_market_index(query)`
- `search_news` → DynamoDB `sedaily-mbti-articles-dev` GSI
  `category-published_at-index`, 최근 7일, 키워드 ≥2자 ∩ stopwords 제외,
  top 3

### 3.7 Context 부착 (system prompt 후미)

우선순위:
1. **`cached_briefing` 있음** → `[오늘의 뉴스 브리핑 - 대화 시 참조]\n<text>\n`
2. **최근 기사 (`recent_articles`) 있음** → DynamoDB GSI `category-published_at-index`
   top-3 × ['경제', '정치', '사회', 'IT_과학'], `[최근 뉴스 컨텍스트 - 필요시 참조]\n1. [경제] 제목 (2026-05-24)\n   <content 200자>...`
3. **둘 다 없음** → `NO_CONTEXT_INSTRUCTIONS`

### 3.8 Chatbot WebSocket (`chatbotWs.ts`)

```
연결: wss://<ws-id>.execute-api.us-east-1.amazonaws.com/dev?mbti_group=NT&user_id=...
송신: { action: "sendMessage", message, mbti_group, conversation_history }
수신 이벤트: chunk (delta text) / done / error

3 lambda:
  - sedaily-mbti-ws-connect-dev      ($connect)
  - sedaily-mbti-ws-message-dev      (sendMessage action)
  - sedaily-mbti-ws-disconnect-dev   ($disconnect)
```

---

## 4. TTS — 음성 합성

### 4.1 PERSONA_VOICE (`handlers/voice/tts.py`)

```python
PERSONA_VOICE = {
  'NT': {  # 시현 (남)
    'provider': 'elevenlabs',
    'voice_id': 'RU7aSi6lT4uQBXMLgDxK',   # TeddyNote young 남성, 신뢰감(강의)
  },
  'NF': {  # 지원 (여)
    'provider': 'polly',
    'voice_id': 'Seoyeon',
    'engine':   'generative',              # 자연도 최대
  },
  'ST': {  # 정훈 (남)
    'provider': 'elevenlabs',
    'voice_id': '5XgfKMHL4qnyg2mabE5t',   # Deck young 남성, 안정·신뢰
  },
  'SF': {  # 하은 (여)
    'provider': 'polly',
    'voice_id': 'Jihye',
    'engine':   'neural',                  # Jihye 는 neural-only
  },
}
```

Voice ID 는 frontend `src/shared/lib/elevenlabs.ts` 의 `editorVoices` 와 sync.
바꿀 때 둘 다 변경.

### 4.2 ElevenLabs 호출

```python
url = f'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}'
headers = {
  'xi-api-key': <secret>,   # Secrets Manager ai-labs/elevenlabs.api_key (5min TTL 캐시)
  'Content-Type': 'application/json',
  'Accept': 'audio/mpeg',
}
body = {
  'text': preprocess_for_polly(text),       # 약어 전처리는 ElevenLabs 도 동일 적용
  'model_id': 'eleven_multilingual_v2',
  'voice_settings': {
    'stability':         0.5,
    'similarity_boost':  0.78,
    'style':             0.25,
    'use_speaker_boost': True,
  }
}
timeout = 12s  (ELEVENLABS_TIMEOUT_SEC)

# 실패 시 → Polly Seoyeon neural fallback (무음 응답 방지)
```

### 4.3 Polly 호출

```python
polly.synthesize_speech(
  Text=text,
  TextType='text',
  OutputFormat='mp3',
  VoiceId='Seoyeon' | 'Jihye',
  Engine='generative' | 'neural',
)
# Engine='generative' 실패 시 'neural' 자동 fallback
```

`DescribeVoices ko-KR` 가용:
- **Seoyeon**: standard / neural / generative (여성)
- **Jihye**: neural 만 (여성)
- 한국어 남자 voice 미지원 → ElevenLabs 도입

### 4.4 텍스트 전처리 `preprocess_for_polly`

영어 약어/단위/한자 → 한국식 발음 substitute (단어 경계 `\b`):

```
KT→케이티, SK→에스케이, SKT→에스케이티, LG→엘지, GS→지에스, CJ→씨제이,
HD→에이치디, KB→케이비
AI→에이아이, IT→아이티, ICT→아이씨티, CEO→씨이오, CFO→씨에프오, CTO→씨티오
GDP→지디피, CPI→씨피아이, PPI→피피아이, IPO→아이피오, ETF→이티에프
PER→피이알, PBR→피비알, ROE→알오이, M&A→엠앤에이, MZ→엠제트
SNS→에스엔에스, API→에이피아이, USB→유에스비
%→ "퍼센트", \d bp → "\d 베이시스포인트"
한자 勞勞→노노, 勞使→노사, 勞→노, 使→사
```

마지막에 다중공백 정리 `re.sub(r'\s+', ' ', out).strip()`.

### 4.5 `sanitizeForTTS` (frontend, TTS 호출 직전)

```typescript
// 이모티콘 (:) :D ;P 등) 제거
.replace(/[:;][-~]?[)(\][DPpoO3<>]/g, '')
// 마크다운 **, *, _, `
.replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')
.replace(/`([^`\n]+)`/g, '$1')
.replace(/(?<!\w)_+([^_\n]+)_+(?!\w)/g, '$1')
// URL
.replace(/https?:\/\/\S+/g, '')
// 단독 콜론/세미콜론 (숫자 사이 아닐 때) → 쉼표
.replace(/(?<!\d):(?!\d)/g, ', ')
.replace(/(?<!\d);(?!\d)/g, ', ')
// 헤더 마커 #, >
.replace(/^[#>\s]+/gm, '')
// 다중 공백
.replace(/\s+/g, ' ').trim()
```

### 4.6 API 응답

```json
{
  "audio":        "base64 mp3 …",
  "content_type": "audio/mpeg",
  "provider":     "polly" | "elevenlabs",
  "voice_id":     "Seoyeon" | "Jihye" | "RU7aSi6lT4uQBXMLgDxK" | "5XgfKMHL4qnyg2mabE5t",
  "engine":       "generative" | "neural" | "eleven_multilingual_v2",
  "mbti_group":   "NT" | "NF" | "ST" | "SF"
}
```

---

## 5. 텍스트·음성 동시 출력 (sentence flusher)

`makeSentenceFlusher` (`service/frontend/src/shared/lib/voiceChat.ts`).

### 5.1 파라미터 (2026-05-24 latency 최적화)

```typescript
firstMinChars:  12      // 첫 phrase 12자 + sentence 경계 → 즉시 flush
restMinChars:   40      // 이후 phrase 40자 + sentence 경계
firstSoftMs:    800     // 첫 phrase 가 마침표 없이 800ms 지나도 강제 flush
SENTENCE_BOUNDARY: /([\s\S]*?[.?!。？！\n])([\s\S]*)$/
```

### 5.2 흐름

1. LLM chunk 도착 → `flusher.push(chunk)` + 화면 텍스트 setState 동시
2. 첫 phrase 12자 + 마침표/물음표/느낌표/줄바꿈 도달 → `speak(sentence)` →
   POST /api/voice/tts → mp3 → `playAudioUrl`
3. 첫 chunk 가 마침표 없이 800ms 지나면 → 강제 flush (firstSoftTimer)
4. 이후 sentence 들은 `ttsTask = ttsTask.then(...)` 직렬 chain
   (앞 sentence 재생 끝나야 다음 fetch — 자연 호흡)
5. chatbot WS `onEnd` → `flusher.end()` 잔여 tail flush

### 5.3 effect

이전 (firstMinChars=25, firstSoftMs 없음): 첫 음성 ~3.5s
현재 (firstMinChars=12, firstSoftMs=800): 첫 음성 ~1.6s

---

## 6. UI 턴 시각 구분 (`SmartSearchOverlay.tsx`)

### 6.1 상태별 시각

| voiceStatus | 박스 배경 | 점 색 (pulse) | 라벨 | 메인 버튼 | 클릭 동작 |
|---|---|---|---|---|---|
| `idle` | gray-50 | gray-300 | "탭하여 말하기" | black + 마이크 | startListening |
| `listening` (내 차례) | **violet-50 + violet ring** | **violet-500** | "내 차례 · 듣고 있어요" | violet-600 + ↑ | submitCurrentPartial |
| `thinking` (AI 차례) | slate-50 | slate-400 | "{editor} 차례 · 생각 중" | slate-200 disabled + 점3개 bounce | (disabled) |
| `speaking` (AI 차례) | **amber-50 + amber ring** | **amber-500** | "{editor} 차례 · 말하는 중 (탭해서 끼어들기)" | amber-500 + ■ 정지 | **bargeIn** |

editor 이름은 `editorAvatars[activePersona].name` — 시현 / 지원 / 정훈 / 하은.

### 6.2 Barge-in (`bargeIn`)

```typescript
turnAbortedRef.current = true   // 후속 chunk/speak 모두 skip (sendAiVoice 내부)
stopVoiceAudio()                // _currentVoiceAudio.pause() + src='' + revokeObjectURL
setVoiceStatus('idle')
setTimeout(() => startListening(), 50)
```

`sendAiVoice` 안 모든 `onChunk` `onEnd` `speak` 가 `turnAbortedRef.current`
가드해 chunk 무시 + ttsTask chain 안에서 fetch/play 즉시 return.

### 6.3 Audio autoplay unlock

마이크 첫 클릭 (`startListening` 진입) → silent wav data-URI Audio 1회 play.
이후 fetch await 후의 `audio.play()` 도 NotAllowedError 안 남.

```typescript
const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
a.muted = true;
a.play().then(() => { audioUnlockedRef.current = true; a.pause(); }).catch(() => {});
```

### 6.4 핸즈프리 (handsFree toggle)

- ON: AI 응답 완료 → 300ms 후 자동 `startListening()` 재호출 — 사용자 마이크
  버튼 누를 필요 X
- OFF: 매 turn 사용자가 마이크 버튼으로 명시 시작

상태 sync 용 `handsFreeRef = useRef(handsFree)` — `sendAiVoice` 클로저 안에서
최신값 참조.

### 6.5 Cleanup

| 트리거 | 동작 |
|---|---|
| handleClose (X 버튼) | recognizer.stop + stopVoiceAudio + 상태 리셋 + onClose() |
| open=false (외부에서 닫기) | useEffect 가 위와 동일 정리 |
| 컴포넌트 언마운트 | useEffect cleanup 함수 |
| mode !== 'voice' (텍스트 모드 전환) | recognizer.stop + stopVoiceAudio |

### 6.6 `stopVoiceAudio()` (`voiceChat.ts`)

```typescript
// 모듈 단위 currentVoiceAudio 추적
let _currentVoiceAudio: HTMLAudioElement | null = null;
let _currentVoiceUrl: string | null = null;

playAudioUrl(url) {
  _currentVoiceAudio = audio;
  audio.onpause = () => {           // 외부 stop → promise resolve (다음 sentence 차단 X)
    if (!audio.ended && audio.currentTime < (audio.duration || Infinity)) {
      cleanup();
      resolve();
    }
  };
}

stopVoiceAudio() {
  audio?.pause();
  audio.src = '';
  URL.revokeObjectURL(_currentVoiceUrl);
  _currentVoiceAudio = null;
}
```

---

## 7. AWS 리소스 inventory

| 리소스 | 식별자 | region |
|---|---|---|
| Lambda chatbot (HTTP) | `sedaily-mbti-chatbot-dev` | us-east-1 |
| Lambda chatbot WS connect | `sedaily-mbti-ws-connect-dev` | us-east-1 |
| Lambda chatbot WS message | `sedaily-mbti-ws-message-dev` | us-east-1 |
| Lambda chatbot WS disconnect | `sedaily-mbti-ws-disconnect-dev` | us-east-1 |
| Lambda STT presign | `sedaily-mbti-voice-stt-presign-dev` | us-east-1 |
| Lambda TTS | `sedaily-mbti-voice-tts-dev` | us-east-1 |
| Lambda 공용 IAM role | `sedaily-mbti-lambda-execution-dev` | — |
| Inline policy (신규 2026-05-24) | `voice-tts-secrets-dev` → `ai-labs/elevenlabs*` GetSecretValue | — |
| Secrets Manager | `ai-labs/elevenlabs` (`{"api_key":"sk_..."}`, 2026-03-20) | us-east-1 |
| API Gateway HTTP | `chzwwtjtgk` (`/api/chat`, `/api/voice/tts`, `/api/voice/stt-presign`) | us-east-1 |
| API Gateway WebSocket | chatbot WS (action=sendMessage) | us-east-1 |
| Bedrock model | `us.anthropic.claude-haiku-4-5-20251001-v1:0` (cross-region) | us-east-1 |
| Transcribe Streaming | `transcribestreaming.us-east-1.amazonaws.com:8443`, ko-KR | us-east-1 |
| Polly | Seoyeon (standard/neural/generative), Jihye (neural) — ko-KR | us-east-1 |
| External TTS | ElevenLabs `api.elevenlabs.io/v1/text-to-speech/{voice_id}` | — |
| Frontend S3 | `sedaily-mbti-frontend-dev` | us-east-1 |
| CloudFront | `E1QS7PY350VHF6` → `mbti.sedaily.ai` | global |

### 7.1 IAM Role 정책 (현재)

`sedaily-mbti-lambda-execution-dev` 부착 정책:

managed:
- AmazonPollyFullAccess
- AWSLambdaBasicExecutionRole
- AmazonDynamoDBFullAccess

inline:
- `ailens-s3-write`
- `OpenSearchAccess`
- `PodcastPermissions`
- `sedaily-mbti-lambda-policy-dev` (S3 GetObject/ListBucket, Bedrock InvokeModel/Stream, Polly SynthesizeSpeech, Transcribe StreamTranscription, SES SendEmail)
- `ws-manage-connections`
- **`voice-tts-secrets-dev`** (신규) — `secretsmanager:GetSecretValue` on `arn:aws:secretsmanager:us-east-1:887078546492:secret:ai-labs/elevenlabs*`

---

## 8. 비용·latency 추정 (한 turn 기준)

| 단계 | 시간 | 비용 |
|---|---|---|
| 사용자 발화 (5초) | 5s | Transcribe Streaming `$0.024/min` × 5/60 ≈ **$0.002** |
| STT final 떨굼 | 300~1500ms (silence promote 보장) | — |
| chatbot Haiku 4.5 첫 chunk | ~600ms | input ~1500 tok × $0.80/M + output ~80 tok × $4/M ≈ **$0.0015** |
| sentence flusher 첫 flush | 12자 누적 ~200ms 또는 800ms firstSoftMs | — |
| POST /api/voice/tts (Polly generative) | ~500ms | $30/M chars × 80 ≈ **$0.0024** |
| POST /api/voice/tts (ElevenLabs Multilingual v2) | ~700ms | $220/M chars × 80 ≈ **$0.0176** |
| audio 재생 | 응답 길이 비례 | — |

**한 turn 첫 음성 latency 합산**: 사용자 발화 종료 ~ 첫 음성 약 **1.4~2.0초**
(이전 Sonnet + firstMinChars=25 일 때 ~3.5초).

**한 turn 평균 비용**: 약 **$0.005~$0.020** (시현/정훈 ElevenLabs hit 시 비쌈).
NF/SF (지원/하은) 만 응답 → Polly 라 더 저렴.

---

## 9. 변경 이력 (최근)

| 날짜 | 항목 | 커밋 / 비고 |
|---|---|---|
| 2026-05-24 | Phase 1: sentence flusher firstMinChars 25 → 12, restMinChars 60 → 40, firstSoftMs 800 신설 | `956c3ae` → 후속 voiceChat 수정 |
| 2026-05-24 | Phase 2: AWS Transcribe Streaming 으로 한국어 STT 교체 (custom event stream codec) | `6a616ce` |
| 2026-05-24 | TTS dual-provider — 시현/정훈 ElevenLabs, 하은 Jihye 정정 | `0b83185` |
| 2026-05-24 | STT silence promote (1.5s) + audio autoplay unlock + 시각 에러 표시 | `0b83185` |
| 2026-05-24 | listening ↑ 즉시 전송 + close/모드전환 시 stopVoiceAudio + 사용자/AI 턴 시각 구분 + speaking 중 barge-in | `0b83185` |
| 2026-05-24 | Chatbot 모델 Sonnet 4.6 → Haiku 4.5 + 도입 멘트 금지 prompt 강화 | (이번 라운드, 미커밋) |

---

## 10. 남은 작업 (next sessions)

- **Phase 3 정식 VAD**: 마이크 RMS 기반 자동 EOS (현재는 partial timer 만).
  TTS 재생 중 사용자 음성 감지 시 자동 barge-in (현재는 수동 ■ 버튼).
- **Phase 4 SSML prosody**: 페르소나별 pitch/rate 미세조정 (Polly Generative 의
  `<prosody>` 지원 범위 + ElevenLabs `voice_settings` 별도 chunk).
- **Phase 5 VoiceCallView 풀스크린 통화**: 페르소나 아바타 + 통화 시간 카운터.
- **Phase 6 Transcribe Custom Vocabulary `ailens-ko`**: 시현·지원·정훈·하은·
  코스피·코스닥·ETF·IPO·양도세·일몰제·신탁사·국민성장펀드 등.
- **Haiku 4.5 비용 태깅 inference profile** `mbti-haiku-45` 생성 (현재 직접 cross-region
  ID 사용해 Workload=chatbot 태그 추적 X).
- **ElevenLabs 사용량 메트릭**: CloudWatch metric `ElevenLabsChars` emit → 월
  budget 알람.

전체 plan 원본: `~/.claude/plans/purrfect-toasting-treasure.md`.

---

## 11. 핵심 파일 목록

### Backend
- `service/backend/handlers/voice/tts.py` — dual-provider TTS Lambda
- `service/backend/handlers/voice/stt_presign.py` — Transcribe presign
- `service/backend/handlers/chatbot_handler.py` — chatbot HTTP/WS Lambda
- `service/backend/config/constants.py` — `BEDROCK_MODEL_ID_CHATBOT`
- `service/backend/prompts/chatbot/{nt,nf,st,sf}.md` — 4 페르소나 prompt
- `service/backend/deploy.sh` — Lambda 일괄 deploy (24 함수)

### Frontend
- `service/frontend/src/components/mbti/SmartSearchOverlay.tsx` — 음성 통화 UI
- `service/frontend/src/shared/lib/voiceChat.ts` — TTS 호출, sentence flusher,
  stopVoiceAudio, sanitizeForTTS
- `service/frontend/src/shared/lib/transcribeStream.ts` — TranscribeStreamRecognizer
- `service/frontend/src/shared/lib/transcribeEventStream.ts` — AWS Event Stream codec
- `service/frontend/src/shared/lib/audioCapture.ts` — getUserMedia + AudioWorklet
- `service/frontend/src/shared/lib/chatbotWs.ts` — chatbot WS client
- `service/frontend/src/shared/lib/elevenlabs.ts` — frontend ElevenLabs voice ID 매핑 (proxy 도입 전 disabled)
- `service/frontend/public/audio-worklet/pcm-downsampler.js` — 48→16kHz 다운샘플

### Docs (인접)
- `service/frontend/.phase/2026-05-24-ai-conversation-phase1-2.md`
- `service/frontend/.phase/2026-05-24-voice-tts-dual-provider.md`
