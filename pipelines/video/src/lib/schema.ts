import { z } from 'zod';

// caption은 단순 문자열이거나, emphasis(강조) 구간을 명시한 세그먼트 배열일 수 있다.
// highlight처럼 문장 일부만 강조해야 하는 컷은 부분 문자열 매칭(암묵적·조용히 실패) 대신
// 이 구조로 명시한다.
export const captionSegmentSchema = z.object({
  text: z.string().min(1),
  emphasis: z.boolean().optional(),
});

export const captionSchema = z.union([z.string().min(1), z.array(captionSegmentSchema).min(1)]);

// 컷별 디자인 지정(선택). CMS "영상 다시 만들기"의 수작업 프롬프트가 쓰는 항목이다. 메인 자동 발행
// 프롬프트는 쓰지 않으므로, 없으면 지금 디자인 그대로 그린다. 값이 목록 밖이면 렌더를 멈추지 않고 그 항목만
// 버린다(.catch) — 장식 항목이라 사실 정보가 아니다.
export const PAPER_NAMES = ['cream', 'newsprint', 'kraft', 'black', 'spot'] as const;
export const SPOT_NAMES = ['red', 'orange', 'teal', 'blue', 'yellow'] as const;
export const TRANSITION_NAMES = ['cover', 'tear', 'flip', 'stampCut', 'zoom'] as const;
export const PRISM_SCENES = ['hero', 'title', 'date', 'split', 'quote'] as const;
export const PAPER_LAYOUTS = [
  'newsFront',
  'stampNumber',
  'stampDoc',
  'board',
  'timeline',
  'headline',
  'bars',
  'beforeAfter',
  'photo',
] as const;

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).optional().catch(undefined);
const optionalText = () => z.string().optional().catch(undefined);

export const cutStyleSchema = z.object({
  // 종이 질감 테마에서 이 컷을 어떤 화면으로 그릴지. 컷 종류와 맞지 않으면 기본 화면으로 돌아간다.
  layout: optionalEnum(PAPER_LAYOUTS),
  paper: optionalEnum(PAPER_NAMES),
  transition: optionalEnum(TRANSITION_NAMES),
  emStyle: optionalEnum(['stamp', 'marker'] as const),
  // 화면에 덧붙이는 작은 글: kicker = 큰 숫자 위 한 줄·문서 제목, sub = 헤드라인 아래 글,
  // note = 테이프 위 손글씨, tag = 손글씨 감탄 메모, stamp = 문서에 찍는 도장 글자.
  kicker: optionalText(),
  sub: optionalText(),
  note: optionalText(),
  tag: optionalText(),
  stamp: optionalText(),
  // 나레이션이 끝난 뒤 화면을 더 보여 주는 시간(초).
  holdSeconds: z.number().min(0).max(5).optional().catch(undefined),
  // ↓ PRISM 테마(src/prism) 전용. 다른 테마는 읽지 않는다.
  // scene = 화면 모양(hero 큰 글자 / title 섹션 제목 / date 날짜 카드 / split 좌우 분할 / quote 인용),
  // icon = 큰 그림 이름(src/prism/icons.tsx), section = 오른쪽 위 "01 / 05" 번호.
  scene: optionalEnum(PRISM_SCENES),
  icon: optionalText(),
  section: z.number().int().min(1).max(9).optional().catch(undefined),
});

const baseCutFields = {
  duration: z.number().positive(),
  narration: z.string().min(1),
  caption: captionSchema,
  // TTS 해석(lib/resolveAudio.ts) 이후에만 채워진다. 작성자가 직접 넣는 값이 아니다.
  // 로컬 렌더(render.ts): public/ 기준 상대 경로(예: "audio/ab12cd34.mp3") — staticFile()로 참조.
  // Remotion Lambda 렌더(render-lambda.ts): S3 절대 URL(https://...) — NewsVideo.tsx가
  // "http"로 시작하면 그대로 <Audio src>에 쓰고, 아니면 staticFile()을 거친다.
  audioFile: z.string().optional(),
  style: cutStyleSchema.optional().catch(undefined),
};

// 첫 컷 사진(선택). 프롬프트는 url을 비워 출력하고, 공장(generate_script.py::fix_script)이 원문 사진
// 주소로 채운다. 원문 사진이 없거나 열리지 않으면 fix_script가 이 항목을 지워 아이콘으로 그린다.
// 종이 질감 테마(신문 1면·도장 숫자)에서만 화면에 나온다.
const leadPhotoSchema = z
  .object({ url: z.string().min(1), credit: z.string().optional() })
  .optional()
  .catch(undefined);

export const openingCutSchema = z.object({
  type: z.literal('opening'),
  ...baseCutFields,
  data: z.object({
    icon: z.string(),
    photo: leadPhotoSchema,
  }),
});

export const statCutSchema = z.object({
  type: z.literal('stat'),
  ...baseCutFields,
  data: z.object({
    value: z.number(),
    unit: z.string(),
    label: z.string(),
    // 컷 단위로 캡처/유포될 수 있어 숫자 옆에 출처를 항상 붙인다.
    sourceNote: z.string().optional(),
    photo: leadPhotoSchema,
  }),
});

// label 없는 화살표 노드를 문자열 휴리스틱("")으로 구분하던 방식은
// 라벨 없는 실제 노드가 들어오면 조용히 오작동하므로 kind로 명시한다.
const diagramNodeSchema = z.object({
  kind: z.literal('node'),
  icon: z.string(),
  label: z.string(),
  // 카드 아래 작은 설명(선택). 기본 테마는 쓰지 않는다.
  sub: z.string().optional().catch(undefined),
});

const diagramConnectorSchema = z.object({
  kind: z.literal('connector'),
  // 지금은 화살표만. 추후 'arrow-loss' 등 의미가 다른 커넥터를 추가할 여지.
  variant: z.enum(['arrow']),
});

const diagramItemSchema = z.discriminatedUnion('kind', [
  diagramNodeSchema,
  diagramConnectorSchema,
]);

export const diagramCutSchema = z.object({
  type: z.literal('diagram'),
  ...baseCutFields,
  data: z.object({
    nodes: z.array(diagramItemSchema).min(1),
  }),
});

// url은 LLM이 직접 쓰지 않는다 — pipelines/video/generate_script.py의 fix_script()가
// 파이프라인이 이미 아는 실제 원문 사진 URL로 항상 덮어쓴다.
export const photoCutSchema = z.object({
  type: z.literal('photo'),
  ...baseCutFields,
  data: z.object({
    url: z.string().min(1),
    credit: z.string().optional(),
  }),
});

export const chartCutSchema = z.object({
  type: z.literal('chart'),
  ...baseCutFields,
  data: z.object({
    chartType: z.enum(['line', 'bar']),
    points: z
      .array(
        z.object({
          label: z.string(),
          value: z.number(),
        })
      )
      .min(2),
    unit: z.string().optional(),
    sourceNote: z.string().optional(),
  }),
});

// highlight 컷의 강조는 caption 세그먼트(emphasis)로 표현하므로 별도 data 필드가 없다.
export const highlightCutSchema = z.object({
  type: z.literal('highlight'),
  ...baseCutFields,
  data: z.object({}).partial(),
});

export const closingCutSchema = z.object({
  type: z.literal('closing'),
  ...baseCutFields,
  data: z.object({}).partial(),
});

// 전후 비교(프롬프트 §6) — 기준값(before)이 먼저 나타나고, 결과(after)를 말할 때 기준값이 흐려지며 줄이 그어지고 작아진다.
// 방향 표시(▲ 빨강 / ▼ 파랑)는 두 값의 크기로 렌더러가 정한다 — 모델이 방향을 따로 적지 않는다(값과 어긋날 수 없게).
const compareValueSchema = z.object({ label: z.string(), value: z.number(), unit: z.string().optional() });
export const compareCutSchema = z.object({
  type: z.literal('compare'),
  ...baseCutFields,
  data: z.object({
    before: compareValueSchema,
    after: compareValueSchema,
    sourceNote: z.string().optional(),
  }),
});

// 도넛 — "전체 중 몇 %"(점유율·비중·응답률). value는 0~100.
export const donutCutSchema = z.object({
  type: z.literal('donut'),
  ...baseCutFields,
  data: z.object({
    value: z.number().min(0).max(100),
    label: z.string(),
    sourceNote: z.string().optional(),
  }),
});

// 순위 — 가로 막대가 위에서부터 차례로 뻗는다. 2~5개, 값이 큰 순서로 적는다.
export const rankCutSchema = z.object({
  type: z.literal('rank'),
  ...baseCutFields,
  data: z.object({
    items: z.array(z.object({ label: z.string(), value: z.number() })).min(2).max(5),
    unit: z.string().optional(),
    sourceNote: z.string().optional(),
  }),
});

export const cutSchema = z.discriminatedUnion('type', [
  compareCutSchema,
  donutCutSchema,
  rankCutSchema,
  openingCutSchema,
  statCutSchema,
  diagramCutSchema,
  chartCutSchema,
  photoCutSchema,
  highlightCutSchema,
  closingCutSchema,
]);

export const newsScriptSchema = z.object({
  title: z.string().min(1),
  brand: z.string().min(1),
  cuts: z.array(cutSchema).min(1),
  source: z.string().min(1),
  // 피해·의료·투자 등 민감 소재에서 클로징에 붙는 안내 문구. 없으면 노출 안 함.
  disclaimer: z.string().optional(),
  // 이 영상이 다루는 사실의 기준 시점. 예산안 발표일, 통계 기준월처럼 원문에 명시된 시점이며,
  // 없으면 표시하지 않는다(지어내지 않음).
  asOfDate: z.string().optional(),
  // 키워드 라벨(프롬프트 §7) — 왼쪽 위에 상시 노출되는 기사 핵심 명사 2~8자. 없으면 brand를 대신 보인다.
  keyword: z.string().optional(),
  // 영상 전체 디자인(선택). theme가 'paper'면 종이 질감, 'prism'이면 AI PRISM 컴포지션으로 렌더한다(scripts/render*.ts).
  design: z
    .object({
      theme: optionalEnum(['default', 'paper', 'prism'] as const),
      paper: optionalEnum(PAPER_NAMES),
      spot: optionalEnum(SPOT_NAMES),
      endCard: z.boolean().optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});

export type CaptionSegment = z.infer<typeof captionSegmentSchema>;
export type CaptionValue = z.infer<typeof captionSchema>;
export type OpeningCutType = z.infer<typeof openingCutSchema>;
export type StatCutType = z.infer<typeof statCutSchema>;
export type DiagramCutType = z.infer<typeof diagramCutSchema>;
export type DiagramItem = z.infer<typeof diagramItemSchema>;
export type ChartCutType = z.infer<typeof chartCutSchema>;
export type PhotoCutType = z.infer<typeof photoCutSchema>;
export type HighlightCutType = z.infer<typeof highlightCutSchema>;
export type ClosingCutType = z.infer<typeof closingCutSchema>;
export type CompareCutType = z.infer<typeof compareCutSchema>;
export type DonutCutType = z.infer<typeof donutCutSchema>;
export type RankCutType = z.infer<typeof rankCutSchema>;
export type Cut = z.infer<typeof cutSchema>;
export type NewsScript = z.infer<typeof newsScriptSchema>;
export type CutStyle = z.infer<typeof cutStyleSchema>;

export type Format = 'vertical' | 'horizontal';

export const FORMAT_DIMENSIONS: Record<Format, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
};

// Root.tsx에 등록된 Composition id와 scripts/render.ts가 공유하는 매핑.
export const COMPOSITION_ID: Record<Format, string> = {
  vertical: 'NewsVideo-Vertical',
  horizontal: 'NewsVideo-Horizontal',
};

// 종이 질감 테마는 가로형(1920×1080)만 있다. 세로형 설정이어도 이 컴포지션으로 렌더한다.
export const PAPER_COMPOSITION_ID = 'NewsVideo-Paper';

// AI PRISM(서울경제 영문 데일리 팟캐스트) 영상 — 가로형(1920×1080)만 있다(src/prism).
export const PRISM_COMPOSITION_ID = 'AiPrismHorizontal';

export const isPaperTheme = (script: NewsScript): boolean => script.design?.theme === 'paper';
export const isPrismTheme = (script: NewsScript): boolean => script.design?.theme === 'prism';

// 렌더 스크립트(render.ts, render-lambda.ts)가 쓰는 컴포지션 선택.
export const compositionFor = (script: NewsScript, format: Format): { id: string; width: number; height: number } =>
  isPrismTheme(script)
    ? { id: PRISM_COMPOSITION_ID, ...FORMAT_DIMENSIONS.horizontal }
    : isPaperTheme(script)
      ? { id: PAPER_COMPOSITION_ID, ...FORMAT_DIMENSIONS.horizontal }
      : { id: COMPOSITION_ID[format], ...FORMAT_DIMENSIONS[format] };

// 컷이 화면에 머무는 시간(초) = 음성 길이 + 쉬는 시간.
export const cutSeconds = (cut: Cut): number => cut.duration + (cut.style?.holdSeconds ?? 0);

export function parseNewsScript(json: unknown): NewsScript {
  const result = newsScriptSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`뉴스 스크립트 JSON이 스키마와 맞지 않습니다:\n${issues}`);
  }
  return result.data;
}
