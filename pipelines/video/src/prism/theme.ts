import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadNotoSans } from "@remotion/google-fonts/NotoSans";
import { loadFont as loadCaveat } from "@remotion/google-fonts/Caveat";

// AI PRISM 테마 — 서울경제 영문 데일리 팟캐스트(AI PRISM) 영상. 화면 글자는 전부 영어라 라틴 글꼴만 받는다.
// 기준 룩: 마케팅팀이 손으로 만들던 PRISM 영상(2026-10-19 Early Careers 편). 큰 제목·숫자는 Anton,
// 본문·자막은 Noto Sans, 손글씨 메모만 Caveat. 배경은 단색 종이 + 은은한 비네팅(그레인 없음).

const anton = loadAnton("normal", { weights: ["400"], subsets: ["latin"] });
const noto = loadNotoSans("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin"] });
const caveat = loadCaveat("normal", { weights: ["600"], subsets: ["latin"] });

export const FONT = {
  display: `${anton.fontFamily}, Impact, sans-serif`,
  body: `${noto.fontFamily}, Arial, sans-serif`,
  hand: `${caveat.fontFamily}, cursive`,
};

export const W = 1920;
export const H = 1080;
export const MARGIN = 110;

export const INK = "#1B1B1B";
export const MUTED = "#5E5A52";

// 종이(배경) — 대본 style.paper 값과 같은 이름. black은 PRISM 기본 네이비, spot은 거의 검정.
export const PAPERS = {
  black: { bg: "#1C2A4A", dark: true },
  spot: { bg: "#1C1B19", dark: true },
  cream: { bg: "#F2EBDD", dark: false },
  newsprint: { bg: "#E6E2D6", dark: false },
  kraft: { bg: "#D9C3A0", dark: false },
  // ↓ 2026-10-29 추가 — 컷마다 고를 수 있는 색 종이. dark면 글자가 흰색·노랑으로 바뀐다.
  white: { bg: "#FAF8F3", dark: false },
  yellow: { bg: "#F7C531", dark: false },
  pink: { bg: "#F4C9C1", dark: false },
  mint: { bg: "#CFE6DA", dark: false },
  sky: { bg: "#CFDDF0", dark: false },
  lilac: { bg: "#DDD4EC", dark: false },
  sand: { bg: "#EAD9B8", dark: false },
  red: { bg: "#C9372A", dark: true },
  orange: { bg: "#E8601F", dark: true },
  teal: { bg: "#0E6E58", dark: true },
  blue: { bg: "#2A4A94", dark: true },
  forest: { bg: "#1F3D33", dark: true },
  burgundy: { bg: "#5A1E25", dark: true },
  plum: { bg: "#3D2747", dark: true },
  charcoal: { bg: "#2B2B2B", dark: true },
} as const;
export type PaperName = keyof typeof PAPERS;

export const SPOTS = {
  red: "#E8452C",
  orange: "#FF6C2F",
  teal: "#0E8A6D",
  blue: "#3255A4",
  yellow: "#F7C531",
  // ↓ 2026-10-29 추가
  pink: "#E8578C",
  purple: "#6B4FBB",
  green: "#3E9B4F",
  navy: "#1C2A4A",
  sky: "#3FA7D6",
  white: "#FFFFFF",
  black: "#1B1B1B",
} as const;
export type SpotName = keyof typeof SPOTS;

// 섹션 번호(01~05)마다 강조색을 바꾼다 — 샘플 영상: 01 파랑, 02 빨강, 03 틸, 04 주황, 05 파랑.
const SECTION_SPOTS: SpotName[] = ["blue", "red", "teal", "orange"];
export const spotFor = (paper: PaperName, section?: number, fallbackIndex = 0, override?: SpotName): string => {
  if (override) return SPOTS[override];
  if (PAPERS[paper].dark) return SPOTS.yellow;
  const i = section ? section - 1 : fallbackIndex;
  return SPOTS[SECTION_SPOTS[((i % SECTION_SPOTS.length) + SECTION_SPOTS.length) % SECTION_SPOTS.length]];
};

/** Anton은 폭이 좁은 글꼴이라 글자 수로 크기를 정한다. 대문자·숫자는 약 0.43em, w·m 같은 넓은 소문자가 섞이면
 *  더 넓어지므로(2026-10-20 "worth watching" 잘림) 넓은 글자 비율만큼 여유를 더 둔다. */
export const fitDisplay = (text: string, maxWidth: number, maxSize: number, minSize = 60): number => {
  const chars = Math.max(1, text.length);
  const wide = (text.match(/[mwMW]/g) ?? []).length / chars;
  const perChar = 0.45 + wide * 0.35;
  return Math.round(Math.max(minSize, Math.min(maxSize, maxWidth / (chars * perChar))));
};

/** 여러 줄로 감쌀 큰 제목 — 가장 긴 줄 기준으로 크기를 정한다. */
export const fitDisplayLines = (lines: string[], maxWidth: number, maxSize: number, minSize = 60): number =>
  Math.min(...lines.map((l) => fitDisplay(l, maxWidth, maxSize, minSize)));
