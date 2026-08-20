import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { Cut, NewsScript } from './schema';
import { DEFAULT_VOICE, synthesizeSpeech, TtsVoiceConfig } from './tts';
import { buildSsml } from './ssml';

const AUDIO_DIR = path.join(process.cwd(), 'public', 'audio');

function cacheKey(ssml: string, voice: TtsVoiceConfig): string {
  return createHash('sha256')
    .update(JSON.stringify({ ssml, voice }))
    .digest('hex')
    .slice(0, 24);
}

async function ensureAudioForCut(
  cut: Cut,
  voice: TtsVoiceConfig
): Promise<{ audioFile: string; duration: number; cached: boolean }> {
  const ssml = buildSsml(cut.narration);
  const key = cacheKey(ssml, voice);
  const fileName = `${key}.mp3`;
  const filePath = path.join(AUDIO_DIR, fileName);

  const cached = existsSync(filePath);
  if (!cached) {
    await mkdir(AUDIO_DIR, { recursive: true });
    const audioBuffer = await synthesizeSpeech(ssml, voice);
    await writeFile(filePath, audioBuffer);
  }

  const metadata = await parseFile(filePath);
  const duration = metadata.format.duration;
  if (!duration) {
    throw new Error(`오디오 길이를 읽을 수 없습니다: ${filePath}`);
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

// script의 각 컷 narration을 TTS로 합성하고(캐시되어 있으면 재사용),
// 실제 오디오 길이로 duration을 덮어써서 반환한다. JSON에 적힌 duration은 참고값일 뿐이다.
export async function resolveScriptAudio(
  script: NewsScript,
  options?: { voice?: TtsVoiceConfig; onProgress?: (progress: ResolveProgress) => void }
): Promise<NewsScript> {
  const voice = options?.voice ?? DEFAULT_VOICE;
  const total = script.cuts.length;
  const resolvedCuts: Cut[] = [];

  for (let i = 0; i < total; i++) {
    const cut = script.cuts[i];
    try {
      const { audioFile, duration, cached } = await ensureAudioForCut(cut, voice);
      options?.onProgress?.({ index: i, total, cutType: cut.type, cached, duration });
      resolvedCuts.push({ ...cut, duration, audioFile });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`컷 ${i + 1}/${total} (${cut.type}) 오디오 처리 실패: ${reason}`);
    }
  }

  return { ...script, cuts: resolvedCuts as NewsScript['cuts'] };
}
