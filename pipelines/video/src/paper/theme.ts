import React, { createContext, useContext } from "react";
import { useCurrentFrame } from "remotion";
import * as Sans from "@remotion/google-fonts/NotoSansKR";
import * as Serif from "@remotion/google-fonts/NotoSerifKR";
import * as Pen from "@remotion/google-fonts/NanumPenScript";
import * as Mono from "@remotion/google-fonts/NanumGothicCoding";

// 종이 질감 테마 — 전달받은 종이 질감 템플릿(2026-10-12)의 theme.ts를 옮긴 것.
// 한글 Google Fonts는 굵기마다 약 100개 unicode-range 조각으로 나뉜다. 전부 받으면 렌더 탭마다
// 약 550개 요청이 나가 시간 초과가 났으므로(원본 템플릿 실측) 각본에 실제로 쓰인 글자가 든 조각만 받는다.
// 원본은 모듈 로드 시점에 고정 각본(script.ts)으로 계산했지만, 여기서는 기본 디자인 렌더에 영향이
// 없도록 종이 컴포지션이 마운트될 때 그 각본 텍스트로 한 번만 부른다(ensurePaperFonts).
const BASE_TEXT = "AILENS · 1면 0123456789 abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ →▲▼▍%.,()—-!~·";

const parseRanges = (ranges: string) =>
  ranges.split(",").map((r) => {
    const [a, b] = r.trim().replace(/^U\+/i, "").split("-");
    const lo = parseInt(a.replace(/\?/g, "0"), 16);
    const hi = b ? parseInt(b, 16) : parseInt(a.replace(/\?/g, "f"), 16);
    return [lo, hi] as const;
  });

type FontModule = {
  getInfo: () => { fontFamily: string; unicodeRanges: Record<string, string> };
  loadFont: (...args: never[]) => { fontFamily: string };
};

const FONTS: Array<{ mod: FontModule; weights: string[] }> = [
  { mod: Sans as unknown as FontModule, weights: ["700", "900"] },
  { mod: Serif as unknown as FontModule, weights: ["900"] },
  { mod: Pen as unknown as FontModule, weights: ["400"] },
  { mod: Mono as unknown as FontModule, weights: ["700"] },
];

// 패밀리 이름은 getInfo()로 미리 알 수 있어, 글꼴을 불러오기 전에도 스타일에 쓸 수 있다.
export const FONT = {
  sans: (Sans as unknown as FontModule).getInfo().fontFamily,
  serif: (Serif as unknown as FontModule).getInfo().fontFamily,
  pen: (Pen as unknown as FontModule).getInfo().fontFamily,
  mono: (Mono as unknown as FontModule).getInfo().fontFamily,
};

// 렌더 프로세스(Lambda 조각 포함)마다 같은 텍스트로 한 번만 부른다. loadFont가 내부에서 delayRender로
// 프레임 캡처를 미룬다.
const loadedTexts = new Set<string>();
export const ensurePaperFonts = (text: string) => {
  if (loadedTexts.has(text)) return;
  loadedTexts.add(text);
  const codepoints = [...new Set([...(text + BASE_TEXT)].map((c) => c.codePointAt(0)!))];
  for (const { mod, weights } of FONTS) {
    const subsets = Object.entries(mod.getInfo().unicodeRanges)
      .filter(([, ranges]) => parseRanges(ranges).some(([lo, hi]) => codepoints.some((cp) => cp >= lo && cp <= hi)))
      .map(([name]) => name);
    (mod.loadFont as (style: string, opts: object) => { fontFamily: string })("normal", { weights, subsets, ignoreTooManyRequestsWarning: true });
  }
};

// Paper stocks and riso spot inks (AILENS_PROMPT v2 §7).
export const PAPER = { cream: "#F2EBDD", newsprint: "#E6E2D6", kraft: "#D9C3A0", black: "#1C1B19" };
export const SPOT = { red: "#E8452C", orange: "#FF6C2F", teal: "#0E8A6D", blue: "#3255A4", yellow: "#F7C531" };
// Spot inks lifted for legibility on black paper.
const SPOT_ON_DARK: Record<SpotName, string> = { red: "#FF6A52", orange: "#FF8A55", teal: "#3FD6A8", blue: "#7C9BEA", yellow: "#F7C531" };
export const INK = "#1B1B1B";

export type PaperName = keyof typeof PAPER | "spot";
export type SpotName = keyof typeof SPOT;

export type Palette = {
  paper: string;
  ink: string;
  muted: string;
  spot: string; // emphasis color on this paper
  spotPaper: string; // spot ink as a paper/fill color
  onSpot: string; // text on spot-colored paper
  tape: string;
  dark: boolean;
};

export const makePalette = (paper: PaperName, spot: SpotName): Palette => {
  if (paper === "black") {
    return { paper: PAPER.black, ink: PAPER.cream, muted: "#A39E93", spot: SPOT_ON_DARK[spot], spotPaper: SPOT[spot], onSpot: PAPER.cream, tape: "rgba(242,235,221,0.9)", dark: true };
  }
  if (paper === "spot") {
    return { paper: SPOT[spot], ink: PAPER.cream, muted: "rgba(242,235,221,0.75)", spot: PAPER.cream, spotPaper: PAPER.cream, onSpot: SPOT[spot], tape: "rgba(242,235,221,0.9)", dark: true };
  }
  return { paper: PAPER[paper], ink: INK, muted: "#5E5A52", spot: SPOT[spot], spotPaper: SPOT[spot], onSpot: PAPER.cream, tape: "rgba(250,240,205,0.85)", dark: false };
};

const PaletteContext = createContext<Palette>(makePalette("newsprint", "blue"));
export const PaletteProvider: React.FC<{ palette: Palette; children: React.ReactNode }> = ({ palette, children }) =>
  React.createElement(PaletteContext.Provider, { value: palette }, children);
export const usePalette = () => useContext(PaletteContext);

/** Stop-motion clock: paper elements move "on twos" (12–15 drawings/sec feel). */
export const useTwos = () => Math.floor(useCurrentFrame() / 2) * 2;

export const SPRING = {
  enter: { damping: 14, stiffness: 170 },
  pop: { damping: 9, stiffness: 180 },
  slow: { damping: 18, stiffness: 70 },
};

export const W = 1920;
export const H = 1080;
export const MARGIN = 110;

export const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
