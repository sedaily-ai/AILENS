import { PollyClient, SynthesizeSpeechCommand, Engine, VoiceId } from '@aws-sdk/client-polly';

export type TtsProvider = 'polly' | 'elevenlabs';

export type ElevenLabsVoiceSettings = {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed: number;
};

export type TtsVoiceConfig = {
  provider: TtsProvider;
  // Polly(provider === 'polly'일 때만 의미 있음)
  voiceId?: VoiceId;
  engine?: Engine;
  // Polly SSML <prosody> 속도·음량. pipelines/common/podcast_voice.py::_synthesize_polly와 같은 형식
  // ("100%"/"+0dB")이며 값을 그대로 <prosody rate volume> 속성에 넣는다.
  rate?: string;
  volume?: string;
  // ElevenLabs(provider === 'elevenlabs'일 때만 의미 있음)
  elevenLabsVoiceId?: string;
  elevenLabsModelId?: string;
  elevenLabsApiKey?: string;
  elevenLabsVoiceSettings?: ElevenLabsVoiceSettings;
};

// pipelines/common/elevenlabs_tts.py::DEFAULT_VOICE_SETTINGS/VOICE_SETTINGS_RANGES와 값을 맞춘다.
// 환경변수가 없으면(발행 설정에 저장 안 된 키) 이 기본값을 쓴다.
const ELEVENLABS_DEFAULT_VOICE_SETTINGS: ElevenLabsVoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
  speed: 1.0,
};
const ELEVENLABS_VOICE_SETTINGS_RANGES: Record<'stability' | 'similarity_boost' | 'style' | 'speed', [number, number]> = {
  stability: [0, 1],
  similarity_boost: [0, 1],
  style: [0, 1],
  speed: [0.7, 1.2],
};

function clampElevenLabsVoiceSettings(): ElevenLabsVoiceSettings {
  const result = { ...ELEVENLABS_DEFAULT_VOICE_SETTINGS };
  const envNum = (key: keyof typeof ELEVENLABS_VOICE_SETTINGS_RANGES, envVar: string) => {
    const raw = process.env[envVar];
    if (raw === undefined) return;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return;
    const [lo, hi] = ELEVENLABS_VOICE_SETTINGS_RANGES[key];
    result[key] = Math.max(lo, Math.min(hi, n));
  };
  envNum('stability', 'ELEVENLABS_STABILITY');
  envNum('similarity_boost', 'ELEVENLABS_SIMILARITY_BOOST');
  envNum('style', 'ELEVENLABS_STYLE');
  envNum('speed', 'ELEVENLABS_SPEED');
  if (process.env.ELEVENLABS_SPEAKER_BOOST !== undefined) {
    result.use_speaker_boost = process.env.ELEVENLABS_SPEAKER_BOOST === 'true';
  }
  return result;
}

// 기본 TTS는 AWS Polly generative 엔진이다. 월 565K자 기준 ElevenLabs는 약 $95.81, Polly generative는
// 약 $17이어서(pipelines/podcast/pipeline.py와 같은 이유) 그쪽과 같은 보이스를 쓴다.
// 한국어 보이스 중 generative를 지원하는 것은 Seoyeon뿐이다(Jihye는 neural 전용).
//
// ElevenLabs도 발행 설정으로 고를 수 있다. 호출부는 pipelines/common/elevenlabs_tts.py(Python)의
// REST 호출과 의도적으로 같은 모양이다(엔드포인트, 요청 바디 text/model_id/voice_settings, 헤더 xi-api-key).
// API 키는 Python 쪽(render_from_script.py/publish_utils.py)이 Secrets Manager에서 읽어
// ELEVENLABS_API_KEY 환경변수로 넘긴다. Node가 AWS SDK로 시크릿을 직접 읽으면 새 npm 의존성이 필요해서다.
export const DEFAULT_VOICE: TtsVoiceConfig = {
  provider: (process.env.TTS_PROVIDER as TtsProvider) ?? 'polly',
  voiceId: (process.env.TTS_VOICE_ID as VoiceId) ?? 'Seoyeon',
  engine: (process.env.TTS_ENGINE as Engine) ?? 'generative',
  // pipelines/common/video_settings.py::get_render_env()가 넘기는 TTS_RATE/TTS_VOLUME.
  // 기본값은 podcast_voice.py의 _DEFAULT_RATE/_DEFAULT_VOLUME과 같다("100%"/"+0dB" = 변화 없음).
  rate: process.env.TTS_RATE ?? '100%',
  volume: process.env.TTS_VOLUME ?? '+0dB',
  elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID,
  elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID,
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
  elevenLabsVoiceSettings: clampElevenLabsVoiceSettings(),
};

const REGION = process.env.AWS_REGION ?? 'us-east-1';

let cachedClient: PollyClient | null = null;

function getClient(): PollyClient {
  if (!cachedClient) {
    cachedClient = new PollyClient({ region: REGION });
  }
  return cachedClient;
}

// pipelines/common/podcast_voice.py::_xml_escape(xml.sax.saxutils.escape)와
// 동일 범위 — SSML 안에 실릴 내레이션 텍스트만 이스케이프한다(rate/volume은
// 닫힌 값 집합(video_settings.py::_VALID_RATES/_VALID_VOLUMES)에서만 오므로
// 이스케이프 불필요).
function escapeSsmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Polly SSML <prosody>를 쓴다. 평문(Text=)만 보내면 video-settings의 속도·음량이 반영되지 않는다
// (pipelines/common/video_settings.py 모듈 docstring 참고). podcast_voice.py::_synthesize_polly와
// 같은 패턴으로 rate/volume을 <prosody> 속성에 넣고 TextType을 'ssml'로 보낸다.
async function synthesizeSpeechPolly(text: string, voice: TtsVoiceConfig): Promise<Buffer> {
  const client = getClient();
  const rate = voice.rate ?? '100%';
  const volume = voice.volume ?? '+0dB';
  const ssml = `<speak><prosody rate="${rate}" volume="${volume}">${escapeSsmlText(text)}</prosody></speak>`;

  let audioStream;
  try {
    const resp = await client.send(
      new SynthesizeSpeechCommand({
        Text: ssml,
        TextType: 'ssml',
        OutputFormat: 'mp3',
        VoiceId: voice.voiceId,
        Engine: voice.engine ?? 'generative',
        LanguageCode: 'ko-KR',
      })
    );
    audioStream = resp.AudioStream;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Polly TTS 요청 실패(voice: ${voice.voiceId}): ${reason}`);
  }

  if (!audioStream) {
    throw new Error(`Polly TTS 응답에 오디오 스트림이 없습니다(voice: ${voice.voiceId})`);
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of audioStream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// pipelines/common/elevenlabs_tts.py::synthesize()와 의도적으로 같은 모양
// (엔드포인트·요청 바디·헤더) — 그쪽 docstring/모듈 주석과 같이 읽을 것.
async function synthesizeSpeechElevenLabs(text: string, voice: TtsVoiceConfig): Promise<Buffer> {
  if (!voice.elevenLabsApiKey) {
    throw new Error('ElevenLabs TTS 요청 실패: ELEVENLABS_API_KEY가 없습니다(Python 호출부에서 안 넘겼을 가능성)');
  }
  if (!voice.elevenLabsVoiceId) {
    throw new Error('ElevenLabs TTS 요청 실패: elevenLabsVoiceId가 없습니다');
  }
  const modelId = voice.elevenLabsModelId || 'eleven_multilingual_v2';
  const voiceSettings = voice.elevenLabsVoiceSettings ?? ELEVENLABS_DEFAULT_VOICE_SETTINGS;

  let resp: Response;
  try {
    resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice.elevenLabsVoiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': voice.elevenLabsApiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({ text, model_id: modelId, voice_settings: voiceSettings }),
      }
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`ElevenLabs TTS 요청 실패(voice: ${voice.elevenLabsVoiceId}): ${reason}`);
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`ElevenLabs TTS 오류(${resp.status}, voice: ${voice.elevenLabsVoiceId}): ${detail.slice(0, 300)}`);
  }

  return Buffer.from(await resp.arrayBuffer());
}

export async function synthesizeSpeech(
  text: string,
  voice: TtsVoiceConfig = DEFAULT_VOICE
): Promise<Buffer> {
  return voice.provider === 'elevenlabs'
    ? synthesizeSpeechElevenLabs(text, voice)
    : synthesizeSpeechPolly(text, voice);
}
