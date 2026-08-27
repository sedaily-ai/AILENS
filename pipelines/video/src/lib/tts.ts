import { PollyClient, SynthesizeSpeechCommand, Engine, VoiceId } from '@aws-sdk/client-polly';

export type TtsVoiceConfig = {
  voiceId: VoiceId;
  engine?: Engine;
};

// 2026-08-23 — Google Cloud TTS(Chirp3-HD)에서 ElevenLabs로 전환.
// 2026-08-27 — ElevenLabs에서 AWS Polly로 재전환. 실사용량(월 565K자) 기준
// ElevenLabs 실비용이 구독료+초과요금 합산 약 $95.81/월인데, 같은 물량을
// Polly generative 엔진으로 합성하면 약 $17/월(82% 절감) — 같은 대본으로
// 품질 비교 샘플까지 직접 뽑아 확인 후 결정(pipelines/podcast/pipeline.py와
// 같은 이유, 그쪽과 동일 보이스로 통일). 별도 API 키·Secrets Manager도
// 더는 필요 없다 — Fargate 태스크 IAM 롤 권한만으로 호출.
// 한국어 보이스 중 generative 엔진을 지원하는 건 Seoyeon뿐(Jihye는 neural 전용).
export const DEFAULT_VOICE: TtsVoiceConfig = {
  voiceId: (process.env.TTS_VOICE_ID as VoiceId) ?? 'Seoyeon',
  engine: (process.env.TTS_ENGINE as Engine) ?? 'generative',
};

const REGION = process.env.AWS_REGION ?? 'us-east-1';

let cachedClient: PollyClient | null = null;

function getClient(): PollyClient {
  if (!cachedClient) {
    cachedClient = new PollyClient({ region: REGION });
  }
  return cachedClient;
}

export async function synthesizeSpeech(
  text: string,
  voice: TtsVoiceConfig = DEFAULT_VOICE
): Promise<Buffer> {
  const client = getClient();

  let audioStream;
  try {
    const resp = await client.send(
      new SynthesizeSpeechCommand({
        Text: text,
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
