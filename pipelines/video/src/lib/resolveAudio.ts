import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Cut, NewsScript } from './schema';
import { DEFAULT_VOICE, synthesizeSpeech, TtsVoiceConfig } from './tts';

const AUDIO_DIR = path.join(process.cwd(), 'public', 'audio');

function cacheKey(text: string, voice: TtsVoiceConfig): string {
  return createHash('sha256')
    .update(JSON.stringify({ text, voice }))
    .digest('hex')
    .slice(0, 24);
}

// Remotion Lambda 렌더(render-lambda.ts)는 프레임 구간마다 별도 함수 인스턴스에서 실행돼 로컬
// public/audio/ 번들에 의존할 수 없다(사이트는 배포 시점에 한 번 번들돼 여러 렌더에 재사용되므로
// 요청별 오디오를 끼워 넣을 수 없다). S3에 올려 절대 URL로 참조하면 어느 인스턴스에서든 접근할 수 있다.
// 로컬 Fargate 렌더(render.ts)는 staticFile() 상대경로를 쓴다.
export type AudioUploadTarget = { bucket: string; keyPrefix: string };

let cachedS3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return cachedS3Client;
}

async function ensureAudioForCut(
  cut: Cut,
  voice: TtsVoiceConfig,
  upload?: AudioUploadTarget
): Promise<{ audioFile: string; duration: number; cached: boolean }> {
  const text = cut.narration.trim();
  const key = cacheKey(text, voice);
  const fileName = `${key}.mp3`;
  const filePath = path.join(AUDIO_DIR, fileName);

  const cached = existsSync(filePath);
  if (!cached) {
    await mkdir(AUDIO_DIR, { recursive: true });
    const audioBuffer = await synthesizeSpeech(text, voice);
    await writeFile(filePath, audioBuffer);
  }

  const metadata = await parseFile(filePath);
  const duration = metadata.format.duration;
  if (!duration) {
    throw new Error(`오디오 길이를 읽을 수 없습니다: ${filePath}`);
  }

  if (upload) {
    const s3Key = `${upload.keyPrefix}/${fileName}`;
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: upload.bucket,
        Key: s3Key,
        Body: await readFile(filePath),
        ContentType: 'audio/mpeg',
      })
    );
    const region = process.env.AWS_REGION ?? 'us-east-1';
    return { audioFile: `https://${upload.bucket}.s3.${region}.amazonaws.com/${s3Key}`, duration, cached };
  }

  return { audioFile: `audio/${fileName}`, duration, cached };
}

export type ResolveProgress = {
  index: number;
  total: number;
  cutType: Cut['type'];
  cached: boolean;
  duration: number;
};

// 컷별 TTS는 네트워크 왕복 대기라 순차 처리하면 느리다(9컷 순차 58초 실측, 컷당 4~10초).
// 워커 풀로 동시 처리하되, ElevenLabs(tts.ts 참고)의 요금제별 동시 요청 한도를 넘겨 429가 나지
// 않도록 무제한 Promise.all이 아니라 4로 제한한다(Polly는 한도가 더 넉넉해 낮은 쪽에 맞춘다).
const TTS_CONCURRENCY = 4;

// script의 각 컷 narration을 TTS로 합성하고(캐시되어 있으면 재사용),
// 실제 오디오 길이로 duration을 덮어써서 반환한다. JSON에 적힌 duration은 참고값일 뿐이다.
export async function resolveScriptAudio(
  script: NewsScript,
  options?: { voice?: TtsVoiceConfig; onProgress?: (progress: ResolveProgress) => void; upload?: AudioUploadTarget }
): Promise<NewsScript> {
  const voice = options?.voice ?? DEFAULT_VOICE;
  const total = script.cuts.length;
  const resolvedCuts: Cut[] = new Array(total);

  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= total) return;
      const cut = script.cuts[i];
      try {
        const { audioFile, duration, cached } = await ensureAudioForCut(cut, voice, options?.upload);
        options?.onProgress?.({ index: i, total, cutType: cut.type, cached, duration });
        resolvedCuts[i] = { ...cut, duration, audioFile };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`컷 ${i + 1}/${total} (${cut.type}) 오디오 처리 실패: ${reason}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(TTS_CONCURRENCY, total) }, worker));

  return { ...script, cuts: resolvedCuts as NewsScript['cuts'] };
}
