import React from "react";
import { AbsoluteFill, interpolate, random, spring, useVideoConfig } from "remotion";
import { DisplayText, Kicker, useEnter, type Seg } from "./parts";
import { Visual, useFxFrame, usePrismFx } from "./fx";
import { FONT, H, INK, MARGIN, MUTED, W, fitDisplay } from "./theme";

// PRISM 디자인 부품(2026-10-29) — 신문 단 / 꺾은선 / 줄에 걸린 일정 카드 / 화살표 도장.
// scenes.tsx와 같은 규칙: 위쪽 130px(그룹 태그)과 아래쪽 170px(자막 막대) 자리는 비워 둔다.

const TOP = 130;
const BOTTOM = 170;
type Tone = { dark: boolean; spot: string };
const textColor = (t: Tone) => (t.dark ? "#FFFFFF" : INK);

// 문장 끝 = 마침표 뒤 공백 + 대문자/따옴표. "1.2 trillion"의 점에서 끊기지 않게 한다.
const sentences = (text: string) => text.split(/(?<=[.!?])\s+(?=[A-Z"'])/).map((s) => s.trim()).filter(Boolean);

// ── 신문 단 ────────────────────────────────────────────────────────
/** 신문 한 면처럼 — 제호 줄·이중 괘선·큰 제목·2~3단 본문(첫 글자 드롭캡). 본문이 없으면 나레이션 문장을 단에 나눠 싣는다. */
export const NewspaperScene: React.FC<{ tone: Tone; kicker?: string; segs: Seg[]; sub?: string; columns?: string[]; narration: string; seed: string }> = ({
  tone,
  kicker,
  segs,
  sub,
  columns,
  narration,
  seed,
}) => {
  const sheet = useEnter(0);
  const head = useEnter(6);
  const body = useEnter(12);
  const cols = (columns && columns.length ? columns : distribute(sentences(narration), 2)).slice(0, 3);
  // 본문이 짧으면 글자를 키워 단을 채운다.
  const chars = cols.join(" ").length;
  const bodySize = chars < 260 ? 36 : chars < 420 ? 30 : 25;
  const sheetW = W - 2 * MARGIN + 40;
  const title = segs.map((s) => s.text).join("");
  return (
    <AbsoluteFill style={{ top: TOP - 10, alignItems: "center" }}>
      <div
        style={{
          ...sheet,
          transform: `${sheet.transform} rotate(${(random(`${seed}-np`) - 0.5) * 1.2}deg)`,
          width: sheetW,
          height: H - TOP - BOTTOM + 10,
          background: "#F3EFE4",
          boxShadow: "0 10px 26px rgba(0,0,0,0.22)",
          padding: "26px 48px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: FONT.body, fontWeight: 800, fontSize: 22, letterSpacing: 4, color: INK, textTransform: "uppercase" }}>
          <span>{kicker ?? "AI PRISM"}</span>
          <span style={{ color: tone.spot }}>●</span>
        </div>
        <div style={{ borderTop: `4px solid ${INK}`, borderBottom: `1.5px solid ${INK}`, height: 6, margin: "10px 0 16px" }} />
        <div style={head}>
          <DisplayText segs={segs} size={fitDisplay(title, sheetW - 96, 112, 60)} color={INK} em={tone.spot} />
          {sub ? <div style={{ fontFamily: FONT.body, fontStyle: "italic", fontWeight: 600, fontSize: 30, color: MUTED, marginTop: 10 }}>{sub}</div> : null}
        </div>
        <div style={{ ...body, flex: 1, display: "flex", gap: 0, marginTop: 20, borderTop: `1.5px solid ${INK}`, paddingTop: 18, overflow: "hidden" }}>
          {cols.map((c, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                padding: "0 24px",
                borderLeft: i > 0 ? "1.5px solid rgba(27,27,27,0.35)" : undefined,
                fontFamily: FONT.body,
                fontWeight: 500,
                fontSize: bodySize,
                lineHeight: 1.42,
                color: INK,
                textAlign: "justify",
              }}
            >
              {i === 0 ? (
                <>
                  <span style={{ float: "left", fontFamily: FONT.display, fontSize: bodySize * 3.6, lineHeight: 0.86, marginRight: 10, marginTop: 4, color: tone.spot }}>{c.charAt(0)}</span>
                  {c.slice(1)}
                </>
              ) : (
                c
              )}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const distribute = (parts: string[], n: number): string[] => {
  // 한 문장뿐이면 쉼표 자리에서 반으로 나눠 두 단에 싣는다.
  if (parts.length === 1) {
    const words = parts[0].split(", ");
    if (words.length > 1) {
      const half = Math.ceil(words.length / 2);
      parts = [words.slice(0, half).join(", ") + ",", words.slice(half).join(", ")];
    }
  }
  const out: string[] = Array.from({ length: Math.min(n, parts.length) }, () => "");
  parts.forEach((p, i) => {
    const k = Math.min(out.length - 1, Math.floor((i * out.length) / parts.length));
    out[k] = out[k] ? `${out[k]} ${p}` : p;
  });
  return out;
};

// ── 꺾은선 ─────────────────────────────────────────────────────────
/** 꺾은선 — 선이 왼쪽에서 그려지고, 선이 닿는 점마다 값이 톡 찍힌다. 값은 대본 숫자 그대로, 마지막 값만 강조색. */
export const LineScene: React.FC<{ tone: Tone; kicker?: string; segs: Seg[]; points: { label: string; value: number }[]; unit?: string }> = ({ tone, kicker, segs, points, unit }) => {
  const frame = useFxFrame();
  const { fps } = useVideoConfig();
  const head = useEnter(2);
  const title = segs.map((s) => s.text).join("");
  const x0 = MARGIN + 60;
  const x1 = W - MARGIN - 60;
  const y0 = TOP + 210;
  const y1 = H - BOTTOM - 70;
  const vals = points.map((p) => p.value);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(...vals) * 1.1 || 1;
  const xs = points.map((_, i) => x0 + ((x1 - x0) * i) / Math.max(1, points.length - 1));
  const ys = points.map((p) => y1 - ((p.value - lo) / (hi - lo)) * (y1 - y0));
  const draw = interpolate(frame, [10, 10 + 8 * points.length], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const d = xs.map((x, i) => `${i ? "L" : "M"} ${x} ${ys[i]}`).join(" ");
  const ink = textColor(tone);
  return (
    <AbsoluteFill>
      <div style={{ ...head, position: "absolute", left: MARGIN, top: TOP }}>
        <Kicker text={kicker} color={tone.dark ? "#fff" : tone.spot} dash={tone.dark ? "#fff" : tone.spot} size={28} align="left" />
        <div style={{ marginTop: 4 }}>
          <DisplayText segs={segs} size={fitDisplay(title, W - 2 * MARGIN, 90, 56)} color={ink} em={tone.spot} />
        </div>
      </div>
      <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <line x1={x0 - 30} y1={y1} x2={x1 + 30} y2={y1} stroke={ink} strokeWidth={3} opacity={0.6} />
        <path d={d} fill="none" stroke={tone.spot} strokeWidth={10} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
      </svg>
      {points.map((p, i) => {
        const reach = (i / Math.max(1, points.length - 1)) * 0.98;
        const pop = spring({ frame: frame - (10 + reach * 8 * points.length), fps, config: { damping: 10, stiffness: 170 } });
        const last = i === points.length - 1;
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", left: xs[i] - 14, top: ys[i] - 14, width: 28, height: 28, borderRadius: "50%", background: last ? tone.spot : ink, border: `5px solid ${tone.dark ? "#1C2A4A" : "#F2EBDD"}`, transform: `scale(${pop})` }} />
            <div style={{ position: "absolute", left: xs[i] - 150, width: 300, top: ys[i] - (last ? 104 : 78), textAlign: "center", fontFamily: FONT.display, fontSize: last ? 76 : 50, color: last ? tone.spot : ink, opacity: pop }}>
              {p.value.toLocaleString("en-US")}
              {unit ? <span style={{ fontSize: last ? 38 : 28 }}>{unit}</span> : null}
            </div>
            <div style={{ position: "absolute", left: xs[i] - 150, width: 300, top: y1 + 16, textAlign: "center", fontFamily: FONT.body, fontWeight: 700, fontSize: 26, color: ink, opacity: interpolate(frame, [6, 14], [0, 1], { extrapolateRight: "clamp" }) }}>{p.label}</div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

// ── 줄에 걸린 일정 카드 ─────────────────────────────────────────────
type TimelineNode = { icon?: string; label: string; sub?: string };

/** 빨랫줄에 집게로 건 카드 — 카드가 차례로 걸리며 흔들리다 멈춘다. highlight 번째 카드는 강조색. */
export const TimelineScene: React.FC<{ tone: Tone; kicker?: string; segs: Seg[]; nodes: TimelineNode[]; highlight: number; seed: string }> = ({ tone, kicker, segs, nodes, highlight, seed }) => {
  const frame = useFxFrame();
  const { fps } = useVideoConfig();
  const head = useEnter(2);
  const title = segs.map((s) => s.text).join("");
  const items = nodes.slice(0, 4);
  const n = items.length;
  const lineY = TOP + 230;
  const span = W - 2 * MARGIN;
  const cardW = Math.min(380, span / n - 50);
  const xs = items.map((_, i) => MARGIN + (span * (i + 0.5)) / n);
  const sag = 40;
  const ink = textColor(tone);
  return (
    <AbsoluteFill>
      <div style={{ ...head, position: "absolute", left: MARGIN, top: TOP }}>
        <Kicker text={kicker} color={tone.dark ? "#fff" : tone.spot} dash={tone.dark ? "#fff" : tone.spot} size={28} align="left" />
        <div style={{ marginTop: 4 }}>
          <DisplayText segs={segs} size={fitDisplay(title, W - 2 * MARGIN, 90, 56)} color={ink} em={tone.spot} />
        </div>
      </div>
      <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
        <path d={`M ${MARGIN - 80} ${lineY - 10} Q ${W / 2} ${lineY + sag * 2} ${W - MARGIN + 80} ${lineY - 10}`} fill="none" stroke={tone.dark ? "#D9C3A0" : "#6B5B45"} strokeWidth={4} />
      </svg>
      {items.map((node, i) => {
        // 줄의 처짐(2차 곡선)에 맞춰 집게 높이를 정한다.
        const t = (xs[i] - (MARGIN - 80)) / (W - 2 * MARGIN + 160);
        const yOnLine = (1 - t) * (1 - t) * (lineY - 10) + 2 * (1 - t) * t * (lineY + sag * 2) + t * t * (lineY - 10);
        const start = 8 + i * 7;
        const p = spring({ frame: frame - start, fps, config: { damping: 12, stiffness: 140 } });
        const swing = Math.sin((frame - start) / 5) * 9 * Math.exp(-Math.max(0, frame - start) / 22) + (random(`${seed}-tl-${i}`) - 0.5) * 3;
        const hot = i === highlight;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: xs[i] - cardW / 2,
              top: yOnLine - 6,
              width: cardW,
              transformOrigin: "50% 0",
              transform: `translateY(${(1 - p) * -60}px) rotate(${swing}deg)`,
              opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
            }}
          >
            <div style={{ position: "absolute", left: cardW / 2 - 9, top: -22, width: 18, height: 48, background: "#C9A36B", borderRadius: 3, boxShadow: "0 2px 3px rgba(0,0,0,0.25)", zIndex: 2 }} />
            <div
              style={{
                marginTop: 14,
                background: hot ? tone.spot : "#FBF7EE",
                boxShadow: "0 10px 20px rgba(0,0,0,0.22)",
                padding: "34px 22px 26px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
              }}
            >
              {node.icon ? <Visual name={node.icon} color={hot ? "#fff" : tone.spot} size={90} /> : null}
              <div style={{ fontFamily: FONT.display, fontSize: fitDisplay(node.label, cardW - 40, 64, 34), color: hot ? "#fff" : INK, textAlign: "center", lineHeight: 1.05 }}>{node.label}</div>
              {node.sub ? <div style={{ fontFamily: FONT.body, fontWeight: 600, fontSize: 24, color: hot ? "rgba(255,255,255,0.88)" : MUTED, textAlign: "center", lineHeight: 1.25 }}>{node.sub}</div> : null}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ── 화살표 도장 ────────────────────────────────────────────────────
/** 고무도장처럼 쾅 — 둥근 테두리 안의 ▲/▼/→. 큰 숫자 옆에 찍힌다(style.mark). */
export const StampMark: React.FC<{ dir: "up" | "down" | "right"; delay?: number; size?: number }> = ({ dir, delay = 20, size = 150 }) => {
  const frame = useFxFrame();
  const { fps } = useVideoConfig();
  const { seed } = usePrismFx();
  const p = spring({ frame: frame - delay, fps, config: { damping: 9, stiffness: 200 } });
  const color = dir === "down" ? "#3255A4" : "#E8452C";
  const rot = -14 + (random(`${seed}-mark`) - 0.5) * 10;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${Math.round(size * 0.06)}px solid ${color}`,
        boxShadow: `0 0 0 ${Math.round(size * 0.02)}px ${color}33`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${interpolate(p, [0, 1], [1.7, 1])}) rotate(${rot}deg)`,
        opacity: interpolate(p, [0, 0.15], [0, 0.92], { extrapolateRight: "clamp" }),
      }}
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 100 100">
        {/* 위쪽 화살표 하나를 방향만큼 돌려 쓴다(up 0도, right 90도, down 180도). */}
        <g transform={`rotate(${dir === "up" ? 0 : dir === "right" ? 90 : 180} 50 50)`}>
          <path d="M 50 88 L 50 20 M 20 48 L 50 16 L 80 48" fill="none" stroke={color} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
};
