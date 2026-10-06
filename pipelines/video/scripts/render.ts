import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { parseNewsScript, FORMAT_DIMENSIONS, COMPOSITION_ID, Format } from '../src/lib/schema';
import { resolveScriptAudio } from '../src/lib/resolveAudio';
import { DEFAULT_VOICE } from '../src/lib/tts';
import type { VoiceId } from '@aws-sdk/client-polly';
import { parseArgs } from '../src/lib/cliArgs';

const USAGE =
  '사용법: npm run render -- --input <script.json> --format <vertical|horizontal> --output <out.mp4> ' +
  '[--voice <voiceName>] [--skip-tts]';

function isFormat(value: string | undefined): value is Format {
  return value === 'vertical' || value === 'horizontal';
}

async function loadScript(inputPath: string) {
  let raw: string;
  try {
    raw = await readFile(path.resolve(inputPath), 'utf-8');
  } catch (err) {
    throw new Error(
      `입력 파일을 읽을 수 없습니다: ${inputPath}\n${err instanceof Error ? err.message : err}`
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`JSON 파싱 실패: ${inputPath}\n${err instanceof Error ? err.message : err}`);
  }

  return parseNewsScript(json); // 스키마 오류 시 필드별 메시지와 함께 여기서 throw
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { input, format, output, voice: voiceName } = args;

  if (!input || !output || !format) {
    throw new Error(USAGE);
  }
  if (!isFormat(format)) {
    throw new Error(`--format은 vertical 또는 horizontal이어야 합니다 (입력값: "${format}")\n${USAGE}`);
  }

  const script = await loadScript(input);
  const voice = voiceName ? { ...DEFAULT_VOICE, voiceId: voiceName as VoiceId } : DEFAULT_VOICE;

  console.log(`[1/3] TTS 처리 (${script.cuts.length}개 컷, voice: ${voice.voiceId})`);
  const resolved = args['skip-tts']
    ? script
    : await resolveScriptAudio(script, {
        voice,
        onProgress: (p) => {
          const tag = p.cached ? '캐시 사용' : '신규 합성';
          console.log(
            `  [${p.index + 1}/${p.total}] ${p.cutType.padEnd(9)} ${tag} — ${p.duration.toFixed(2)}s`
          );
        },
      });

  console.log('[2/3] Remotion 번들링');
  const serveUrl = await bundle({
    entryPoint: path.resolve(process.cwd(), 'src/index.ts'),
  });

  const compositionId = COMPOSITION_ID[format];
  const { width, height } = FORMAT_DIMENSIONS[format];
  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps: { script: resolved },
  });

  console.log(
    `[3/3] 렌더링 (${compositionId}, ${width}x${height}, ${composition.durationInFrames}프레임)`
  );
  const outputLocation = path.resolve(output);

  // Remotion 기본 concurrency는 감지된 코어 수의 절반만 쓴다(round(min(8, max(1, cpu/2))),
  // @remotion/renderer/dist/get-concurrency.js 확인). 2 vCPU 컨테이너에서는 1이 되어 사실상 싱글스레드로
  // 렌더한다(1684프레임에 ~400초 실측). 컨테이너 CPU 감지는 os.availableParallelism()로 cgroup을 정확히
  // 읽으므로 오감지가 아니라 의도된 기본값이며, 100%로 명시 오버라이드한다. video-lab-taskdef.json의
  // vCPU 상향과 함께 적용해야 효과가 난다(코어가 2개면 100%든 50%든 상한은 2).
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation,
    inputProps: { script: resolved },
    concurrency: '100%',
    onProgress: ({ progress, renderedFrames, encodedFrames }) => {
      process.stdout.write(
        `\r  진행률: ${Math.round(progress * 100)}% (렌더 ${renderedFrames}/${composition.durationInFrames}, 인코딩 ${encodedFrames})   `
      );
    },
  });

  process.stdout.write('\n');
  console.log(`완료: ${outputLocation}`);
}

main().catch((err) => {
  console.error(`\n오류: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
