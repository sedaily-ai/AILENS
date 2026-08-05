# 2026-05-24 (저녁) — AI 대화 디벨롭 Phase 1+2

브랜치 `feat/ai-conversation` 의 첫 두 단계. PR 13 이 main 머지 후 진행.
6 Phase plan 의 1·2 단계 완료, 3~6 다음 라운드.

전체 plan: `~/.claude/plans/purrfect-toasting-treasure.md` (Phase 1~6 + AWS 리소스 + 비용 + 검증).

## Phase 1 — 첫 호흡 빠른 TTS streaming (frontend-only)

**원인**:
- Polly Bidirectional Streaming API (2026-03 GA) 가 진짜 token-level streaming
  이지만 **Python boto3 미지원** (Java/JS v3/Go/Ruby/Rust/Swift 만). 백엔드 Lambda
  파이썬이라 sync API 유지.
- 기존 `makeSentenceFlusher` 가 minChars=60 으로 첫 phrase 60자 누적까지 대기 →
  첫 TTS 호출 지연 → "텍스트 다 나온 뒤 음성" 체감.

**수정** (`service/frontend/src/shared/lib/voiceChat.ts`):
- `makeSentenceFlusher(callback, { firstMinChars?, restMinChars? })` 옵션 객체.
- `firstMinChars = 25` (default): 첫 phrase 25자만 모이면 sentence 경계 시 즉시
  flush → 첫 audio latency 최소.
- `restMinChars = 60`: 이후 phrase 들은 한 호흡으로 묶어 자연 inflection.
- `isFirst` flag 로 첫 호흡/이후 호흡 분기. `end()` 시 리셋.

**효과** (응답 1~2문장 60~140자 기준):
- 첫 phrase = 거의 전체 답. 25자 시점에 flush → Polly generative 첫 byte ~300-500ms.
- 사용자 발화 종료 (Web Speech VAD ~500ms) + LLM 첫 chunk (~800ms) + TTS 첫 byte (~400ms)
  ≈ **~1.7초 만에 첫 음성**. 이전 60자 기준은 ~2.5-3초.

**Polly Bidirectional 대안 메모** (사용자 결정 시 추가):
- A. Python sync 강화 (이번 선택, 1~2시간)
- B. Node.js Lambda 신규 (JS SDK v3 로 진짜 bidirectional, 3~5일)
- C. 브라우저 직접 (Cognito Identity Pool, 보안 위험)
- 사용자 선택 A.

**Commit**: `956c3ae perf(voice): Phase 1 — sentence flusher firstMinChars 25 / restMinChars 60`

---

## Phase 2 — AWS Transcribe Streaming 으로 한국어 STT 교체

**원인**:
- 기존 `VoiceRecognizer` (Web Speech API) 는 브라우저별 한국어 정확도 편차 큼.
- iOS Safari 미지원 — getSpeechRecognitionCtor 가 null 반환 → 사용 불가.
- Custom vocabulary 적용 불가 (페르소나 이름·경제 용어 인식 한계).

**전제 인프라 (이미 deploy 됨)**:
- presign Lambda `sedaily-mbti-voice-stt-presign-dev` (`POST /api/voice/stt-presign`)
  body `{language:'ko-KR', sample_rate:16000}` → SigV4 서명 `wss://transcribestreaming.us-east-1.amazonaws.com:8443/stream-transcription-websocket?...`
  반환, expires 300s.
- 백엔드 추가 작업 X (Phase 6 에서 `VocabularyName` 추가 예정).

**구현 — dep 없이 custom**:

### 1) `public/audio-worklet/pcm-downsampler.js` (~40줄)
- AudioWorkletProcessor 'pcm-downsampler'
- AudioContext native sample rate (48000 보통) → 16000 Int16 PCM linear interpolation
- flushThreshold 4096 samples (~256ms) 마다 main thread 로 transferable
  ArrayBuffer post (zero-copy)
- 단순 LP filter 없는 다운샘플 (Transcribe 가 자체 처리)

### 2) `src/shared/lib/audioCapture.ts` (~80줄)
- `AudioCapture` 클래스 — onChunk(pcm) 콜백
- `getUserMedia({ audio: { echoCancellation, noiseSuppression, autoGainControl, channelCount: 1 }})` 통화 환경 기본
- AudioContext + Safari `webkitAudioContext` 호환
- iOS 자동재생 정책 — context.state suspended 시 resume() 호출
- worklet 모듈 로드: `/audio-worklet/pcm-downsampler.js`
- `silent gain (0)` 을 destination 에 연결해 process() 호출 유도 + 스피커 echo 방지
  (worklet 만 만들면 graph 가 destination 까지 path 없어 process 안 돌아감)

### 3) `src/shared/lib/transcribeEventStream.ts` (~190줄)
- AWS event stream binary codec, spec 그대로:
  https://docs.aws.amazon.com/transcribe/latest/dg/event-stream.html
- Frame: `[4:totalLen][4:headersLen][4:preludeCRC][headers][payload][4:messageCRC]` (big-endian)
- Header: `[1:nameLen][name utf-8][1:type=7 string][2:valueLen][value utf-8]`
- CRC32 (IEEE 802.3 reversed 0xEDB88320) 256-entry table
- `encodeAudioEvent(pcm)`: 3 헤더 (`:content-type=application/octet-stream`,
  `:event-type=AudioEvent`, `:message-type=event`) + PCM payload
- `decodeMessage(frame)`: prelude/message CRC 검증, length 검증, header parse (string type only),
  payload subarray. 다른 value type 만나면 throw.
- `parseTranscriptEvent(msg)`: `:event-type === 'TranscriptEvent'` 일 때 JSON.parse
  → `{ Transcript: { Results: [{ Alternatives, IsPartial, ResultId }] } }`
- `getExceptionMessage(msg)`: `:message-type === 'exception'` 시 에러 메시지 추출

### 4) `src/shared/lib/transcribeStream.ts` (~170줄)
- `TranscribeStreamRecognizer` — 기존 `VoiceRecognizer` 와 동일 인터페이스
  (`onPartial/onFinal/onError/onEnd`) → drop-in.
- 흐름:
  1. `POST /api/voice/stt-presign` → wss URL
  2. WebSocket open (binaryType='arraybuffer')
  3. message handler — decodeMessage + exception 체크 + parseTranscriptEvent
  4. open 대기 후 AudioCapture start
  5. chunk 마다 encodeAudioEvent + ws.send
  6. Results 각 항목 IsPartial=true → onPartial, false → onFinal
- `stop()`: 빈 AudioEvent 보내 Transcribe 에 EOF, ws.close(1000), cleanup
- WS close code !== 1000 시 onError 알림 (presign 만료 / 인증 실패 4xx 추적용)

**수정**:
- `voiceChat.ts`:
  - `TranscribeStreamRecognizer` import
  - `createRecognizer(opts)` helper 신설:
    - default = Transcribe
    - localStorage `stt-prefer-webspeech=1` 시 Web Speech (디버그용)
  - `VoiceRecognizer` 기존 그대로 export (호환)
- `SmartSearchOverlay.tsx`:
  - `VoiceRecognizer` + `isSpeechRecognitionAvailable` import 제거
  - `createRecognizer`, `VoiceRecognizerOptions` import
  - `recognizerRef` 타입 `ReturnType<typeof createRecognizer>` 로
  - `startListening` 내부 `new VoiceRecognizer(...)` → `createRecognizer(opts)`
  - `recognizer.start()` 가 sync/async 양쪽 가능 → `void recognizer.start()`
  - 환경 미지원 분기 (`isSpeechRecognitionAvailable`) 제거 (Transcribe 가 모든 환경 커버)

**Verification**:
- typecheck pass
- presign 호출 검증: `POST /api/voice/stt-presign` body `{language:'ko-KR', sample_rate:16000}`
  → HTTP 200 + `url` (wss prefix) 확인
- 데스크탑 Chrome / iOS Safari 둘 다 마이크 권한 → 한국어 발화 → partial → final

**Commit**: `6a616ce feat(stt): Phase 2 — AWS Transcribe Streaming 으로 한국어 STT 교체`

**Known 한계 (Phase 6 에서 해결)**:
- presign Lambda 가 `VocabularyName` 파라미터 미전달. 페르소나 이름 (시현/지원/정훈/하은)·
  경제 용어 (코스피, 양도세, 일몰제, 신탁사 등) 정확도 차이 남아있음.
- Phase 6 에서 Custom Vocab `ailens-ko` 생성 + presign Lambda 수정 + 적용.

---

## 남은 단계 (next sessions)

### Phase 3 — VAD 800ms + Barge-in + turn-taking
- `src/shared/lib/vad.ts` 신규 (AudioWorklet RMS + smoothing, 800ms 침묵 → end-of-speech)
- TTS 재생 중 마이크 RMS > threshold + Transcribe partial 도착 → audio.pause() +
  WS close + LLM stream abort (AbortController)
- 상태 머신 `idle | listening | thinking | speaking | bargein`

### Phase 4 — SSML 자연 발화 + 페르소나별 prosody preset
- `voice/tts.py` 의 `preprocess_for_polly` → `build_ssml(text, mbti_group)`,
  TextType='ssml'
- 문장 끝 자연 휴지 (break time), 숫자/단위 say-as, 영어 약어 sub alias
- 페르소나별 prosody (NT pitch -2%, NF +2%, ST rate 105%, SF +4%)
  — Polly Generative `<prosody>` 지원 범위 내

### Phase 5 — VoiceCallView 풀스크린 통화 활성화
- mock 로직 제거 → voiceStream + TranscribeStreamRecognizer + vad 연동
- 헤더 "대화" → VoiceCallView 풀스크린 진입
- public/sounds/call-{connect,end}.mp3 (~300ms)

### Phase 6 — Transcribe Custom Vocabulary 생성 + 프롬프트 미세조정
- AWS CLI: `aws transcribe create-vocabulary --language-code ko-KR --vocabulary-name ailens-ko --phrases @phrases.txt`
- phrases: 시현 / 지원 / 정훈 / 하은 / AI-LENS / 코스피 / 코스닥 / ETF / IPO / 양도세 /
  일몰제 / 신탁사 / 국민성장펀드 / 매입임대 / 특별성과급
- presign Lambda 수정해서 `VocabularyName` 쿼리 파라미터 추가
- chatbot prompt 미세조정 (30~70자 권장, 수치 단위 명시)

---

## AWS 리소스 변경 (이번 Phase 1+2 — 없음)

frontend-only 변경. Lambda code · IAM · API Gateway 변경 X. presign Lambda 이미
deploy 되어있어 backend 작업 0건.
