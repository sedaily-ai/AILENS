import type { PaperName } from "./theme";
import type { TransitionName } from "./transitions";

// 종이 질감 장면 데이터. 전달받은 템플릿은 이 타입들을 고정 각본(script.ts)에 두었지만, 여기서는
// 사이트 각본(NewsScript)을 convert.ts가 이 형태로 바꿔 넘긴다.

/** 기사 사진: S3 등 절대 URL(http…) 또는 public/ 기준 경로 + 사진 출처. */
export type Photo = { url: string; credit?: string };

export type Bar = { label: string; value: number; display: string; highlight?: boolean };
/** icon은 사이트 아이콘 이름(components/Icon.tsx). 없는 이름은 기본 아이콘으로 그린다. */
export type CardNode = { icon: string; title: string; sub?: string; highlight?: boolean };

export type EmStyle = "stamp" | "marker";

export type Visual =
  | { type: "newsFront"; headline: string; icon: string; numberNote?: string; photo?: Photo }
  | { type: "stampNumber"; kicker: string; number: string; note?: string; tag?: string; photo?: Photo }
  | { type: "stampDoc"; docTitle: string; stamp: string }
  | { type: "board"; nodes: CardNode[] }
  | { type: "timeline"; nodes: CardNode[] }
  | { type: "headline"; sub?: string; underline?: boolean }
  | { type: "bars"; bars: Bar[] }
  | { type: "beforeAfter"; before: { label: string; value: string }; after: { label: string; value: string }; direction: "up" | "down" }
  | { type: "photo"; photo: Photo };

export type PaperScene = {
  /** 화면 아래 자막 줄(나레이션). */
  line: string;
  /** 큰 자막. */
  caption: string;
  /** 강조어. 자막 안 글자 그대로. */
  emphasis: string;
  emStyle: EmStyle;
  source?: string;
  paper: PaperName;
  transitionIn: TransitionName;
  /** TTS 음성 길이로 정해진 컷 길이(프레임). */
  frames: number;
  /** 나레이션 음성(절대 URL 또는 public/ 기준 경로). */
  audioFile?: string;
  visual: Visual;
};
