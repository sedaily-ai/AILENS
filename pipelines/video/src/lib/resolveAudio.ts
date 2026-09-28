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

// 2026-09-24, Remotion Lambda 전환(render-lambda.ts) — Lambda 렌더는 각
// 프레임 구간이 별도 함수 인스턴스에서 실행돼 로컬 public/audio/ 번들에
// 의존할 수 없다(사이트가 배포 시점에 한 번 번들돼 여러 렌더에 재사용되므로
// 요청마다 생성되는 오디오를 번들에 끼워 넣을 수 없음). S3에 올려 절대
// URL로 참조하면 어느 Lambda 인스턴스에서든 접근 가능 — 로컬 Fargate 렌더
// (render.ts)는 기존처럼 staticFile() 상대경로를 그대로 쓴다.
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

// 2026-09-24, 사용자 요청("동영상 생성이 더 빨라지면 생성할 맛 날 것
// 같은데") — 조사로 확인한 실측: 9컷 순차 처리에 58초(컷당 4~10초,
// 네트워크 왕복 TTS API 호출이라 CPU와 무관하게 그냥 대기 시간). 워커
// 풀로 동시 처리한다 — 무제한 Promise.all이 아니라 4로 제한한 이유는
// ElevenLabs(video_settings에서 프로덕션 발행용으로 선택 가능, tts.ts
// 참고)의 요금제별 동시 요청 한도를 넘겨 429가 나는 걸 피하기 위함
// (Polly는 이보다 한도가 넉넉해서 문제없음, 더 낮은 공통분모에 맞춤).
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
