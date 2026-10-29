import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CaptionValue } from "../lib/schema";
import { FONT, INK, MARGIN, MUTED, PAPERS, type PaperName } from "./theme";
import { Em, StickerPop, clamp, risoShadow, useFxFrame, usePrismFx, useTypewriter } from "./fx";

// PRISM 공통 부품 — 화면 틀(배경·그룹 태그·섹션 번호·출처·자막 막대)과 등장 움직임.

export type Seg = { text: string; em: boolean };

/** 세그먼트를 이어 붙일 때 모델이 경계 띄어쓰기를 빠뜨리면("reshapes"+"jobs") 붙어 보이므로, 앞뒤가 모두 글자·숫자면 한 칸 넣는다. */
export const segsOf = (caption: CaptionValue): Seg[] => {
  if (typeof caption === "string") return [{ text: caption, em: false }];
  return caption.map((s, i) => {
    const prev = i > 0 ? caption[i - 1].text : "";
    const needsSpace = i > 0 && /[A-Za-z0-9.,)]$/.test(prev) && /^[A-Za-z0-9(₩$+]/.test(s.text);
    return { text: needsSpace ? ` ${s.text}` : s.text, em: !!s.emphasis };
  });
};

export const plainOf = (caption: CaptionValue): string => segsOf(caption).map((s) => s.text).join("").trim();

/** 강조 구간 글자(없으면 전체). */
export const emphasisOf = (caption: CaptionValue): string => {
  const em = segsOf(caption).filter((s) => s.em).map((s) => s.text.trim()).join(" ").trim();
  return em || plainOf(caption);
};

/** 등장 — 아래에서 살짝 올라오며 나타난다(스프링 14/170). */
export const useEnter = (delay = 0) => {
  const frame = useFxFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 170 } });
  return { opacity: interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }), transform: `translateY(${(1 - p) * 40}px)`, p };
};

/** 도장처럼 쾅 — 1.15배에서 1.0으로 내려앉고 놓일 때 3프레임 흔들린다(스프링 9/180). */
export const useStamp = (delay = 0) => {
  const frame = useFxFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 9, stiffness: 180 } });
  const scale = interpolate(p, [0, 1], [1.15, 1]);
  const landed = frame - delay;
  const shake = landed >= 5 && landed < 8 ? (landed % 2 === 0 ? 2 : -2) : 0;
  return { opacity: interpolate(p, [0, 0.25], [0, 1], { extrapolateRight: "clamp" }), transform: `translateX(${shake}px) scale(${scale})` };
};

const Vignette: React.FC<{ dark: boolean }> = ({ dark }) => (
  <AbsoluteFill
    style={{
      background: dark
        ? "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.28) 100%)"
        : "radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(70,50,20,0.12) 100%)",
    }}
  />
);

const Header: React.FC<{ group?: string; date?: string }> = ({ group, date }) => (
  <div style={{ position: "absolute", left: 72, top: 36, display: "flex", alignItems: "center", gap: 14 }}>
    {group ? (
      <div
        style={{
          background: "#F2EBDD",
          padding: "4px 14px 6px",
          transform: "rotate(-1.5deg)",
          boxShadow: "0 2px 4px rgba(0,0,0,0.18)",
          fontFamily: FONT.display,
          fontSize: 26,
          color: INK,
          letterSpacing: 0.3,
        }}
      >
        {group}
      </div>
    ) : null}
    {date ? (
      <div style={{ background: INK, color: "#fff", padding: "5px 12px", fontFamily: FONT.body, fontWeight: 800, fontSize: 18 }}>{date}</div>
    ) : null}
  </div>
);

const SectionNo: React.FC<{ section: number; total: number; spot: string; dark: boolean }> = ({ section, total, spot, dark }) => (
  <div style={{ position: "absolute", right: 76, top: 30, fontFamily: FONT.display, color: spot, display: "flex", alignItems: "baseline", gap: 6 }}>
    <span style={{ fontSize: 50 }}>{String(section).padStart(2, "0")}</span>
    <span style={{ fontSize: 24, color: dark ? "rgba(255,255,255,0.6)" : MUTED }}>/ {String(total).padStart(2, "0")}</span>
  </div>
);

const Subtitle: React.FC<{ text: string; spot: string }> = ({ text, spot }) => {
  const size = text.length > 170 ? 22 : text.length > 110 ? 24 : 26;
  return (
    <div
      style={{
        position: "absolute",
        left: MARGIN - 36,
        right: MARGIN - 36,
        bottom: 26,
        background: "rgba(247,242,232,0.97)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
        padding: "13px 24px 14px 28px",
        borderLeft: `6px solid ${spot}`,
        fontFamily: FONT.body,
        fontWeight: 600,
        fontSize: size,
        lineHeight: 1.32,
        color: INK,
      }}
    >
      {text}
    </div>
  );
};

const Source: React.FC<{ text: string; dark: boolean; hasSubtitle: boolean }> = ({ text, dark, hasSubtitle }) => (
  <div
    style={{
      position: "absolute",
      right: MARGIN - 36,
      bottom: hasSubtitle ? 128 : 36,
      fontFamily: FONT.body,
      fontWeight: 500,
      fontSize: 15,
      color: dark ? "rgba(255,255,255,0.62)" : MUTED,
    }}
  >
    {/^source/i.test(text) ? text : `Source: ${text}`}
  </div>
);

export type ShellProps = {
  paper: PaperName;
  spot: string;
  group?: string;
  date?: string;
  section?: { no: number; total: number };
  source?: string;
  line?: string;
  durationInFrames: number;
  sticker?: string;
  stickerPos?: "tl" | "tr" | "bl" | "br";
  children: React.ReactNode;
};

/** 화면 틀 — 배경, 고정 요소, 그리고 본문은 장면 동안 1.00→1.03배로 천천히 다가온다. */
export const Shell: React.FC<ShellProps> = ({ paper, spot, group, date, section, source, line, durationInFrames, sticker, stickerPos, children }) => {
  const frame = useCurrentFrame();
  const { dark, bg } = PAPERS[paper];
  const zoom = interpolate(frame, [0, Math.max(1, durationInFrames)], [1, 1.03], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: bg }}>
      <Vignette dark={dark} />
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        {children}
        {sticker ? <StickerPop name={sticker} pos={stickerPos} /> : null}
      </AbsoluteFill>
      <Header group={group} date={date} />
      {section ? <SectionNo section={section.no} total={section.total} spot={spot} dark={dark} /> : null}
      {source ? <Source text={source} dark={dark} hasSubtitle={!!line} /> : null}
      {line ? <Subtitle text={line} spot={spot} /> : null}
    </AbsoluteFill>
  );
};

/** "— 작은 제목" 한 줄(강조색 대시). */
export const Kicker: React.FC<{ text?: string; color: string; dash: string; size?: number; delay?: number; align?: "left" | "center" }> = ({
  text,
  color,
  dash,
  size = 30,
  delay = 0,
  align = "center",
}) => {
  const e = useEnter(delay);
  if (!text) return null;
  return (
    <div style={{ ...e, display: "flex", justifyContent: align === "center" ? "center" : "flex-start", alignItems: "center", gap: 14, fontFamily: FONT.body, fontWeight: 700, fontSize: size, color }}>
      <span style={{ display: "inline-block", width: 24, height: 5, background: dash }} />
      {text}
    </div>
  );
};

/** 종이 띠 라벨 — 큰 숫자 아래에 비스듬히 붙는다. */
export const PaperTag: React.FC<{ text?: string; delay?: number; size?: number }> = ({ text, delay = 6, size = 34 }) => {
  const e = useEnter(delay);
  if (!text) return null;
  return (
    <div style={{ ...e, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          background: "#F7F0DF",
          padding: "8px 22px 10px",
          transform: `${e.transform} rotate(-1.2deg)`,
          boxShadow: "0 3px 6px rgba(0,0,0,0.2)",
          fontFamily: FONT.body,
          fontWeight: 700,
          fontSize: size,
          color: INK,
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** 큰 제목 — 강조 구간만 강조색. Anton. 컷의 style.effect가 있으면 강조 구간에 효과(형광펜·동그라미·밑줄)를,
 *  typewriter면 제목 전체를 한 글자씩 찍는다. 형광펜은 노란 띠 위라 강조 글자를 잉크색으로 둔다. */
export const DisplayText: React.FC<{ segs: Seg[]; size: number; color: string; em: string; align?: "left" | "center"; lineHeight?: number }> = ({
  segs,
  size,
  color,
  em,
  align = "left",
  lineHeight = 1.02,
}) => {
  const { effect, scale, riso } = usePrismFx();
  size = Math.round(size * clamp(scale, 0.6, 1.6, 1));
  const total = segs.reduce((n, s) => n + s.text.length, 0);
  const tw = useTypewriter(total);
  let left = effect === "typewriter" ? tw.shown : Infinity;
  return (
    <div style={{ fontFamily: FONT.display, fontSize: size, lineHeight, color, textAlign: align, letterSpacing: 0.5, textShadow: risoShadow(riso, em) }}>
      {segs.map((s, i) => {
        const text = effect === "typewriter" ? s.text.slice(0, Math.max(0, left)) : s.text;
        left -= s.text.length;
        const span = <span style={{ color: s.em ? (effect === "marker" ? INK : em) : color }}>{s.em ? text.trim() : text}</span>;
        // 효과 상자(inline-block)는 앞뒤 공백을 지우므로 공백은 상자 밖에 둔다("Today's themes"가 붙어 보이지 않게).
        return s.em ? (
          <React.Fragment key={i}>
            {/^\s/.test(text) ? " " : null}
            <Em effect={effect} k={i}>
              {span}
            </Em>
            {/\s$/.test(text) ? " " : null}
          </React.Fragment>
        ) : (
          <React.Fragment key={i}>{span}</React.Fragment>
        );
      })}
      {effect === "typewriter" && !tw.done && tw.cursorOn ? <span style={{ color: em }}>|</span> : null}
    </div>
  );
};
