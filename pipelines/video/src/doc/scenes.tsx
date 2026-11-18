import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, enter, EASE, FitLine, fitSize, H, M, Small, W } from "./kit";
import { FONT } from "../prism/theme";

// ── 장면 계획 타입(각본 JSON과 같은 길이의 배열로 따로 넘긴다. 기존 각본 스키마는 건드리지 않는다) ──
export type DocScene =
  | { kind: "statement"; lines: string[]; accent?: number }
  | { kind: "number"; kicker?: string; big: string; unit?: string; sub?: string; count?: boolean; from?: number }
  | { kind: "list"; kicker?: string; items: { label: string; sub?: string }[] }
  | { kind: "steps"; step: 1 | 2 | 3 }
  | { kind: "photofull"; src: string; lines: string[]; sub?: string; fx?: number; fy?: number; z0?: number; z1?: number; pos?: "top" | "bottom" }
  | { kind: "flow"; kicker?: string; nodes: { label: string; sub: string }[] }
  | { kind: "bars"; kicker?: string; items: { label: string; value: number }[]; reveal: number; max: number; unit?: string; prefix?: string }
  | { kind: "photo"; src: string; lines: string[]; sub?: string }
  | { kind: "grid"; total: number; highlight?: number; label: string }
  | { kind: "names"; lead: string; names: string[] }
  | { kind: "contrast"; left: { label: string; sub: string }; right: { label: string; sub: string } }
  | { kind: "pair"; kicker: string; items: { label: string; sub: string }[] }
  | { kind: "timeline"; points: { label: string; sub: string }[] }
  | { kind: "end"; lines: string[] };

const Fill: React.FC<{ children: React.ReactNode; justify?: "center" | "flex-start" }> = ({ children, justify = "center" }) => (
  <AbsoluteFill style={{ padding: `0 ${M}px`, display: "flex", flexDirection: "column", justifyContent: justify }}>{children}</AbsoluteFill>
);

export const Statement: React.FC<{ lines: string[]; accent?: number }> = ({ lines, accent }) => (
  <Fill>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {lines.map((l, i) => (
        <FitLine key={i} text={l} width={W - M * 2} max={190} delay={4 + i * 10} color={accent === i ? C.accent : C.text} />
      ))}
    </div>
  </Fill>
);

export const NumberScene: React.FC<{ kicker?: string; big: string; unit?: string; sub?: string; count?: boolean; from?: number }> = ({ kicker, big, unit, sub, count, from }) => {
  const frame = useCurrentFrame();
  const digits = /^[\d,]+$/.test(big);
  const target = digits ? Number(big.replace(/,/g, "")) : 0;
  const shown =
    digits && count
      ? Math.round(interpolate(frame, [4, 40], [from ?? 0, target], { easing: EASE, extrapolateRight: "clamp" })).toLocaleString("en-US")
      : big;
  const w = unit ? 900 : 1500;
  const size = fitSize(big, w, 460); // 카운트업 중에도 글자 크기가 흔들리지 않게 최종 값 기준으로 정한다
  return (
    <Fill>
      {kicker ? <div style={{ marginBottom: 22 }}><Small text={kicker} upper spacing="0.14em" size={36} delay={0} /></div> : null}
      <div style={{ display: "flex", alignItems: "baseline", gap: 28 }}>
        <div style={{ width: "fit-content" }}>
          <FitLine text={shown} width={w} max={460} size={size} color={C.accent} delay={2} />
        </div>
        {unit ? <FitLine text={unit} width={420} max={140} color={C.text} delay={10} /> : null}
      </div>
      {sub ? <div style={{ marginTop: 26 }}><Small text={sub} size={46} color={C.text} delay={14} /></div> : null}
    </Fill>
  );
};

export const ListScene: React.FC<{ kicker?: string; items: { label: string; sub?: string }[] }> = ({ kicker, items }) => {
  const size = Math.min(...items.map((it) => fitSize(it.label, 1350, 120)));
  return (
    <Fill>
      {kicker ? <div style={{ marginBottom: 50 }}><Small text={kicker} upper spacing="0.14em" size={36} color={C.accent} /></div> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 58 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 40 }}>
            <FitLine text={String(i + 1).padStart(2, "0")} width={200} size={96} color={C.accent} delay={8 + i * 30} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <FitLine text={it.label} width={1350} size={size} delay={10 + i * 30} />
              {it.sub ? <Small text={it.sub} size={42} color={C.muted} delay={16 + i * 30} /> : null}
            </div>
          </div>
        ))}
      </div>
    </Fill>
  );
};

export const PhotoScene: React.FC<{ src: string; lines: string[]; sub?: string }> = ({ src, lines, sub }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = enter(frame, 0, 16);
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.07]);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 300, top: 0, width: 1620, height: H, opacity: t, overflow: "hidden" }}>
        <Img
          src={staticFile(src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale})`,
            transformOrigin: "52% 38%",
            WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 38%)",
            maskImage: "linear-gradient(90deg, transparent 0%, #000 38%)",
          }}
        />
      </div>
      <AbsoluteFill style={{ padding: `0 ${M}px`, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ width: 700, display: "flex", flexDirection: "column", gap: 12 }}>
          {lines.map((l, i) => (
            <FitLine key={i} text={l} width={700} max={260} delay={6 + i * 8} />
          ))}
          {sub ? <div style={{ marginTop: 34 }}><Small text={sub} size={60} color={C.text} delay={24} weight={800} /></div> : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const GridScene: React.FC<{ total: number; highlight?: number; label: string }> = ({ total, highlight, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cols = 17;
  const cw = 84;
  const ch = 176;
  const gap = 12;
  const left = M;
  const top = 230;
  const dim = highlight ? interpolate(frame, [4, 18], [1, 0.22], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  return (
    <AbsoluteFill>
      {Array.from({ length: total }).map((_, k) => {
        const n = k + 1;
        const r = Math.floor(k / cols);
        const c = k % cols;
        const isHi = highlight === n;
        const appear = highlight ? 1 : enter(frame, 2 + k * 1.1, 10);
        const pop = isHi ? spring({ frame: frame - 4, fps, config: { damping: 200 }, durationInFrames: 20 }) : 0;
        return (
          <div
            key={n}
            style={{
              position: "absolute",
              left: left + c * (cw + gap),
              top: top + r * (ch + gap),
              width: cw,
              height: ch,
              boxSizing: "border-box",
              border: `2px solid ${isHi ? C.accent : C.line}`,
              background: isHi ? C.accent : "rgba(244,241,234,0.08)",
              opacity: isHi ? 1 : appear * dim,
              transform: `scale(${1 + pop * 0.22})`,
              zIndex: isHi ? 2 : 1,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "flex-start",
              padding: 10,
              fontFamily: FONT.display,
              fontSize: 30,
              color: isHi ? "#0A0B0E" : C.muted,
            }}
          >
            {String(n).padStart(2, "0")}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: M, top: 720, width: W - M * 2 }}>
        <FitLine text={label} width={1100} max={210} delay={highlight ? 6 : 20} color={highlight ? C.accent : C.text} />
      </div>
    </AbsoluteFill>
  );
};

export const NamesScene: React.FC<{ lead: string; names: string[] }> = ({ lead, names }) => {
  const half = Math.ceil(names.length / 2);
  const cols = [names.slice(0, half), names.slice(half)];
  return (
    <Fill>
      <div style={{ marginBottom: 40 }}><Small text={lead} upper spacing="0.14em" size={36} /></div>
      <div style={{ display: "flex", gap: 120 }}>
        {cols.map((col, ci) => (
          <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 18, width: 760 }}>
            {col.map((n, i) => {
              const idx = ci * half + i;
              const last = n.toLowerCase().includes("more");
              return <FitLine key={n} text={n} width={700} max={118} delay={8 + idx * 12} color={last ? C.muted : C.text} />;
            })}
          </div>
        ))}
      </div>
    </Fill>
  );
};

const Col: React.FC<{ label: string; sub: string; color: string; subColor: string; delay: number; w: number; size?: number }> = ({ label, sub, color, subColor, delay, w, size }) => (
  <div style={{ width: w, display: "flex", flexDirection: "column", gap: 24 }}>
    <FitLine text={label} width={w} max={130} color={color} delay={delay} size={size} />
    <Small text={sub} size={48} color={subColor} delay={delay + 8} />
  </div>
);

export const ContrastScene: React.FC<{ left: { label: string; sub: string }; right: { label: string; sub: string } }> = ({ left, right }) => {
  const frame = useCurrentFrame();
  const t = enter(frame, 0, 24);
  const size = Math.min(fitSize(left.label, 780, 130), fitSize(right.label, 780, 130));
  return (
    <Fill>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        <Col {...left} color={C.muted} subColor={C.muted} delay={4} w={780} size={size} />
        <div style={{ width: 2, height: 330 * t, background: C.line, margin: "0 60px" }} />
        <Col {...right} color={C.text} subColor={C.accent} delay={26} w={780} size={size} />
      </div>
    </Fill>
  );
};

export const PairScene: React.FC<{ kicker: string; items: { label: string; sub: string }[] }> = ({ kicker, items }) => {
  const size = Math.min(...items.map((it) => fitSize(it.label, 780, 130)));
  return (
  <Fill>
    <div style={{ marginBottom: 56 }}><Small text={kicker} upper spacing="0.14em" size={38} color={C.accent} /></div>
    <div style={{ display: "flex", gap: 100 }}>
      {items.map((it, i) => (
        <div key={i} style={{ width: 780 }}>
          <Col label={it.label} sub={it.sub} color={C.text} subColor={C.muted} delay={8 + i * 16} w={780} size={size} />
        </div>
      ))}
    </div>
  </Fill>
  );
};

export const TimelineScene: React.FC<{ points: { label: string; sub: string }[] }> = ({ points }) => {
  const frame = useCurrentFrame();
  const line = enter(frame, 0, 30);
  const y = 520;
  const subSize = Math.min(...points.map((p) => fitSize(p.sub, 660, 110, false)));
  const xs = points.length === 2 ? [M + 80, W - M - 700] : points.map((_, i) => M + 80 + i * 600);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: M, top: y, width: (W - M * 2) * line, height: 3, background: C.line }} />
      {points.map((p, i) => {
        const last = i === points.length - 1;
        const d = 10 + i * 22;
        const dot = last ? C.accent : C.muted;
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", left: xs[i], top: y - 112, width: 700 }}>
              <Small text={p.label} upper spacing="0.14em" size={36} color={dot} delay={d} />
            </div>
            <div style={{ position: "absolute", left: xs[i] - 11, top: y - 10, width: 24, height: 24, borderRadius: 12, background: dot, opacity: enter(frame, d, 10) }} />
            <div style={{ position: "absolute", left: xs[i], top: y + 56, width: 660 }}>
              <FitLine text={p.sub} width={660} max={110} delay={d + 6} color={C.text} upper={false} size={subSize} />
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

export const EndScene: React.FC<{ lines: string[] }> = ({ lines }) => (
  <Fill>
    <div style={{ display: "flex", flexDirection: "column", gap: 22, width: 1300 }}>
      {lines.map((l, i) => (
        <Small key={i} text={l} size={i === 0 ? 54 : 42} color={i === 0 ? C.text : C.muted} delay={6 + i * 12} weight={i === 0 ? 800 : 600} />
      ))}
    </div>
  </Fill>
);

// 코스피 1,800~2,200 → 9,000 → 10,000(전망) 막대. 컷 1·2·3이 같은 구도로 이어져 한 장면처럼 보인다(앞 막대는 그대로, 새 막대만 자란다).
export const StepsScene: React.FC<{ step: 1 | 2 | 3 }> = ({ step }) => {
  const frame = useCurrentFrame();
  const bars = [
    { label: "1,800–2,200", sub: "Kospi, 2010 to 2018", value: 2200 },
    { label: "9,000", sub: "Kospi, by June", value: 9000 },
    { label: "10,000", sub: "Morgan Stanley's call", value: 10000 },
  ];
  const base = 860;
  const maxH = 560;
  const bw = 380;
  const gap = 200;
  const x0 = 160;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: M, top: base, width: W - M * 2, height: 3, background: C.line }} />
      {bars.map((b, i) => {
        if (i > step - 1) return null;
        const active = i === step - 1;
        const grow = active ? enter(frame, 4, 28) : 1;
        const h = (b.value / 10000) * maxH * grow;
        const target = i === 2;
        const left = x0 + i * (bw + gap);
        const size = Math.min(fitSize(b.label, bw + 140, 104), 104);
        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: "absolute",
                left,
                top: base - h,
                width: bw,
                height: h,
                boxSizing: "border-box",
                background: target ? "rgba(247,197,49,0.12)" : i === 0 ? "rgba(244,241,234,0.32)" : "rgba(244,241,234,0.88)",
                border: target ? `4px dashed ${C.accent}` : "none",
              }}
            />
            <div style={{ position: "absolute", left, top: base - h - size - 22, opacity: grow }}>
              <FitLine text={b.label} width={bw + 140} size={size} color={target ? C.accent : C.text} delay={active ? 10 : -40} />
            </div>
            <div style={{ position: "absolute", left, top: base + 26 }}>
              <Small text={b.sub} size={40} color={target ? C.accent : C.muted} delay={active ? 14 : -40} />
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

// 사진을 화면 가득 채우고(꽉 찬 구도) 천천히 확대. 글자는 왼쪽 아래 어두운 면에 둔다.
export const PhotoFullScene: React.FC<{ src: string; lines: string[]; sub?: string; fx?: number; fy?: number; z0?: number; z1?: number; pos?: "top" | "bottom" }> = ({
  src, lines, sub, fx = 50, fy = 50, z0 = 1.0, z1 = 1.08, pos = "bottom",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [z0, z1]);
  const t = enter(frame, 0, 14);
  return (
    <AbsoluteFill style={{ opacity: t }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${fx}% ${fy}%`, transform: `scale(${scale})`, transformOrigin: `${fx}% ${fy}%` }} />
      <AbsoluteFill
        style={{
          background:
            pos === "top"
              ? "linear-gradient(180deg, rgba(4,10,22,0.82) 0%, rgba(4,10,22,0.5) 28%, rgba(4,10,22,0) 56%), linear-gradient(90deg, rgba(4,10,22,0.45) 0%, rgba(4,10,22,0) 50%)"
              : "linear-gradient(0deg, rgba(4,10,22,0.9) 0%, rgba(4,10,22,0.6) 26%, rgba(4,10,22,0) 58%), linear-gradient(90deg, rgba(4,10,22,0.55) 0%, rgba(4,10,22,0) 55%)",
        }}
      />
      <AbsoluteFill style={{ padding: pos === "top" ? `84px ${M}px 0` : `0 ${M}px 84px`, display: "flex", flexDirection: "column", justifyContent: pos === "top" ? "flex-start" : "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: pos === "top" ? 1300 : 980 }}>
          {lines.map((l, i) => (
            <FitLine key={i} text={l} width={pos === "top" ? 1300 : 980} max={190} delay={6 + i * 8} />
          ))}
          {sub ? <div style={{ marginTop: 22 }}><Small text={sub} size={50} color={C.text} delay={22} weight={800} /></div> : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// 증가율 막대 — 컷마다 reveal 개수만 늘려 같은 구도로 이어 붙이면 한 장면처럼 보인다(앞 막대는 그대로, 새 막대만 자란다).
// 값 표시: unit을 주지 않으면 증가율(+정수%, K-하이킹 편)로, 주면 그 단위·소수점 그대로(예: 2.5 T won). 2026-11-18
// — 자동 PRISM의 chart·rank 컷(조 원 등)이 "+3%"처럼 다른 숫자로 보이던 것을 막는다.
const barValue = (v: number, unit?: string, prefix?: string) => {
  if (unit === undefined) return `${prefix ?? "+"}${Math.round(v)}%`;
  const dec = Math.abs(v - Math.round(v)) > 1e-9 ? (String(v).split(".")[1]?.length ?? 1) : 0;
  const n = v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const u = unit.trim();
  return `${prefix ?? ""}${n}${u === "%" || u === "x" ? u : u ? " " + u : ""}`;
};

export const BarsScene: React.FC<{ kicker?: string; items: { label: string; value: number }[]; reveal: number; max: number; unit?: string; prefix?: string }> = ({ kicker, items, reveal, max, unit, prefix }) => {
  const frame = useCurrentFrame();
  const barX = 640;
  const barW = 880;
  const rowH = 200;
  const top = 360;
  return (
    <AbsoluteFill>
      {kicker ? <div style={{ position: "absolute", left: M, top: 170 }}><Small text={kicker} upper spacing="0.14em" size={38} color={C.accent} /></div> : null}
      {items.slice(0, reveal).map((it, i) => {
        const active = i === reveal - 1;
        const grow = active ? enter(frame, 4, 26) : 1;
        const w = (it.value / max) * barW * grow;
        const y = top + i * rowH;
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", left: M, top: y + 18, width: barX - M - 30 }}>
              <Small text={it.label} size={50} color={C.text} weight={800} delay={active ? 4 : -40} />
            </div>
            <div style={{ position: "absolute", left: barX, top: y, width: w, height: 120, background: i === 0 && reveal > 1 ? "rgba(244,241,234,0.45)" : active ? C.accent : "rgba(244,241,234,0.85)" }} />
            <div style={{ position: "absolute", left: barX + w + 28, top: y - 8, opacity: grow }}>
              <FitLine text={unit === undefined ? barValue(it.value * (active ? grow : 1), unit, prefix) : barValue(it.value, unit, prefix)} width={400} size={112} color={C.text} delay={active ? 8 : -40} />
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

// 경로 도식 — 칸이 차례로 나타나고 화살표가 이어진다(사진 없이 구조로 설명하는 장면).
export const FlowRouteScene: React.FC<{ kicker?: string; nodes: { label: string; sub: string }[] }> = ({ kicker, nodes }) => {
  const frame = useCurrentFrame();
  const n = nodes.length;
  const colW = (W - M * 2) / n;
  const size = Math.min(...nodes.map((x) => fitSize(x.label, colW - 120, 130)));
  const y = 470;
  return (
    <AbsoluteFill>
      {kicker ? <div style={{ position: "absolute", left: M, top: 190 }}><Small text={kicker} upper spacing="0.14em" size={38} color={C.accent} /></div> : null}
      {nodes.map((nd, i) => {
        const d = 8 + i * 26;
        const x = M + i * colW;
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", left: x, top: y - 70, opacity: enter(frame, d, 14) }}>
              <Small text={String(i + 1).padStart(2, "0")} size={44} color={C.accent} weight={800} delay={d} />
            </div>
            <div style={{ position: "absolute", left: x, top: y, width: colW - 110 }}>
              <FitLine text={nd.label} width={colW - 120} size={size} delay={d + 4} />
              <div style={{ marginTop: 18 }}><Small text={nd.sub} size={42} color={C.muted} delay={d + 12} /></div>
            </div>
            {i < n - 1 ? (
              <svg style={{ position: "absolute", left: x + colW - 110, top: y + size * 0.15, opacity: enter(frame, d + 14, 12) }} width={100} height={60}>
                <path d="M4 30 H84 M62 10 L84 30 L62 50" stroke={C.accent} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
