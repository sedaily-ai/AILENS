import type { CaptionValue, Cut, NewsScript } from "../lib/schema";
import { cutSeconds } from "../lib/schema";
import type { PaperName, SpotName } from "./theme";
import type { TransitionName } from "./transitions";
import type { Bar, CardNode, EmStyle, PaperScene, Photo, Visual } from "./types";

// 사이트 각본(NewsScript) → 종이 질감 장면 목록.
// 각본에 디자인 지정(cut.style, script.design)이 있으면 그대로 따르고, 없으면 아래 기본 규칙으로 정한다.

// 기본 디자인(KineticText)은 자막 조각을 항상 띄어서 그린다 — 같은 규칙으로 잇는다("AI 활용률" + "70%" → "AI 활용률 70%").
const captionText = (c: CaptionValue): string =>
  typeof c === "string" ? c : c.map((s) => s.text.trim()).filter(Boolean).join(" ");

// 강조어 = 자막에서 emphasis로 표시된 구간. 없으면 자막의 마지막 낱말.
const emphasisOf = (c: CaptionValue, text: string): string => {
  const marked = typeof c === "string" ? undefined : c.find((s) => s.emphasis)?.text.trim();
  if (marked && text.includes(marked)) return marked;
  const words = text.trim().split(/\s+/);
  return words[words.length - 1] || text;
};

const formatNumber = (v: number) => v.toLocaleString("ko-KR", { maximumFractionDigits: 4 });
const withUnit = (v: number, unit?: string) => `${formatNumber(v)}${unit ?? ""}`;

const DEFAULT_LAYOUT: Record<Cut["type"], Visual["type"]> = {
  opening: "newsFront",
  stat: "stampNumber",
  donut: "stampNumber",
  compare: "beforeAfter",
  chart: "bars",
  rank: "bars",
  diagram: "board",
  photo: "photo",
  highlight: "headline",
  closing: "headline",
};

const DEFAULT_EM: Record<Cut["type"], EmStyle> = {
  opening: "stamp",
  stat: "stamp",
  donut: "stamp",
  compare: "stamp",
  photo: "stamp",
  highlight: "stamp",
  chart: "marker",
  rank: "marker",
  diagram: "marker",
  closing: "marker",
};

const CONTENT_PAPERS: PaperName[] = ["cream", "newsprint", "kraft"];
const TRANSITION_CYCLE: TransitionName[] = ["cover", "tear", "flip", "zoom"];

const diagramNodes = (cut: Extract<Cut, { type: "diagram" }>): CardNode[] => {
  const nodes = cut.data.nodes.filter((n) => n.kind === "node");
  return nodes.map((n, i) => ({ icon: n.icon, title: n.label, sub: n.sub, highlight: i === nodes.length - 1 }));
};

const chartBars = (cut: Cut): Bar[] | undefined => {
  if (cut.type === "chart") {
    const pts = cut.data.points;
    return pts.map((p, i) => ({ label: p.label, value: p.value, display: withUnit(p.value, cut.data.unit), highlight: i === pts.length - 1 }));
  }
  if (cut.type === "rank") {
    const items = cut.data.items;
    return items.map((it, i) => ({ label: it.label, value: it.value, display: withUnit(it.value, cut.data.unit), highlight: i === 0 }));
  }
  return undefined;
};

// 첫 컷(opening·stat)의 원문 사진. url은 공장 fix_script가 실제 주소로 채운 경우에만 있다.
const leadPhoto = (cut: Cut): Photo | undefined =>
  (cut.type === "opening" || cut.type === "stat") && cut.data.photo ? { url: cut.data.photo.url, credit: cut.data.photo.credit } : undefined;

// 지정한 화면(layout)이 이 컷의 데이터로 그릴 수 없으면 undefined → 기본 화면으로 돌아간다.
const buildVisual = (layout: Visual["type"], cut: Cut, script: NewsScript, caption: string, emphasis: string): Visual | undefined => {
  const st = cut.style ?? {};
  switch (layout) {
    case "newsFront":
      return { type: "newsFront", headline: st.kicker ?? script.title, icon: cut.type === "opening" ? cut.data.icon : "info", numberNote: st.note, photo: leadPhoto(cut) };
    case "stampNumber": {
      if (cut.type === "stat") return { type: "stampNumber", kicker: st.kicker ?? cut.data.label, number: withUnit(cut.data.value, cut.data.unit), note: st.note, tag: st.tag, photo: leadPhoto(cut) };
      if (cut.type === "donut") return { type: "stampNumber", kicker: st.kicker ?? cut.data.label, number: `${formatNumber(cut.data.value)}%`, note: st.note, tag: st.tag };
      // 숫자 컷이 아니면 강조어를 도장으로 찍는다.
      return { type: "stampNumber", kicker: st.kicker ?? caption.replace(emphasis, "").trim(), number: emphasis, note: st.note, tag: st.tag };
    }
    case "stampDoc":
      return { type: "stampDoc", docTitle: st.kicker ?? caption, stamp: st.stamp ?? emphasis };
    case "board":
      return cut.type === "diagram" ? { type: "board", nodes: diagramNodes(cut) } : undefined;
    case "timeline":
      return cut.type === "diagram" ? { type: "timeline", nodes: diagramNodes(cut) } : undefined;
    case "headline":
      return { type: "headline", sub: st.sub ?? (cut.type === "closing" ? script.disclaimer : undefined), underline: cut.type === "closing" };
    case "bars": {
      const bars = chartBars(cut);
      return bars ? { type: "bars", bars } : undefined;
    }
    case "beforeAfter":
      return cut.type === "compare"
        ? {
            type: "beforeAfter",
            before: { label: cut.data.before.label, value: withUnit(cut.data.before.value, cut.data.before.unit) },
            after: { label: cut.data.after.label, value: withUnit(cut.data.after.value, cut.data.after.unit) },
            direction: cut.data.after.value >= cut.data.before.value ? "up" : "down",
          }
        : undefined;
    case "photo":
      return cut.type === "photo" ? { type: "photo", photo: { url: cut.data.url, credit: cut.data.credit } } : undefined;
  }
};

const sourceOf = (cut: Cut): string | undefined => {
  if ("data" in cut && cut.data && "sourceNote" in cut.data && typeof cut.data.sourceNote === "string") return cut.data.sourceNote;
  return undefined;
};

export const toPaperScenes = (script: NewsScript, fps: number): PaperScene[] => {
  let contentIdx = 0;
  let prevPaper: PaperName | undefined;
  return script.cuts.map((cut, i) => {
    const st = cut.style ?? {};
    const caption = captionText(cut.caption);
    const emphasis = emphasisOf(cut.caption, caption);

    const wanted = st.layout ?? DEFAULT_LAYOUT[cut.type];
    const visual = buildVisual(wanted, cut, script, caption, emphasis) ?? buildVisual(DEFAULT_LAYOUT[cut.type], cut, script, caption, emphasis)!;

    // 종이 색 기본 규칙: 강조 장면(highlight·closing)은 검은 종이(직전이 검으면 스팟 색 종이), 나머지는 3종을 돌아가며.
    let paper: PaperName;
    if (st.paper) paper = st.paper;
    else if (cut.type === "opening") paper = script.design?.paper ?? "kraft";
    else if (cut.type === "highlight" || cut.type === "closing") paper = prevPaper === "black" ? "spot" : "black";
    else paper = CONTENT_PAPERS[contentIdx++ % CONTENT_PAPERS.length];
    prevPaper = paper;

    const transitionIn: TransitionName =
      st.transition ?? (cut.type === "highlight" ? "stampCut" : TRANSITION_CYCLE[i % TRANSITION_CYCLE.length]);

    return {
      line: cut.narration,
      caption,
      emphasis,
      emStyle: st.emStyle ?? DEFAULT_EM[cut.type],
      source: sourceOf(cut),
      paper,
      transitionIn,
      frames: Math.ceil(cutSeconds(cut) * fps),
      audioFile: cut.audioFile,
      visual,
    };
  });
};

export const paperSpot = (script: NewsScript): SpotName => script.design?.spot ?? "teal";

/** 글꼴 조각 선택용: 화면에 그려질 수 있는 모든 글자. */
export const paperText = (script: NewsScript): string => JSON.stringify(script);
