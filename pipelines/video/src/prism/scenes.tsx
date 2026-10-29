import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { hasPrismIcon, stickerFor } from "./icons";
import { DisplayText, Kicker, PaperTag, useEnter, useStamp, type Seg } from "./parts";
import { Em, PushPin, TapeStrip, TickerBand, Visual, clamp, risoShadow, useFxFrame, usePrismFx } from "./fx";
import { StampMark } from "./extra";
import { FONT, H, INK, MARGIN, MUTED, PAPERS, W, fitDisplay, fitDisplayLines, type PaperName } from "./theme";

// PRISM 장면 — 샘플 영상(2026-10-19 Early Careers 편)의 화면 종류를 옮긴 것.
// 모든 장면은 위쪽 120px(그룹 태그·섹션 번호)과 아래쪽 자막 막대 자리(약 150px)를 비워 둔다.

const TOP = 130;
const BOTTOM = 170;
const CONTENT_H = H - TOP - BOTTOM;

type Tone = { dark: boolean; spot: string };
const textColor = (t: Tone) => (t.dark ? "#FFFFFF" : INK);
const emColor = (t: Tone) => t.spot;

/** "+47%", "7.30%", "₩1.2T", "100+" — 부호·숫자·단위로 나눈다. 숫자가 아니면 null.
 *  %·pts처럼 수치 단위만 작게(강조색) 쓰고, "20s"·"1.2T"처럼 숫자에 붙은 글자는 숫자와 같은 크기로 둔다(small=false). */
const SMALL_UNITS = /^(%p?|pts?|points?|x|bp)$/i;
const splitNumber = (text: string): { sign: string; num: string; unit: string; small: boolean } | null => {
  const m = /^([+\-–▲▼]?\s*[₩$]?)([\d][\d.,]*)(.*)$/.exec(text.trim());
  if (!m) return null;
  const unit = m[3].trim();
  const small = SMALL_UNITS.test(unit);
  return small || !unit || /^\s/.test(m[3]) ? { sign: m[1].trim(), num: m[2], unit, small } : { sign: m[1].trim(), num: m[2] + m[3], unit: "", small: false };
};

// ── 큰 숫자 / 큰 글자 ─────────────────────────────────────────────
/** segs가 여러 조각이면(모델이 큰 글자를 "Practice AI tools" + "before Oct. 23"처럼 나눈 경우) 전체를 보여주고 강조 조각만 강조색. */
export const HeroScene: React.FC<{ tone: Tone; kicker?: string; big: string; segs?: Seg[]; tag?: string; note?: string; icon?: string }> = ({
  tone,
  kicker,
  big,
  segs,
  tag,
  note,
  icon,
}) => {
  const stamp = useStamp(4);
  const iconIn = useEnter(10);
  const { effect, scale, mark, riso } = usePrismFx();
  const withIcon = hasPrismIcon(icon) || !!stickerFor(icon);
  const maxW = W - 2 * MARGIN - (withIcon ? 260 : 0);
  if (segs && segs.length > 1) {
    const full = segs.map((s) => s.text).join("").trim();
    const size = fitDisplay(full, maxW, 230, 90);
    return (
      <AbsoluteFill style={{ top: TOP, height: CONTENT_H, justifyContent: "center", alignItems: "center", gap: 18 }}>
        <Kicker text={kicker} color={textColor(tone)} dash={tone.dark ? "#fff" : tone.spot} />
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          {withIcon ? (
            <div style={iconIn}>
              <Visual name={icon} color={tone.spot} size={180} />
            </div>
          ) : null}
          <div style={{ ...stamp, maxWidth: maxW }}>
            <DisplayText segs={segs} size={size} color={textColor(tone)} em={tone.spot} align="center" />
          </div>
        </div>
        <PaperTag text={tag} />
        {note ? <Hand text={note} tone={tone} delay={16} /> : null}
      </AbsoluteFill>
    );
  }
  const n = splitNumber(big);
  const size = Math.round(fitDisplay(big, maxW, 300, 120) * clamp(scale, 0.6, 1.4, 1));
  const numColor = tone.dark ? tone.spot : INK;
  return (
    <AbsoluteFill style={{ top: TOP, height: CONTENT_H, justifyContent: "center", alignItems: "center", gap: 18 }}>
      <Kicker text={kicker} color={textColor(tone)} dash={tone.dark ? "#fff" : tone.spot} />
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        {withIcon ? (
          <div style={iconIn}>
            <Visual name={icon} color={tone.spot} size={200} />
          </div>
        ) : null}
        <div style={{ ...stamp, fontFamily: FONT.display, lineHeight: 1, display: "flex", alignItems: "baseline", whiteSpace: "nowrap", textShadow: risoShadow(riso, tone.dark ? "#E8452C" : tone.spot) }}>
          {n ? (
            <>
              {n.sign ? <span style={{ fontSize: size * 0.6, color: tone.spot, marginRight: 10 }}>{n.sign}</span> : null}
              <Em effect={effect} delay={14}>
                <span style={{ fontSize: size, color: effect === "marker" ? INK : numColor }}>{n.num}</span>
              </Em>
              {n.unit ? <span style={{ fontSize: n.small ? size * 0.5 : size * 0.38, color: tone.spot, marginLeft: 10 }}>{n.unit}</span> : null}
            </>
          ) : (
            <span style={{ fontSize: size, color: tone.dark ? tone.spot : tone.spot }}>{big}</span>
          )}
        </div>
        {mark ? <StampMark dir={mark} size={Math.min(170, size * 0.6)} /> : null}
      </div>
      <PaperTag text={tag} />
      {note ? <Hand text={note} tone={tone} delay={16} /> : null}
    </AbsoluteFill>
  );
};

const Hand: React.FC<{ text: string; tone: Tone; delay?: number }> = ({ text, tone, delay = 14 }) => {
  const e = useEnter(delay);
  return (
    <div style={{ ...e, fontFamily: FONT.hand, fontSize: 40, color: tone.dark ? "#F2EBDD" : MUTED, transform: `${e.transform} rotate(-2deg)` }}>{text}</div>
  );
};

// ── 섹션 제목(전환 문구) ─────────────────────────────────────────
export const TitleScene: React.FC<{ tone: Tone; kicker?: string; segs: Seg[]; sub?: string }> = ({ tone, kicker, segs, sub }) => {
  const e = useEnter(4);
  const lines = segs.map((s) => s.text.trim()).filter(Boolean);
  const size = fitDisplayLines(lines.length ? lines : [""], W - 2 * MARGIN - 80, 190, 90);
  return (
    <AbsoluteFill style={{ top: TOP, height: CONTENT_H, justifyContent: "center", alignItems: "center", gap: 22 }}>
      <Kicker text={kicker} color={textColor(tone)} dash={tone.dark ? "#fff" : tone.spot} />
      <div style={{ ...e, textAlign: "center" }}>
        {segs.map((s, i) => (
          <DisplayText key={i} segs={[{ ...s, text: s.text.trim() }]} size={size} color={textColor(tone)} em={emColor(tone)} align="center" lineHeight={1.0} />
        ))}
      </div>
      {sub ? <SubLine text={sub} tone={tone} delay={10} /> : null}
    </AbsoluteFill>
  );
};

const SubLine: React.FC<{ text: string; tone: Tone; delay?: number; align?: "left" | "center"; size?: number }> = ({ text, tone, delay = 10, align = "center", size = 34 }) => {
  const e = useEnter(delay);
  return (
    <div style={{ ...e, fontFamily: FONT.body, fontWeight: 600, fontSize: size, color: tone.dark ? "rgba(255,255,255,0.75)" : MUTED, textAlign: align }}>{text}</div>
  );
};

// ── 날짜 카드 ─────────────────────────────────────────────────────
export const DateScene: React.FC<{ tone: Tone; segs: Seg[] }> = ({ tone, segs }) => {
  const top = useEnter(2);
  const stamp = useStamp(8);
  const bottom = useEnter(14);
  const emIdx = Math.max(0, segs.findIndex((s) => s.em));
  const before = segs.slice(0, emIdx).map((s) => s.text.trim()).join(" ").trim();
  const main = segs[emIdx]?.text.trim() ?? "";
  const after = segs.slice(emIdx + 1).map((s) => s.text.trim()).join(" ").trim();
  return (
    <AbsoluteFill style={{ top: TOP, height: CONTENT_H, justifyContent: "center", alignItems: "center" }}>
      {before ? <div style={{ ...top, fontFamily: FONT.display, fontSize: 110, color: textColor(tone), lineHeight: 1 }}>{before}</div> : null}
      <div style={{ ...stamp, fontFamily: FONT.display, fontSize: fitDisplay(main, W - 2 * MARGIN, 300, 140), color: tone.dark ? tone.spot : "#E8452C", lineHeight: 1.05 }}>{main}</div>
      {after ? <div style={{ ...bottom, fontFamily: FONT.body, fontWeight: 800, fontSize: 44, letterSpacing: 12, color: textColor(tone) }}>{after}</div> : null}
    </AbsoluteFill>
  );
};

// ── 좌우 분할(찢어진 경계) — 한쪽은 큰 그림+이름, 다른 쪽은 큰 제목 ─────────────
const TornPanel: React.FC<{ side: "left" | "right"; width: number; color: string; seed: string }> = ({ side, width, color, seed }) => {
  const pts: string[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const y = (H / steps) * i;
    const jitter = (random(`${seed}-${i}`) - 0.5) * 26;
    pts.push(`${(side === "left" ? width : W - width) + jitter},${y}`);
  }
  const poly = side === "left" ? `0,0 ${pts.join(" ")} 0,${H}` : `${W},0 ${pts.join(" ")} ${W},${H}`;
  return (
    <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
      <polygon points={poly} fill={color} />
    </svg>
  );
};

export const SplitScene: React.FC<{
  tone: Tone;
  paper: PaperName;
  icon?: string;
  label?: string;
  kicker?: string;
  segs: Seg[];
  sub?: string;
  side?: "left" | "right";
  seed: string;
}> = ({ tone, paper, icon, label, kicker, segs, sub, side = "left", seed }) => {
  const panelW = 640;
  const iconIn = useEnter(4);
  const headIn = useEnter(10);
  const panelColor = paper === "kraft" ? "#F2EBDD" : "#D9C3A0";
  const lines = segs.map((s) => s.text.trim());
  const textW = W - panelW - MARGIN - 120;
  const size = fitDisplayLines([lines.join(" ").length > 22 ? lines.join(" ").slice(0, 16) : lines.join(" ")], textW, 130, 70);
  const panel = (
    <div style={{ ...iconIn, width: panelW, display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
      <Visual name={icon} color={tone.spot} size={240} />
      {label ? <div style={{ fontFamily: FONT.display, fontSize: fitDisplay(label, panelW - 80, 66, 40), color: INK, textAlign: "center" }}>{label}</div> : null}
    </div>
  );
  const text = (
    <div style={{ ...headIn, width: textW, display: "flex", flexDirection: "column", gap: 20 }}>
      <Kicker text={kicker} color={tone.spot} dash={tone.spot} size={28} align="left" />
      <DisplayText segs={segs} size={size} color={INK} em={tone.spot} />
      {sub ? <SubLine text={sub} tone={{ ...tone, dark: false }} align="left" size={32} /> : null}
    </div>
  );
  return (
    <AbsoluteFill>
      <TornPanel side={side} width={panelW} color={panelColor} seed={seed} />
      <AbsoluteFill style={{ top: TOP, height: CONTENT_H, flexDirection: "row", alignItems: "center", gap: 90, paddingLeft: side === "left" ? 0 : MARGIN, justifyContent: side === "left" ? "flex-start" : "flex-start" }}>
        {side === "left" ? (
          <>
            {panel}
            {text}
          </>
        ) : (
          <>
            {text}
            {panel}
          </>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── 포스트잇 흐름도 ───────────────────────────────────────────────
type FlowNode = { icon: string; label: string; sub?: string };
const Tape: React.FC = () => (
  <div style={{ position: "absolute", top: -14, left: "50%", width: 90, height: 26, marginLeft: -45, background: "rgba(240,226,180,0.85)", transform: "rotate(-2deg)" }} />
);

export const FlowScene: React.FC<{ tone: Tone; kicker?: string; segs: Seg[]; nodes: FlowNode[]; filled: number }> = ({ tone, kicker, segs, nodes, filled }) => {
  const frame = useFxFrame();
  const { fps } = useVideoConfig();
  const head = useEnter(2);
  const n = Math.min(nodes.length, 3);
  const cardW = n <= 2 ? 520 : 400;
  const gap = 90;
  const title = segs.map((s) => s.text).join("");
  return (
    <AbsoluteFill style={{ top: TOP + 10, paddingLeft: MARGIN, paddingRight: MARGIN }}>
      <div style={head}>
        <Kicker text={kicker} color={tone.spot} dash={tone.spot} size={28} align="left" />
        <div style={{ marginTop: 6 }}>
          <DisplayText segs={segs} size={fitDisplay(title, W - 2 * MARGIN, 96, 60)} color={INK} em={tone.spot} />
        </div>
      </div>
      <div style={{ marginTop: 60, display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
        {nodes.slice(0, 3).map((node, i) => {
          const p = spring({ frame: frame - (8 + i * 7), fps, config: { damping: 14, stiffness: 170 } });
          const isFilled = i === filled;
          return (
            <React.Fragment key={i}>
              {i > 0 ? (
                <div style={{ width: gap, display: "flex", justifyContent: "center", opacity: p, fontFamily: FONT.display, fontSize: 60, color: tone.spot }}>→</div>
              ) : null}
              <div
                style={{
                  position: "relative",
                  width: cardW,
                  height: 300,
                  background: isFilled ? tone.spot : "#F7F2E8",
                  boxShadow: "0 6px 14px rgba(0,0,0,0.16)",
                  transform: `translateY(${(1 - p) * 50}px) rotate(${(random(`fl-${i}`) - 0.5) * 2.4}deg)`,
                  opacity: interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 14,
                  padding: "0 20px",
                }}
              >
                <Tape />
                <Visual name={node.icon} color={isFilled ? "#fff" : tone.spot} size={110} />
                <div style={{ fontFamily: FONT.body, fontWeight: 800, fontSize: fitBody(node.label, cardW - 40, 40), color: isFilled ? "#fff" : INK, textAlign: "center", lineHeight: 1.15 }}>{node.label}</div>
                {node.sub ? <div style={{ fontFamily: FONT.body, fontWeight: 600, fontSize: 24, color: isFilled ? "rgba(255,255,255,0.85)" : MUTED, textAlign: "center" }}>{node.sub}</div> : null}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const fitBody = (text: string, maxW: number, maxSize: number) => Math.max(26, Math.min(maxSize, Math.round((maxW * 1.7) / Math.max(1, text.length))));

// ── 도넛 ──────────────────────────────────────────────────────────
export const DonutScene: React.FC<{ tone: Tone; value: number; center: string; kicker?: string; segs: Seg[]; sub?: string }> = ({ tone, value, center, kicker, segs, sub }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 70 } });
  const r = 190;
  const stroke = 74;
  const circ = 2 * Math.PI * r;
  const shown = (Math.max(0, Math.min(100, value)) / 100) * p;
  const text = useEnter(10);
  const n = splitNumber(center);
  const title = segs.map((s) => s.text).join("");
  return (
    <AbsoluteFill style={{ top: TOP, height: CONTENT_H, flexDirection: "row", alignItems: "center", paddingLeft: MARGIN, gap: 90 }}>
      <div style={{ position: "relative", width: 2 * r + stroke, height: 2 * r + stroke }}>
        <svg width={2 * r + stroke} height={2 * r + stroke}>
          <circle cx={r + stroke / 2} cy={r + stroke / 2} r={r} fill="none" stroke="#CFC7B8" strokeWidth={stroke} />
          <circle
            cx={r + stroke / 2}
            cy={r + stroke / 2}
            r={r}
            fill="none"
            stroke={tone.spot}
            strokeWidth={stroke}
            strokeDasharray={`${circ * shown} ${circ}`}
            transform={`rotate(-90 ${r + stroke / 2} ${r + stroke / 2})`}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT.display, color: INK }}>
          {n ? (
            <span style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ fontSize: 110 }}>{n.num}</span>
              <span style={{ fontSize: 48, color: tone.spot }}>{n.unit}</span>
            </span>
          ) : (
            <span style={{ fontSize: 90 }}>{center}</span>
          )}
        </div>
      </div>
      <div style={{ ...text, width: W - MARGIN * 2 - (2 * r + stroke) - 90, display: "flex", flexDirection: "column", gap: 18 }}>
        <Kicker text={kicker} color={tone.spot} dash={tone.spot} size={28} align="left" />
        <DisplayText segs={segs} size={fitDisplay(title.slice(0, 18), 820, 110, 64)} color={INK} em={tone.spot} />
        {sub ? <SubLine text={sub} tone={{ ...tone, dark: false }} align="left" size={32} /> : null}
      </div>
    </AbsoluteFill>
  );
};

// ── 전후 비교 ─────────────────────────────────────────────────────
/** direction은 단위가 같을 때만 렌더러가 값으로 정한다(단위가 다르면 null → 화살표 없음). */
export const BeforeAfterScene: React.FC<{
  tone: Tone;
  kicker?: string;
  before: { text: string; label: string };
  after: { text: string; label: string };
  direction: "up" | "down" | null;
}> = ({ tone, kicker, before, after, direction }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = useEnter(2);
  const left = useEnter(8);
  const strike = interpolate(frame, [22, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rp = spring({ frame: frame - 30, fps, config: { damping: 14, stiffness: 170 } });
  const cardText = Math.min(fitDisplay(before.text, 560, 170, 70), fitDisplay(after.text, direction ? 470 : 560, 170, 70));
  const card = (bg: string): React.CSSProperties => ({
    position: "relative",
    width: 700,
    height: 330,
    background: bg,
    boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
    padding: "40px 46px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  });
  return (
    <AbsoluteFill style={{ top: TOP, paddingLeft: MARGIN, paddingRight: MARGIN }}>
      <div style={head}>
        <Kicker text={kicker} color={tone.spot} dash={tone.spot} size={28} align="left" />
        <div style={{ fontFamily: FONT.display, fontSize: 92, color: INK, marginTop: 4 }}>
          {before.text} <span style={{ fontSize: 70 }}>→</span> <span style={{ color: tone.spot }}>{after.text}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 70, marginTop: 40, alignItems: "center" }}>
        <div style={{ ...card("#F7F2E8"), ...left, transform: `${left.transform} rotate(-1.5deg)` }}>
          <div style={{ position: "relative", fontFamily: FONT.display, fontSize: cardText, color: "#8E877B", lineHeight: 1, whiteSpace: "nowrap" }}>
            {before.text}
            <div style={{ position: "absolute", left: -10, top: "52%", height: 12, width: `${strike * 104}%`, background: tone.spot, transform: "rotate(-6deg)" }} />
          </div>
          <div style={{ fontFamily: FONT.body, fontWeight: 700, fontSize: 32, color: INK, marginTop: 14 }}>{before.label}</div>
        </div>
        <div
          style={{
            ...card(tone.spot),
            opacity: interpolate(rp, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
            transform: `translateX(${(1 - rp) * 120}px) rotate(1.5deg)`,
          }}
        >
          <div style={{ fontFamily: FONT.display, fontSize: cardText, color: INK, lineHeight: 1, display: "flex", alignItems: "center", gap: 20, whiteSpace: "nowrap" }}>
            {after.text}
            {direction ? <span style={{ fontSize: Math.round(cardText * 0.53) }}>{direction === "up" ? "▲" : "▼"}</span> : null}
          </div>
          <div style={{ fontFamily: FONT.body, fontWeight: 700, fontSize: 32, color: INK, marginTop: 14 }}>{after.label}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── 숫자 두 개(좌우) ─────────────────────────────────────────────
export const TwoStatsScene: React.FC<{ tone: Tone; kicker?: string; a: { label: string; text: string }; b: { label: string; text: string }; note?: string; seed: string }> = ({
  tone,
  kicker,
  a,
  b,
  note,
  seed,
}) => {
  const left = useStamp(6);
  const right = useStamp(16);
  const half = W / 2;
  const Col: React.FC<{ v: { label: string; text: string }; style: React.CSSProperties }> = ({ v, style }) => {
    const n = splitNumber(v.text);
    return (
      <div style={{ width: half - 120, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div style={{ fontFamily: FONT.display, fontSize: fitDisplay(v.label, half - 200, 76, 44), color: INK, textAlign: "center" }}>{v.label}</div>
        <div style={{ ...style, fontFamily: FONT.display, lineHeight: 1, display: "flex", alignItems: "baseline" }}>
          {n ? (
            <>
              {n.sign ? <span style={{ fontSize: 80, color: tone.spot }}>{n.sign}</span> : null}
              <span style={{ fontSize: 190, color: INK }}>{n.num}</span>
              <span style={{ fontSize: 90, color: tone.spot }}>{n.unit}</span>
            </>
          ) : (
            <span style={{ fontSize: 150, color: tone.spot }}>{v.text}</span>
          )}
        </div>
      </div>
    );
  };
  return (
    <AbsoluteFill>
      <TornPanel side="right" width={half - 40} color="#D9C3A0" seed={seed} />
      <AbsoluteFill style={{ top: TOP, height: CONTENT_H, paddingTop: 10 }}>
        <div style={{ paddingLeft: MARGIN }}>
          <Kicker text={kicker} color={tone.spot} dash={tone.spot} size={28} align="left" />
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-around" }}>
          <Col v={a} style={left} />
          <Col v={b} style={right} />
        </div>
        {note ? (
          <div style={{ position: "absolute", left: MARGIN + 220, bottom: 30 }}>
            <Hand text={note} tone={{ ...tone, dark: false }} delay={20} />
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── 막대(3~5개) ───────────────────────────────────────────────────
export const BarsScene: React.FC<{ tone: Tone; kicker?: string; segs: Seg[]; points: { label: string; value: number }[]; unit?: string }> = ({ tone, kicker, segs, points, unit }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = useEnter(2);
  const max = Math.max(...points.map((p) => p.value), 1);
  const barMaxH = 420;
  const colW = Math.min(260, (W - 2 * MARGIN) / points.length - 40);
  const title = segs.map((s) => s.text).join("");
  return (
    <AbsoluteFill style={{ top: TOP, paddingLeft: MARGIN, paddingRight: MARGIN }}>
      <div style={head}>
        <Kicker text={kicker} color={tone.spot} dash={tone.spot} size={28} align="left" />
        <div style={{ marginTop: 4 }}>
          <DisplayText segs={segs} size={fitDisplay(title, W - 2 * MARGIN, 90, 56)} color={INK} em={tone.spot} />
        </div>
      </div>
      <div style={{ position: "absolute", left: MARGIN, right: MARGIN, bottom: BOTTOM + 30, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 50 }}>
        {points.map((pt, i) => {
          const p = spring({ frame: frame - (8 + i * 6), fps, config: { damping: 18, stiffness: 70 } });
          const h = Math.max(6, (pt.value / max) * barMaxH * p);
          const last = i === points.length - 1;
          return (
            <div key={i} style={{ width: colW, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ fontFamily: FONT.display, fontSize: 56, color: last ? tone.spot : INK, opacity: p }}>
                {pt.value.toLocaleString("en-US")}
                {unit ? <span style={{ fontSize: 30 }}>{unit}</span> : null}
              </div>
              <div style={{ width: colW, height: h, background: last ? tone.spot : "#BDB4A4", boxShadow: "0 4px 10px rgba(0,0,0,0.12)" }} />
              <div style={{ fontFamily: FONT.body, fontWeight: 700, fontSize: 26, color: INK, textAlign: "center" }}>{pt.label}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ── 엔드카드 ──────────────────────────────────────────────────────
export const EndCardScene: React.FC<{ group?: string; lines: string[]; last?: string }> = ({ group, lines, last }) => {
  const stamp = useStamp(4);
  const g = useEnter(12);
  const body = useEnter(18);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: PAPERS.black.bg }}>
      <div style={{ ...stamp, fontFamily: FONT.display, fontSize: 210, color: "#F2EBDD", lineHeight: 1 }}>AI PRISM</div>
      {group ? <div style={{ ...g, fontFamily: FONT.display, fontSize: 92, color: "#F7C531", marginTop: 8 }}>{group}</div> : null}
      <div style={{ ...g, width: 120, height: 5, background: "#F7C531", margin: "26px 0 30px" }} />
      <div style={{ ...body, maxWidth: 1240, textAlign: "center", fontFamily: FONT.body, fontWeight: 600, fontSize: 26, lineHeight: 1.45, color: "rgba(255,255,255,0.85)" }}>
        {lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      {last ? <div style={{ ...body, marginTop: 30, fontFamily: FONT.body, fontWeight: 800, fontSize: 38, color: "#fff" }}>{last}</div> : null}
    </AbsoluteFill>
  );
};

// ── 오려 붙인 종이 카드 2~4장(콜라주 보드) ─────────────────────────────
type Card = { label: string; sub?: string; icon?: string };
const CARD_PAPERS = ["#FBF7EE", "#F2EBDD", "#EDE6D3"];

export const CardsScene: React.FC<{ tone: Tone; kicker?: string; segs: Seg[]; cards: Card[]; seed: string }> = ({ tone, kicker, segs, cards, seed }) => {
  const frame = useFxFrame();
  const { fps } = useVideoConfig();
  const head = useEnter(2);
  const n = cards.length;
  const cardW = n === 2 ? 600 : Math.min(470, Math.floor((W - 2 * MARGIN - (n - 1) * 56) / n));
  const title = segs.map((s) => s.text).join("");
  return (
    <AbsoluteFill style={{ top: TOP + 10, paddingLeft: MARGIN, paddingRight: MARGIN }}>
      <div style={head}>
        <Kicker text={kicker} color={tone.dark ? "#fff" : tone.spot} dash={tone.dark ? "#fff" : tone.spot} size={28} align="left" />
        <div style={{ marginTop: 6 }}>
          <DisplayText segs={segs} size={fitDisplay(title, W - 2 * MARGIN, 96, 60)} color={textColor(tone)} em={tone.spot} />
        </div>
      </div>
      <div style={{ marginTop: 56, display: "flex", justifyContent: "center", gap: 56 }}>
        {cards.map((c, i) => {
          // 위에서 떨어져 놓이며 살짝 튕긴다(오버슈트), 놓인 뒤 ±0.5도 숨쉬기.
          const p = spring({ frame: frame - (8 + i * 6), fps, config: { damping: 11, stiffness: 150 } });
          const tilt = (random(`${seed}-card-${i}`) - 0.5) * 6 + Math.sin((frame + i * 20) / 18) * 0.5;
          const pinned = i % 2 === 1;
          const lead = i === n - 1;
          return (
            <div
              key={i}
              style={{
                position: "relative",
                width: cardW,
                height: 360,
                background: CARD_PAPERS[i % CARD_PAPERS.length],
                boxShadow: "0 10px 22px rgba(0,0,0,0.22)",
                clipPath: "polygon(0.6% 1.2%, 99% 0, 100% 98.6%, 1.4% 100%)",
                transform: `translateY(${(1 - p) * -90}px) rotate(${tilt + (1 - p) * 8}deg)`,
                opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: "clamp" }),
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                padding: "26px 30px",
                borderBottom: lead ? `10px solid ${tone.spot}` : undefined,
              }}
            >
              {c.icon ? <Visual name={c.icon} color={tone.spot} size={120} /> : null}
              <div style={{ fontFamily: FONT.display, fontSize: fitDisplay(c.label, cardW - 70, 76, 40), color: lead ? tone.spot : INK, textAlign: "center", lineHeight: 1.05 }}>{c.label}</div>
              {c.sub ? <div style={{ fontFamily: FONT.body, fontWeight: 600, fontSize: 26, color: MUTED, textAlign: "center", lineHeight: 1.25 }}>{c.sub}</div> : null}
            </div>
          );
        })}
      </div>
      {/* 테이프·압정은 카드의 clipPath에 잘리지 않게 카드 밖 같은 자리에 얹는다. */}
      <CardDecor n={n} cardW={cardW} frame={frame} />
    </AbsoluteFill>
  );
};

const CardDecor: React.FC<{ n: number; cardW: number; frame: number }> = ({ n, cardW, frame }) => {
  const gap = 56;
  const total = n * cardW + (n - 1) * gap;
  const startX = (W - 2 * MARGIN - total) / 2;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const x = startX + i * (cardW + gap);
        const shown = interpolate(frame, [18 + i * 6, 24 + i * 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return i % 2 === 1 ? (
          <PushPin key={i} style={{ left: x + cardW / 2 - 27, top: 172, opacity: shown }} />
        ) : (
          <TapeStrip key={i} style={{ left: x + cardW / 2 - 60, top: 180, transform: `rotate(${i === 0 ? -4 : 3}deg)`, opacity: shown }} />
        );
      })}
    </>
  );
};

// ── 흐르는 띠(티커) — 섹션 사이 호흡 ───────────────────────────────
export const TickerScene: React.FC<{ tone: Tone; segs: Seg[]; items: string[] }> = ({ tone, segs, items }) => {
  const mid = useEnter(8);
  const title = segs.map((s) => s.text).join("");
  return (
    <AbsoluteFill style={{ top: TOP, height: CONTENT_H, justifyContent: "center", gap: 46 }}>
      <TickerBand items={items} bg="rgba(240,226,180,0.95)" color={INK} rotate={-3} />
      <div style={{ ...mid, padding: `0 ${MARGIN}px` }}>
        <DisplayText segs={segs} size={fitDisplay(title, W - 2 * MARGIN, 130, 70)} color={textColor(tone)} em={tone.spot} align="center" />
      </div>
      <TickerBand items={items} bg={tone.spot} color="#fff" dir={-1} rotate={2} size={64} speed={5} sep="▲" />
    </AbsoluteFill>
  );
};
