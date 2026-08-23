import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export type TtsVoiceConfig = {
  name: string; // ElevenLabs voice ID
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
};

// 2026-08-23 — Google Cloud TTS(Chirp3-HD)에서 ElevenLabs로 전환.
// 개인 gcloud 계정 OAuth(ADC)로 인증하던 방식이라 Fargate에서 못 쓰고,
// 프로젝트가 AWS 위주인데 TTS만 별도 벤더(GCP)를 쓸 이유가 없어졌다.
// 팟캐스트 파이프라인(pipelines/podcast/pipeline.py)이 이미 검증해 쓰고
// 있는 동일 보이스(Juan - Deep & Rich Storyteller)를 그대로 재사용 —
// Secrets Manager `ElevenLabs/ApiKey`도, 태스크 IAM 권한도 이미 있다.
export const DEFAULT_VOICE: TtsVoiceConfig = {
  name: process.env.TTS_VOICE_ID ?? '8lidWTlnwgjObqCImnE2',
  modelId: 'eleven_multilingual_v2',
};

const REGION = process.env.AWS_REGION ?? 'us-east-1';
const SECRET_NAME = 'ElevenLabs/ApiKey';

let cachedApiKey: string | null = null;

async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  const client = new SecretsManagerClient({ region: REGION });
  const resp = await client.send(new GetSecretValueCommand({ SecretId: SECRET_NAME }));
  if (!resp.SecretString) {
    throw new Error(`Secrets Manager에 ${SECRET_NAME} 값이 없습니다.`);
  }
  cachedApiKey = resp.SecretString;
  return cachedApiKey;
}

// text는 평문 그대로 넘긴다 — ElevenLabs는 임의 SSML을 지원하지 않고,
// 문장부호(. ? !) 기준 자연스러운 쉼을 모델이 알아서 넣어준다(팟캐스트
// 파이프라인에서 이미 검증됨).
export async function synthesizeSpeech(
  text: string,
  voice: TtsVoiceConfig = DEFAULT_VOICE
): Promise<Buffer> {
  const apiKey = await getApiKey();

  let res: Response;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.name}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: voice.modelId ?? 'eleven_multilingual_v2',
        voice_settings: {
          stability: voice.stability ?? 0.5,
          similarity_boost: voice.similarityBoost ?? 0.75,
        },
      }),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`ElevenLabs TTS 요청 실패(voice: ${voice.name}): ${reason}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `ElevenLabs TTS 요청 실패 (voice: ${voice.name}, status: ${res.status}): ${detail}`
    );
  }

  const audioContent = await res.arrayBuffer();
  return Buffer.from(audioContent);
}
