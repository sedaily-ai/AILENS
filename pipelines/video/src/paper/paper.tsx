import React from "react";
import { AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP, FONT, H, SPRING, usePalette, useTwos, W } from "./theme";

/**
 * Shared SVG filters. Rendered once per scene; identical ids across scenes are harmless.
 * - rough-cut: scissor-cut edge (subtle wobble)
 * - rough-torn: torn edge (stronger wobble)
 * - ink-bleed: rubber stamp / riso ink texture
 */
export const PaperDefs: React.FC = () => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <defs>
      <filter id="rough-cut" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={3} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={4} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="rough-torn" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves={3} seed={7} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={11} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="ink-bleed" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves={2} seed={11} result="grain" />
        <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.5" result="holes" />
        <feComposite in="SourceGraphic" in2="holes" operator="in" result="speckled" />
        <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves={2} seed={5} result="w" />
        <feDisplacementMap in="speckled" in2="w" scale={3} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  </svg>
);

/** Paper stock + living film grain (new seed every 3 frames) + mottled fibers + vignette. */
export const PaperBackground: React.FC = () => {
  const P = usePalette();
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 3);
  return (
    <AbsoluteFill style={{ backgroundColor: P.paper }}>
      <svg width={W} height={H} style={{ position: "absolute", mixBlendMode: P.dark ? "screen" : "multiply" }}>
        <filter id={`fiber`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves={3} seed={2} />
          <feColorMatrix type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.33  0 0 0 0.9 -0.35" />
        </filter>
        <filter id={`grain-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={seed} />
          <feColorMatrix type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.18  0 0 0 0 0.15  0 0 0 1.6 -0.55" />
        </filter>
        <rect width={W} height={H} filter="url(#fiber)" opacity={P.dark ? 0.08 : 0.16} />
        <rect width={W} height={H} filter={`url(#grain-${seed})`} opacity={P.dark ? 0.1 : 0.14} />
      </svg>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(40,30,15,0.16) 100%)" }} />
    </AbsoluteFill>
  );
};

type Enter = "drop" | "left" | "right" | "up" | "none";

/**
 * A cut-paper card: rough edge, soft cast shadow, slight tilt, stop-motion entrance with overshoot,
 * and a barely-there breathing wobble once placed. Only the paper layer is filtered, never the text.
 */
export const PaperCard: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: number;
  color?: string;
  torn?: boolean;
  enterAt?: number;
  enter?: Enter;
  halftone?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ x, y, w, h, rotate = 0, color, torn = false, enterAt = 0, enter = "drop", halftone, children, style }) => {
  const P = usePalette();
  const frame = useCurrentFrame();
  const twos = useTwos();
  const { fps } = useVideoConfig();
  const p = enter === "none" ? 1 : spring({ frame: twos - enterAt, fps, config: SPRING.enter });
  if (p <= 0.001) return null;
  const off = {
    drop: [0, -50, 1.08],
    left: [-260, 0, 1],
    right: [260, 0, 1],
    up: [0, 220, 1],
    none: [0, 0, 1],
  }[enter];
  const breathe = Math.sin((frame + x) / 22) * 0.5;
  const tx = off[0] * (1 - p);
  const ty = off[1] * (1 - p);
  const sc = 1 + (off[2] - 1) * (1 - p);
  const lift = 1 - p; // shadow grows while the card is in the air

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        transform: `translate(${tx}px, ${ty}px) rotate(${rotate + breathe + (1 - p) * 4}deg) scale(${sc})`,
        opacity: Math.min(1, p * 2),
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: color ?? P.paper,
          backgroundImage: halftone ? `radial-gradient(${halftone} 2.2px, transparent 2.6px)` : undefined,
          backgroundSize: halftone ? "9px 9px" : undefined,
          filter: `url(#${torn ? "rough-torn" : "rough-cut"}) drop-shadow(0 ${7 + lift * 18}px ${10 + lift * 14}px rgba(30,20,5,${0.28 - lift * 0.08}))`,
        }}
      />
      <div style={{ position: "relative", width: "100%", height: "100%" }}>{children}</div>
    </div>
  );
};

/** Translucent masking tape with zig-zag torn ends. */
export const Tape: React.FC<{ x: number; y: number; w?: number; rotate?: number; color?: string; children?: React.ReactNode; enterAt?: number }> = ({
  x,
  y,
  w = 160,
  rotate = -4,
  color,
  children,
  enterAt = 0,
}) => {
  const P = usePalette();
  const twos = useTwos();
  if (twos < enterAt) return null;
  const zig = (side: "l" | "r") =>
    Array.from({ length: 7 }, (_, i) => {
      const yy = (i / 6) * 100;
      const xx = i % 2 ? 4 : 0;
      return side === "l" ? `${xx}% ${yy}%` : `${100 - xx}% ${100 - yy}%`;
    }).join(",");
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        minWidth: w,
        padding: children ? "6px 34px" : 0,
        height: children ? undefined : 44,
        background: color ?? P.tape,
        clipPath: `polygon(${zig("l")}, ${zig("r")})`,
        transform: `rotate(${rotate}deg)`,
        boxShadow: "0 2px 4px rgba(0,0,0,0.12)",
      }}
    >
      {children}
    </div>
  );
};

/** Push pin seen from above: colored head, highlight, cast shadow. */
export const Pin: React.FC<{ x: number; y: number; color?: string; enterAt?: number }> = ({ x, y, color, enterAt = 0 }) => {
  const P = usePalette();
  const twos = useTwos();
  const { fps } = useVideoConfig();
  const p = spring({ frame: twos - enterAt, fps, config: SPRING.pop });
  if (p <= 0) return null;
  const s = 1 + (1 - p) * 0.8;
  return (
    <div style={{ position: "absolute", left: x - 16, top: y - 16, width: 32, height: 32, transform: `scale(${s})`, opacity: Math.min(1, p * 2) }}>
      <div style={{ position: "absolute", left: 8, top: 12, width: 30, height: 30, borderRadius: 15, background: "rgba(20,10,0,0.28)", filter: "blur(4px)" }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: 16, background: color ?? P.spotPaper, boxShadow: "inset -4px -5px 0 rgba(0,0,0,0.25)" }} />
      <div style={{ position: "absolute", left: 8, top: 6, width: 9, height: 7, borderRadius: 5, background: "rgba(255,255,255,0.6)" }} />
    </div>
  );
};

// ---- Hand-drawn strokes (drawn on with stroke-dashoffset) ----

const wobblyEllipse = (cx: number, cy: number, rx: number, ry: number, seed: string) => {
  const pts: string[] = [];
  const turns = 1.12;
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns - 0.6;
    const wob = 1 + (random(`${seed}-${i}`) - 0.5) * 0.06 + (i / steps) * 0.05;
    pts.push(`${(cx + Math.cos(t) * rx * wob).toFixed(1)},${(cy + Math.sin(t) * ry * wob).toFixed(1)}`);
  }
  return "M" + pts.join("L");
};

/** A marker loop drawn around a w×h box. Place it absolutely over the target. */
export const HandCircle: React.FC<{ w: number; h: number; start: number; dur?: number; color?: string; width?: number; seed?: string }> = ({
  w,
  h,
  start,
  dur = 12,
  color,
  width = 7,
  seed = "c",
}) => {
  const P = usePalette();
  const frame = useCurrentFrame();
  const t = interpolate(frame, [start, start + dur], [0, 1], CLAMP);
  const pad = 24;
  const d = wobblyEllipse(w / 2 + pad, h / 2 + pad, w / 2 + pad * 0.6, h / 2 + pad * 0.5, seed);
  return (
    <svg width={w + pad * 2} height={h + pad * 2} style={{ position: "absolute", left: -pad, top: -pad, overflow: "visible", pointerEvents: "none" }}>
      <path d={d} fill="none" stroke={color ?? P.spot} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - t} />
    </svg>
  );
};

/** Highlighter swipe behind text (place as first child of a relative box). */
export const Highlighter: React.FC<{ start: number; dur?: number; color?: string; height?: string }> = ({ start, dur = 8, color, height = "42%" }) => {
  const P = usePalette();
  const frame = useCurrentFrame();
  const t = interpolate(frame, [start, start + dur], [0, 1], CLAMP);
  return (
    <div
      style={{
        position: "absolute",
        left: "-3%",
        bottom: "6%",
        height,
        width: `${106 * t}%`,
        background: color ?? P.spot,
        opacity: P.dark ? 0.45 : 0.3,
        transform: "rotate(-1.2deg)",
        borderRadius: 6,
        filter: "url(#rough-cut)",
      }}
    />
  );
};

/** Slightly curved hand-drawn arrow from a to b, with arrowhead, drawn on over `dur` frames. */
export const HandArrow: React.FC<{ from: [number, number]; to: [number, number]; start: number; dur?: number; bend?: number; color?: string; dashed?: boolean }> = ({
  from,
  to,
  start,
  dur = 10,
  bend = 0.18,
  color,
  dashed = false,
}) => {
  const P = usePalette();
  const frame = useCurrentFrame();
  const t = interpolate(frame, [start, start + dur], [0, 1], CLAMP);
  if (t <= 0) return null;
  const [ax, ay] = from;
  const [bx, by] = to;
  const mx = (ax + bx) / 2 - (by - ay) * bend;
  const my = (ay + by) / 2 + (bx - ax) * bend;
  // Point and tangent along the quadratic curve at t.
  const qx = (1 - t) ** 2 * ax + 2 * (1 - t) * t * mx + t ** 2 * bx;
  const qy = (1 - t) ** 2 * ay + 2 * (1 - t) * t * my + t ** 2 * by;
  const dx = 2 * (1 - t) * (mx - ax) + 2 * t * (bx - mx);
  const dy = 2 * (1 - t) * (my - ay) + 2 * t * (by - my);
  const ang = Math.atan2(dy, dx);
  const steps = 30;
  const pts = Array.from({ length: steps + 1 }, (_, i) => {
    const u = (t * i) / steps;
    return `${((1 - u) ** 2 * ax + 2 * (1 - u) * u * mx + u ** 2 * bx).toFixed(1)},${((1 - u) ** 2 * ay + 2 * (1 - u) * u * my + u ** 2 * by).toFixed(1)}`;
  });
  const head = 26;
  const c = color ?? P.ink;
  return (
    <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
      <path d={"M" + pts.join("L")} fill="none" stroke={c} strokeWidth={6} strokeLinecap="round" strokeDasharray={dashed ? "2 16" : undefined} />
      {t > 0.9 && (
        <path
          d={`M${qx - head * Math.cos(ang - 0.45)},${qy - head * Math.sin(ang - 0.45)} L${qx},${qy} L${qx - head * Math.cos(ang + 0.45)},${qy - head * Math.sin(ang + 0.45)}`}
          fill="none"
          stroke={c}
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
};

/** Rubber stamp: slams down (1.6× → 1), inked texture, bordered box, tilted. */
export const Stamp: React.FC<{ text: string; at: number; size?: number; color?: string; rotate?: number; style?: React.CSSProperties }> = ({
  text,
  at,
  size = 160,
  color,
  rotate = -8,
  style,
}) => {
  const P = usePalette();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - at, fps, config: SPRING.pop, durationInFrames: 12 });
  if (frame < at) return null;
  const c = color ?? P.spot;
  return (
    <div
      style={{
        display: "inline-block",
        transform: `rotate(${rotate}deg) scale(${1.6 - 0.6 * p})`,
        opacity: Math.min(1, p * 3),
        filter: "url(#ink-bleed)",
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: FONT.sans,
          fontWeight: 900,
          fontSize: size,
          color: c,
          border: `${Math.round(size / 14)}px solid ${c}`,
          borderRadius: size / 8,
          padding: `${size * 0.04}px ${size * 0.22}px`,
          lineHeight: 1.1,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** 2px camera shake for 3 frames after a stamp lands. Wrap scene content. */
export const useImpactShake = (at: number) => {
  const frame = useCurrentFrame();
  const k = frame - at;
  if (k < 2 || k > 5) return "none";
  return `translate(${(random(`sx${k}`) - 0.5) * 6}px, ${(random(`sy${k}`) - 0.5) * 6}px)`;
};
