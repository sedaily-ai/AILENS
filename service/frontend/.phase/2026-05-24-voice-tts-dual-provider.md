# 2026-05-24 (밤) — Voice TTS dual-provider (Polly + ElevenLabs)

Phase 1~2 다음 — 사용자가 voice 들어보고 발견한 **페르소나 성별 불일치** 정정.

## 문제

- 시현 (NT) / 정훈 (ST) 은 **남자** 캐릭터인데 Polly 한국어 voice 가 둘 다 **여성**
  (Seoyeon/Jihye) 만 지원 → 4 페르소나 voice 가 사실상 여자 2종만으로 dispatched.
- 사용자 피드백: "시현.. 여자 목소리인데??? 시현은 남자고, 정훈도 남자."
- 추가 발견: 기존 PERSONA_VOICE 의 Jihye `engine: 'generative'` 표기는 잘못 — Polly
  `DescribeVoices ko-KR` 가 Jihye 는 **neural 만 지원**. 호출 시 silent fallback 으로
  neural 갈음하던 상태. 매핑 정정 필요.

## 결정 (사용자 합의)

1. **여성 페르소나 (지원/하은) → Polly 유지** — 한국어 자연도 충분 + 비용 저렴
   (사용자 의견: "polly 있는건 polly 사용하시죠").
2. **남성 페르소나 (시현/정훈) → ElevenLabs Multilingual v2** — Polly 미지원이라
   외부 TTS. voice ID 는 frontend `shared/lib/elevenlabs.ts` 의 `editorVoices` 와 동일
   (2026-05-18 음성 카탈로그 선별).
3. **하은 voice** 는 Jihye neural 로 (사용자 선호 voice).

## 매핑

| MBTI | 페르소나 | Provider | Voice | Engine/Model |
|---|---|---|---|---|
| NT | 시현 (남) | elevenlabs | RU7aSi6lT4uQBXMLgDxK (TeddyNote young 남) | eleven_multilingual_v2 |
| NF | 지원 (여) | polly | Seoyeon | generative |
| ST | 정훈 (남) | elevenlabs | 5XgfKMHL4qnyg2mabE5t (Deck young 남) | eleven_multilingual_v2 |
| SF | 하은 (여) | polly | Jihye | neural |

## 구현

### `service/backend/handlers/voice/tts.py`

- `PERSONA_VOICE` 재구조화 — 각 항목에 `provider` 키 (`polly` | `elevenlabs`).
- `_synth_polly(text, spec)` — 기존 generative→neural fallback 흐름 유지.
- `_synth_elevenlabs(text, spec)`:
  - `urllib.request` 로 `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` POST.
  - body `{ text, model_id, voice_settings }`. voice_settings 는 frontend
    `CONVERSATIONAL_VOICE` 와 동일 (stability 0.5 / similarity_boost 0.78 / style 0.25 /
    use_speaker_boost true) — 대화체 톤 일관.
  - `xi-api-key` 헤더로 인증. 12s timeout.
  - **실패 시 Polly Seoyeon neural fallback** — 무음 응답 방지. log warning + 응답
    `provider`/`engine` 은 fallback 값으로 표시.
- `_get_elevenlabs_api_key()` — `boto3 secretsmanager.get_secret_value('ai-labs/elevenlabs')`
  로 JSON `{api_key}` 추출. **5분 TTL 모듈 캐시** (`common/secrets.py` 패턴). cold start
  후 첫 호출만 SecretsManager hit.
- `preprocess_for_polly(text)` 는 두 provider 모두 적용 (KT→케이티, AI→에이아이 등 —
  ElevenLabs Multilingual v2 도 약어 직독 시 어색).
- 응답에 `provider` 필드 신설.

### AWS IAM

`sedaily-mbti-lambda-execution-dev` (공용 role) 에 inline policy `voice-tts-secrets-dev`
추가:

```json
{
  "Effect": "Allow",
  "Action": ["secretsmanager:GetSecretValue"],
  "Resource": "arn:aws:secretsmanager:us-east-1:887078546492:secret:ai-labs/elevenlabs*"
}
```

Resource 한정 — 같은 role 을 쓰는 다른 23개 Lambda 도 secret 자체에 직접 접근
가능하지만 ai-labs/elevenlabs 외 다른 secret 은 불가.

### 비밀 보관

- AWS Secrets Manager `ai-labs/elevenlabs` (us-east-1), JSON `{"api_key": "sk_..."}`.
- 마지막 로테이션: 2026-03-20. ARN
  `arn:aws:secretsmanager:us-east-1:887078546492:secret:ai-labs/elevenlabs-MjRuuL`.
- 과거 frontend `elevenlabs.ts` 에 hardcoded 키 노출 → 제거됐고 backend proxy 미구축
  으로 `generateSpeech` disabled 상태였음. 이번 backend proxy 가 TODO 해소.

## Verification

`./deploy.sh api` (24 함수 update) 후 production API 확인:

```bash
API="https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev"
for g in NT NF ST SF; do
  curl -s -X POST "$API/api/voice/tts" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"안녕하세요 $g 페르소나 테스트입니다\",\"mbti_group\":\"$g\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); \
        print(g,'provider=',d.get('provider'),'voice=',d.get('voice_id'),'len=',len(d.get('audio','')))"
done
```

결과:

```
NT provider= elevenlabs voice= RU7aSi6lT4uQBXMLgDxK len= 50216
NF provider= polly      voice= Seoyeon              len= 28092
ST provider= elevenlabs voice= 5XgfKMHL4qnyg2mabE5t len= 54116
SF provider= polly      voice= Jihye                len= 23484
```

ElevenLabs 평균 응답 ~52KB / Polly 평균 ~25KB — ElevenLabs 가 동일 텍스트 대비 bit-rate
약 2배 (음질↑). 통화 중에는 streaming 이라 양 차이가 latency 직접 영향 X.

## 비용 노트

- Polly Generative: $30/M chars (Seoyeon)
- Polly Neural: $16/M chars (Jihye)
- ElevenLabs Multilingual v2 (Creator $22/mo): $0.22/1000 chars = $220/M chars
- 4 페르소나 중 남자 2명만 ElevenLabs 라 전체 통화 char 의 ~50% 만 ElevenLabs hit.
- 사용량 모니터링 항목 (다음 라운드): CloudWatch metric `ElevenLabsChars` emit →
  월 budget 알람.

## 남은 작업 (next session)

- Phase 3 (VAD 800ms + Barge-in) — TTS 재생 중 사용자 발화 시 즉시 중단.
- Phase 4 (SSML prosody) — 페르소나별 pitch/rate 미세 조정. ElevenLabs 의 `voice_settings`
  로 페르소나별 stability/style 차별화 추가 검토.
- Phase 5 (VoiceCallView 풀스크린).
- Phase 6 (Custom Vocabulary ailens-ko).
- ElevenLabs 비용 메트릭 emit + 알람.

## Commit

`feat(voice): TTS dual-provider — 시현·정훈 ElevenLabs 남자 voice + 하은 Jihye 정정`
