import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseNewsScript } from '../src/lib/schema';
import { resolveScriptAudio } from '../src/lib/resolveAudio';
import { DEFAULT_VOICE } from '../src/lib/tts';
import { parseArgs } from '../src/lib/cliArgs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input;
  if (!inputPath) {
    throw new Error('사용법: tsx scripts/resolve-audio.ts --input <script.json> [--out <resolved.json>] [--voice <voiceName>]');
  }
  const outPath = args.out ?? inputPath.replace(/\.json$/, '.resolved.json');
  const voice = args.voice ? { ...DEFAULT_VOICE, name: args.voice } : DEFAULT_VOICE;

  let raw: string;
  try {
    raw = await readFile(path.resolve(inputPath), 'utf-8');
  } catch (err) {
    throw new Error(`입력 파일을 읽을 수 없습니다: ${inputPath}\n${err instanceof Error ? err.message : err}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`JSON 파싱 실패: ${inputPath}\n${err instanceof Error ? err.message : err}`);
  }

  const script = parseNewsScript(json); // 스키마 오류 시 필드별 메시지와 함께 여기서 throw

  console.log(`${script.cuts.length}개 컷 TTS 처리 시작 (voice: ${voice.voiceId})`);

  const resolved = await resolveScriptAudio(script, {
    voice,
    onProgress: (p) => {
      const tag = p.cached ? '캐시 사용' : '신규 합성';
      console.log(
        `  [${p.index + 1}/${p.total}] ${p.cutType.padEnd(9)} ${tag} — ${p.duration.toFixed(2)}s`
      );
    },
  });

  await writeFile(path.resolve(outPath), JSON.stringify(resolved, null, 2), 'utf-8');
  console.log(`완료: ${outPath}`);
}

main().catch((err) => {
  console.error(`\n오류: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
