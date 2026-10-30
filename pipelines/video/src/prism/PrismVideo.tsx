import React from "react";
import { Audio, staticFile } from "remotion";
import { linearTiming, TransitionSeries, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { flip } from "@remotion/transitions/flip";
import { slide } from "@remotion/transitions/slide";
import { iris } from "@remotion/transitions/iris";
import { cutSeconds, type Cut, type NewsScript } from "../lib/schema";
import { emphasisOf, segsOf, Shell } from "./parts";
import { BarsScene, BeforeAfterScene, CardsScene, DateScene, DonutScene, EndCardScene, FlowScene, HeroScene, SplitScene, TickerScene, TitleScene, TwoStatsScene } from "./scenes";
import { H, PAPERS, W, spotFor, type PaperName } from "./theme";
import { LineScene, NewspaperScene, TimelineScene } from "./extra";
import { PrismFx } from "./fx";
import { paperTransition } from "./transitions";

// AI PRISM 컴포지션 — 사이트 각본(NewsScript, design.theme "prism")을 PRISM 장면으로 그린다.
// 컷 하나 = 장면 하나. 길이는 TTS 음성 길이(+holdSeconds)를 따르고, 마지막 closing 컷이 엔드카드가 된다.
// 화면 글자는 전부 대본(JSON)에서 온다 — 이 파일은 고정 영어 문구를 새로 만들지 않는다("AI PRISM" 로고 글자 제외).

const TRANSITION_FRAMES = 14;
const LIGHT_PAPERS: PaperName[] = ["cream", "newsprint", "kraft"];

const num = (v: number) => (Number.isInteger(v) ? v.toLocaleString("en-US") : String(v));
const withUnit = (v: number, unit?: string) => {
  if (!unit) return num(v);
  return unit.length <= 3 || /^[%+]/.test(unit) ? `${num(v)}${unit}` : `${num(v)} ${unit}`;
};
const hasDigit = (s: string) => /\d/.test(s);

const paperOf = (cut: Cut, i: number): PaperName => {
  const p = cut.style?.paper;
  if (p && p in PAPERS) return p as PaperName;
  if (cut.type === "closing") return "black";
  if (cut.type === "highlight" && cut.style?.scene === "title") return "black";
  return LIGHT_PAPERS[i % LIGHT_PAPERS.length];
};

// 전환 종류마다 props 타입이 달라 TransitionSeries가 한 타입으로 받도록 넓혀 둔다.
type AnyPresentation = TransitionPresentation<Record<string, unknown>>;
const widen = <T extends Record<string, unknown>>(p: TransitionPresentation<T>) => p as unknown as AnyPresentation;

type TransitionName = NonNullable<NonNullable<Cut["style"]>["transition"]>;
// 대본이 전환을 안 정하면 이 순서로 돌려 쓴다(같은 전환 2연속 금지). 섹션이 바뀌는 자리는 페이지 넘기기.
const DEFAULT_CYCLE: TransitionName[] = ["slide", "cover", "tear", "zoom", "slideUp", "stampCut"];

const pickTransitions = (cuts: Cut[]): TransitionName[] => {
  const out: TransitionName[] = [];
  cuts.forEach((cut, i) => {
    const prev = out[i - 1];
    let t: TransitionName | undefined = cut.style?.transition;
    if (!t && i > 0 && cut.style?.section !== cuts[i - 1].style?.section) t = "pageTurn";
    if (!t) {
      t = DEFAULT_CYCLE[i % DEFAULT_CYCLE.length];
      if (t === prev) t = DEFAULT_CYCLE[(i + 1) % DEFAULT_CYCLE.length];
    }
    out.push(t);
  });
  return out;
};

const transitionOf = (t: TransitionName, i: number): { presentation: AnyPresentation; timing: ReturnType<typeof linearTiming> } => {
  const timing = linearTiming({ durationInFrames: TRANSITION_FRAMES });
  const seed = `tr-${i}`;
  switch (t) {
    case "flip":
      return { presentation: widen(flip({ direction: "from-right" })), timing };
    case "iris":
      return { presentation: widen(iris({ width: W, height: H })), timing };
    case "fade":
      return { presentation: widen(fade()), timing };
    case "slideUp":
      return { presentation: widen(slide({ direction: "from-bottom" })), timing };
    case "cover":
    case "tear":
    case "tapePeel":
    case "pageTurn":
    case "zoom":
    case "stampCut":
      return { presentation: widen(paperTransition(t, seed)), timing };
    default:
      return { presentation: widen(slide({ direction: "from-right" })), timing };
  }
};

/** 강조색이 종이색에 묻히는 조합(어두운 종이에 남색·검정, 밝은 종이에 흰색, 같은 이름의 종이·강조색)은 기본 색으로 돌린다. */
const clashes = (paper: PaperName, spot?: string): boolean =>
  !!spot && (paper === spot || (PAPERS[paper].dark ? spot === "navy" || spot === "black" : spot === "white"));

// 컷 길이 = 음성 길이 + 전환 길이. 전환은 앞뒤 컷을 TRANSITION_FRAMES만큼 겹쳐 그리므로, 음성 길이만큼만 잡으면
// 앞 컷 음성의 끝과 다음 컷 음성의 시작이 겹쳐 들렸다(2026-10-30 사용자 지적). 전환은 앞 컷 음성이 끝난 뒤 빈 구간에서 일어난다.
const framesOf = (cut: Cut, fps: number) => Math.max(TRANSITION_FRAMES + 6, Math.round(cutSeconds(cut) * fps)) + TRANSITION_FRAMES;

export const prismDurationInFrames = (script: NewsScript, fps: number): number => {
  const total = script.cuts.reduce((acc, c) => acc + framesOf(c, fps), 0);
  return Math.max(1, total - Math.max(0, script.cuts.length - 1) * TRANSITION_FRAMES);
};

const audioSrc = (file: string) => (file.startsWith("http") ? file : staticFile(file));

const sentences = (text: string) => text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];

const sourceOf = (cut: Cut): string | undefined => {
  switch (cut.type) {
    case "stat":
    case "chart":
    case "donut":
    case "compare":
    case "rank":
      return cut.data.sourceNote || undefined;
    default:
      return undefined;
  }
};

const SceneBody: React.FC<{ cut: Cut; i: number; paper: PaperName; spot: string; dark: boolean; group?: string }> = ({ cut, i, paper, spot, dark, group }) => {
  const tone = { dark, spot };
  const st = cut.style ?? {};
  const segs = segsOf(cut.caption);
  const seed = `prism-${i}`;
  switch (cut.type) {
    case "stat": {
      const em = emphasisOf(cut.caption);
      const big = hasDigit(em) ? em : withUnit(cut.data.value, cut.data.unit);
      return <HeroScene tone={tone} kicker={st.kicker ?? cut.data.label} big={big} tag={st.sub ?? (st.kicker ? cut.data.label : undefined)} note={st.note} icon={st.icon} />;
    }
    case "donut": {
      const em = emphasisOf(cut.caption);
      return <DonutScene tone={tone} value={cut.data.value} center={hasDigit(em) && em.length <= 7 ? em : `${num(cut.data.value)}%`} kicker={st.kicker ?? cut.data.label} segs={segs} sub={st.sub} />;
    }
    case "compare":
      return (
        <BeforeAfterScene
          tone={tone}
          kicker={st.kicker}
          before={{ text: withUnit(cut.data.before.value, cut.data.before.unit), label: cut.data.before.label }}
          after={{ text: withUnit(cut.data.after.value, cut.data.after.unit), label: cut.data.after.label }}
          direction={
            (cut.data.before.unit ?? "").trim() === (cut.data.after.unit ?? "").trim()
              ? cut.data.after.value >= cut.data.before.value
                ? "up"
                : "down"
              : null
          }
        />
      );
    case "chart":
      if (cut.data.points.length === 2) {
        const [a, b] = cut.data.points;
        return (
          <TwoStatsScene
            tone={tone}
            kicker={st.kicker}
            a={{ label: a.label, text: withUnit(a.value, cut.data.unit) }}
            b={{ label: b.label, text: withUnit(b.value, cut.data.unit) }}
            note={st.note}
            seed={seed}
          />
        );
      }
      if (cut.data.chartType === "line") return <LineScene tone={tone} kicker={st.kicker} segs={segs} points={cut.data.points} unit={cut.data.unit} />;
      return <BarsScene tone={tone} kicker={st.kicker} segs={segs} points={cut.data.points} unit={cut.data.unit} />;
    case "rank":
      return <BarsScene tone={tone} kicker={st.kicker} segs={segs} points={cut.data.items} unit={cut.data.unit} />;
    case "diagram": {
      const nodes = cut.data.nodes.flatMap((n) => (n.kind === "node" ? [{ icon: n.icon, label: n.label, sub: n.sub }] : []));
      const em = emphasisOf(cut.caption).toLowerCase();
      const hit = nodes.findIndex((n) => em && (n.label.toLowerCase().includes(em) || em.includes(n.label.toLowerCase())));
      if (st.scene === "timeline") return <TimelineScene tone={tone} kicker={st.kicker} segs={segs} nodes={nodes} highlight={hit >= 0 ? hit : nodes.length - 1} seed={seed} />;
      return <FlowScene tone={tone} kicker={st.kicker} segs={segs} nodes={nodes} filled={hit >= 0 ? hit : nodes.length >= 3 ? 1 : 0} />;
    }
    case "highlight":
    case "opening":
    case "photo": {
      const scene = st.scene ?? "split";
      if (scene === "newspaper") return <NewspaperScene tone={tone} kicker={st.kicker} segs={segs} sub={st.sub} columns={st.columns} narration={cut.narration} seed={seed} />;
      if (scene === "timeline" && st.cards) return <TimelineScene tone={tone} kicker={st.kicker} segs={segs} nodes={st.cards} highlight={st.cards.length - 1} seed={seed} />;
      if (scene === "cards" && st.cards) return <CardsScene tone={tone} kicker={st.kicker} segs={segs} cards={st.cards} seed={seed} />;
      if (scene === "ticker") return <TickerScene tone={tone} segs={segs} items={st.ticker ?? segs.map((s) => s.text.trim())} />;
      if (scene === "title") return <TitleScene tone={tone} kicker={st.kicker} segs={segs} sub={st.sub} />;
      if (scene === "date") return <DateScene tone={tone} segs={segs} />;
      if (scene === "hero")
        return <HeroScene tone={tone} kicker={st.kicker} big={emphasisOf(cut.caption)} segs={segs} tag={st.sub} note={st.note} icon={st.icon} />;
      const icon = st.icon ?? (cut.type === "opening" ? cut.data.icon : scene === "quote" ? "quote" : undefined);
      return (
        <SplitScene
          tone={{ ...tone, dark: false }}
          paper={paper}
          icon={scene === "quote" ? icon ?? "quote" : icon}
          label={st.tag}
          kicker={st.kicker}
          segs={segs}
          sub={st.sub}
          side={i % 2 === 0 ? "left" : "right"}
          seed={seed}
        />
      );
    }
    case "closing": {
      const parts = sentences(cut.narration);
      const body = parts.filter((s, k) => !(k === 0 && /^that's today/i.test(s)));
      const lastIdx = body.findIndex((s) => /back tomorrow/i.test(s));
      const last = lastIdx >= 0 ? body[lastIdx] : undefined;
      const lines = body.filter((_, k) => k !== lastIdx);
      return <EndCardScene group={group ?? st.kicker} lines={lines} last={last} />;
    }
  }
};

export const PrismVideo: React.FC<{ script: NewsScript }> = ({ script }) => {
  const fps = 30;
  const totalSections = Math.max(0, ...script.cuts.map((c) => c.style?.section ?? 0));
  const transitions = pickTransitions(script.cuts);
  return (
    <TransitionSeries>
      {script.cuts.map((cut, i) => {
        const paper = paperOf(cut, i);
        const section = cut.style?.section;
        const st = cut.style ?? {};
        const dark = PAPERS[paper].dark;
        const spot = spotFor(paper, section, i, clashes(paper, st.spot) ? undefined : st.spot);
        const frames = framesOf(cut, fps);
        const t = transitionOf(transitions[i], i);
        // 노란 종이 위 노란 형광펜은 안 보이므로 흰 형광펜으로 바꾼다.
        const fx = {
          effect: st.effect,
          iconStyle: st.iconStyle ?? script.design?.iconStyle,
          seed: `fx-${i}`,
          marker: paper === "yellow" ? "#FFFFFF" : undefined,
          scale: st.textScale,
          mark: st.mark,
          riso: st.riso ?? script.design?.riso,
          stopMotion: st.stopMotion ?? script.design?.stopMotion,
        };
        const isEnd = cut.type === "closing";
        // 섹션 전환 제목(title)·엔드카드에는 번호를 달지 않는다.
        const showSection = section && totalSections && !isEnd && cut.style?.scene !== "title" ? { no: section, total: totalSections } : undefined;
        return (
          <React.Fragment key={i}>
            {i > 0 ? <TransitionSeries.Transition presentation={t.presentation} timing={t.timing} /> : null}
            <TransitionSeries.Sequence durationInFrames={frames}>
              <PrismFx.Provider value={fx}>
              {cut.audioFile ? <Audio src={audioSrc(cut.audioFile)} /> : null}
              {isEnd ? (
                <SceneBody cut={cut} i={i} paper={paper} spot={spot} dark={dark} group={script.keyword} />
              ) : (
                <Shell
                  paper={paper}
                  spot={spot}
                  group={script.keyword}
                  date={script.asOfDate}
                  section={showSection}
                  source={sourceOf(cut)}
                  line={cut.narration}
                  durationInFrames={frames}
                  sticker={st.sticker}
                  stickerPos={st.stickerPos}
                >
                  <SceneBody cut={cut} i={i} paper={paper} spot={spot} dark={dark} group={script.keyword} />
                </Shell>
              )}
              </PrismFx.Provider>
            </TransitionSeries.Sequence>
          </React.Fragment>
        );
      })}
    </TransitionSeries>
  );
};
