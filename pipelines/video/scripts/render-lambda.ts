// ECS 태스크 role(컨테이너 자격증명 엔드포인트)로 돌 때 명시적 AWS_ACCESS_KEY_ID/
// AWS_PROFILE이 없으면 @remotion/lambda-client의 자체 사전 점검(checkCredentials,
// index.js)이 "환경변수를 안 설정했다"며 먼저 거부한다 — 이후 실제 호출부
// (getCredentials)는 아무 명시값도 못 찾으면 credentials: undefined로 떨어져
// AWS SDK 기본 체인(태스크 role 포함)에 맡기므로, 이 사전 점검만 건너뛰면
// 정상 동작한다(소스 직접 확인). 로컬 개발(AWS_PROFILE 사용)은
// 이 점검을 이미 통과하므로 영향 없음.
process.env.REMOTION_SKIP_AWS_CREDENTIALS_CHECK = 'true';

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderMediaOnLambda, getRenderProgress } from '@remotion/lambda-client';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { parseNewsScript, compositionFor, isPaperTheme, isPrismTheme, Format } from '../src/lib/schema';
import { paperDurationInFrames } from '../src/paper/PaperVideo';
import { prismDurationInFrames } from '../src/prism/PrismVideo';
import { resolveScriptAudio } from '../src/lib/resolveAudio';
import { scriptDurationInFrames } from '../src/compositions/NewsVideo';
import { docDurationInFrames, verticalDurationInFrames, cutFrames, H_TIMING, V_TIMING, DOC_FPS } from '../src/doc/timing';
import { DEFAULT_VOICE } from '../src/lib/tts';
import type { VoiceId } from '@aws-sdk/client-polly';
import { parseArgs } from '../src/lib/cliArgs';

const USAGE =
  '사용법: npm run render:lambda -- --input <script.json> --format <vertical|horizontal> --output <out.mp4> ' +
  '--job-id <id> [--voice <voiceName>] [--plan <plan.json> --composition <DocHorizontal|DocVertical>]';

// 다큐(인포그래픽) 화면 틀(2026-11-18). --plan(장면 계획, doc_plan.py가 만듦)을 주면 대본 테마와 상관없이
// 이 틀로 렌더한다. 주지 않으면 지금까지와 똑같이 테마별 기본 컴포지션을 쓴다.
const DOC_COMPOSITIONS = {
  DocHorizontal: { width: 1920, height: 1080, frames: docDurationInFrames },
  DocVertical: { width: 1080, height: 1920, frames: verticalDurationInFrames },
} as const;
type DocCompositionId = keyof typeof DOC_COMPOSITIONS;

// 단일 Fargate 컨테이너 렌더(render.ts)는 코어 수 한계를 못 벗어나 Remotion Lambda로 렌더한다.
// 아래 상수(REGION, FUNCTION_NAME, SERVE_URL)는 `npx remotion lambda functions deploy` /
// `npx remotion lambda sites create`로 1회 배포한 리소스를 가리킨다. Remotion 버전을 올리면 함수를
// 다시 배포하고 이 상수도 갱신해야 한다(레포 안에 이 값을 저장하는 config 파일이 없어 코드가 유일한 기록이다).
const REGION = 'us-east-1' as const;
// 메모리를 올리면 CPU도 비례해 커진다(Remotion 문서). 동일 입력(9컷/1672프레임, TTS 캐시로 렌더
// 시간만 비교)으로 2048MB(기본값) 80초 → 4096MB 62초(약 23% 단축)를 실측해 4096MB를 쓴다.
const FUNCTION_NAME = 'remotion-render-4-0-513-mem4096mb-disk2048mb-180sec';
const SERVE_URL =
  'https://remotionlambda-useast1-criescup5q.s3.us-east-1.amazonaws.com/sites/ailens-video-lab/index.html';
// 다큐 틀은 별도 사이트에서 렌더한다(2026-11-18) — 이 사이트를 다시 배포해도 기존 PRISM 렌더(SERVE_URL)는 영향이 없다.
//   npx remotion lambda sites create src/index.ts --site-name=ailens-video-lab-doc --region=us-east-1
const SERVE_URL_DOC =
  'https://remotionlambda-useast1-criescup5q.s3.us-east-1.amazonaws.com/sites/ailens-video-lab-doc/index.html';
const MEDIA_BUCKET = process.env.CMS_MEDIA_BUCKET ?? 'sedaily-mbti-cms-media-dev';
const FPS = 30;
const POLL_INTERVAL_MS = 2000;

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
  return parseNewsScript(json);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { input, format, output, voice: voiceName, plan: planPath } = args;
  const docId = (args.composition ?? 'DocHorizontal') as DocCompositionId;
  if (planPath && !(docId in DOC_COMPOSITIONS)) {
    throw new Error(`--composition은 DocHorizontal 또는 DocVertical이어야 합니다 (입력값: "${args.composition}")`);
  }
  const plan = planPath ? JSON.parse(await readFile(path.resolve(planPath), 'utf-8')) : null;
  const jobId = args['job-id'];

  if (!input || !output || !format || !jobId) {
    throw new Error(USAGE);
  }
  if (!isFormat(format)) {
    throw new Error(`--format은 vertical 또는 horizontal이어야 합니다 (입력값: "${format}")\n${USAGE}`);
  }

  const script = await loadScript(input);
  const voice = voiceName ? { ...DEFAULT_VOICE, voiceId: voiceName as VoiceId } : DEFAULT_VOICE;

  console.log(`[1/3] TTS 처리 (${script.cuts.length}개 컷, provider: ${voice.provider}, voice: ${voice.provider === 'google' ? voice.googleVoice : voice.voiceId})`);
  // 로컬 렌더(render.ts)와 달리 오디오를 S3에 올려 URL로 넘긴다 —
  // resolveAudio.ts의 upload 옵션 설명 참고.
  const resolved = await resolveScriptAudio(script, {
    voice,
    upload: { bucket: MEDIA_BUCKET, keyPrefix: `media/video-lab/audio/${jobId}` },
    onProgress: (p) => {
      const tag = p.cached ? '캐시 사용' : '신규 합성';
      console.log(
        `  [${p.index + 1}/${p.total}] ${p.cutType.padEnd(9)} ${tag} — ${p.duration.toFixed(2)}s`
      );
    },
  });

  // 각본 design.theme가 'paper'면 종이 질감 컴포지션(가로형 고정), 아니면 지금처럼 형식별 기본 컴포지션.
  const base = compositionFor(resolved, format);
  const doc = plan ? DOC_COMPOSITIONS[docId] : null;
  const compositionId = doc ? docId : base.id;
  const width = doc ? doc.width : base.width;
  const height = doc ? doc.height : base.height;
  if (plan && plan.length !== resolved.cuts.length) {
    throw new Error(`장면 계획 수(${plan.length})와 컷 수(${resolved.cuts.length})가 다릅니다`);
  }
  const totalFrames = doc
    ? doc.frames(resolved)
    : isPrismTheme(resolved)
    ? prismDurationInFrames(resolved, FPS)
    : isPaperTheme(resolved)
      ? paperDurationInFrames(resolved, FPS)
      : scriptDurationInFrames(resolved, FPS);
  console.log(`[2/3] 렌더링 (${compositionId}, ${width}x${height}, ${totalFrames}프레임, Remotion Lambda)`);

  const { renderId, bucketName } = await renderMediaOnLambda({
    region: REGION,
    functionName: FUNCTION_NAME,
    serveUrl: plan ? SERVE_URL_DOC : SERVE_URL,
    composition: compositionId,
    inputProps: plan ? { script: resolved, plan } : { script: resolved },
    codec: 'h264',
    privacy: 'no-acl',
  });

  let lastPercent = -1;
  for (;;) {
    const progress = await getRenderProgress({
      renderId,
      bucketName,
      functionName: FUNCTION_NAME,
      region: REGION,
    });
    if (progress.fatalErrorEncountered) {
      const message = progress.errors[0]?.message ?? '알 수 없는 오류';
      throw new Error(`Remotion Lambda 렌더 실패: ${message}`);
    }
    const percent = Math.round(progress.overallProgress * 100);
    if (percent !== lastPercent) {
      const encoded = progress.encodingStatus?.framesEncoded ?? 0;
      console.log(`  진행률: ${percent}% (렌더 ${progress.framesRendered}/${totalFrames}, 인코딩 ${encoded})`);
      lastPercent = percent;
    }
    if (progress.done) {
      if (!progress.outKey || !progress.outBucket) {
        throw new Error('Remotion Lambda 렌더가 완료됐다는데 출력 위치(outKey/outBucket)가 없습니다.');
      }
      console.log('[3/3] 결과물 다운로드');
      const s3 = new S3Client({ region: REGION });
      const obj = await s3.send(
        new GetObjectCommand({ Bucket: progress.outBucket, Key: progress.outKey })
      );
      const body = await obj.Body?.transformToByteArray();
      if (!body) {
        throw new Error('Remotion Lambda 렌더 결과를 다운로드하지 못했습니다.');
      }
      await writeFile(path.resolve(output), Buffer.from(body));
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // 다큐 틀이면 컷별 시작 시각(초)을 옆에 남긴다 — 유튜브 설명글 챕터(0:00 …)를 만들 때 쓴다(2026-11-18).
  if (doc) {
    const t = docId === 'DocVertical' ? V_TIMING : H_TIMING;
    let f = 0;
    const starts = resolved.cuts.map((_, i) => {
      const s = f / DOC_FPS;
      f += cutFrames(resolved, i, t);
      return Math.round(s * 100) / 100;
    });
    await writeFile(path.resolve(output) + '.timing.json', JSON.stringify({ starts, total: f / DOC_FPS }));
  }

  console.log(`완료: ${path.resolve(output)}`);
}

main().catch((err) => {
  console.error(`\n오류: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
