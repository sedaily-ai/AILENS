import { z } from 'zod';

// caption은 단순 문자열이거나, emphasis(강조) 구간을 명시한 세그먼트 배열일 수 있다.
// highlight처럼 문장 일부만 강조해야 하는 컷은 부분 문자열 매칭(암묵적·조용히 실패) 대신
// 이 구조로 명시한다.
export const captionSegmentSchema = z.object({
  text: z.string().min(1),
  emphasis: z.boolean().optional(),
});

export const captionSchema = z.union([z.string().min(1), z.array(captionSegmentSchema).min(1)]);

const baseCutFields = {
  duration: z.number().positive(),
  narration: z.string().min(1),
  caption: captionSchema,
  // TTS 해석(scripts/resolve-audio.ts) 이후에만 채워진다. 작성자가 직접 넣는 값이 아니다.
  // public/ 기준 상대 경로 (예: "audio/ab12cd34.mp3") — staticFile()로 참조.
  audioFile: z.string().optional(),
};

export const openingCutSchema = z.object({
  type: z.literal('opening'),
  ...baseCutFields,
  data: z.object({
    icon: z.string(),
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
  }),
});

// label 없는 화살표 노드를 문자열 휴리스틱("")으로 구분하던 방식은
// 라벨 없는 실제 노드가 들어오면 조용히 오작동하므로 kind로 명시한다.
const diagramNodeSchema = z.object({
  kind: z.literal('node'),
  icon: z.string(),
  label: z.string(),
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

// emphasis 문자열은 caption 세그먼트 구조로 대체되어 더 이상 필요 없다.
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

export const cutSchema = z.discriminatedUnion('type', [
  openingCutSchema,
  statCutSchema,
  diagramCutSchema,
  chartCutSchema,
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
  // 이 영상이 다루는 사실의 기준 시점(2026-09, 기자 피드백 — "영상에도
  // 기준 날짜가 필요하다"). 예산안 발표일, 통계 기준월처럼 원문에 명시된
  // 시점 — 없으면 OpeningCut에 아무것도 안 뜬다(지어내지 않음).
  asOfDate: z.string().optional(),
});

export type CaptionSegment = z.infer<typeof captionSegmentSchema>;
export type CaptionValue = z.infer<typeof captionSchema>;
export type OpeningCutType = z.infer<typeof openingCutSchema>;
export type StatCutType = z.infer<typeof statCutSchema>;
export type DiagramCutType = z.infer<typeof diagramCutSchema>;
export type DiagramItem = z.infer<typeof diagramItemSchema>;
export type ChartCutType = z.infer<typeof chartCutSchema>;
export type HighlightCutType = z.infer<typeof highlightCutSchema>;
export type ClosingCutType = z.infer<typeof closingCutSchema>;
export type Cut = z.infer<typeof cutSchema>;
export type NewsScript = z.infer<typeof newsScriptSchema>;

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
