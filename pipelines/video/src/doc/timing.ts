// 다큐 틀 컷 길이 계산 — 화면 틀(DocVideo·DocVertical)과 Lambda 렌더 스크립트(render-lambda.ts)가 같이 쓴다.
// 화면 컴포넌트를 import하지 않게 따로 둔다(영상 서버 컨테이너에는 화면용 패키지가 없을 수 있음, 2026-11-18).
import { cutSeconds, type NewsScript } from "../lib/schema";

export const DOC_FPS = 30;
export const H_TIMING = { lead: 0.22, tail: 0.3 } as const; // 가로: 음성 앞 여백, 뒤 여백(초)
export const V_TIMING = { lead: 0.18, tail: 0.25 } as const; // 세로(쇼츠)는 조금 더 촘촘하게

export const cutFrames = (script: NewsScript, i: number, t: { lead: number; tail: number }) =>
  Math.max(20, Math.round((cutSeconds(script.cuts[i]) + t.lead + t.tail) * DOC_FPS));

const total = (script: NewsScript, t: { lead: number; tail: number }) =>
  Math.max(1, script.cuts.reduce((a, _, i) => a + cutFrames(script, i, t), 0));

export const docDurationInFrames = (script: NewsScript) => total(script, H_TIMING);
export const verticalDurationInFrames = (script: NewsScript) => total(script, V_TIMING);
