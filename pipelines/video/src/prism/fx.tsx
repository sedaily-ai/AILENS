import React, { createContext, useContext } from "react";
import { Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { PrismIcon, hasPrismIcon, stickerFor } from "./icons";
import { FONT } from "./theme";

// PRISM 디자인 부품(2026-10-29) — 강조 효과·3D 스티커·흐르는 띠. 컷마다 style.effect / style.iconStyle 값을
// PrismFx 컨텍스트로 내려보내, 기존 장면 코드는 DisplayText·Visual만 거치면 효과가 붙는다.

export type Effect = "marker" | "circle" | "underline" | "typewriter" | "none";
export type FxValue = {
  effect?: Effect;
  iconStyle?: "line" | "3d";
  seed: string;
  marker?: string;
  scale?: number;
  mark?: "up" | "down" | "right";
  riso?: boolean;
  stopMotion?: boolean;
};
export const PrismFx = createContext<FxValue>({ seed: "fx" });

/** 대본에서 온 숫자(textScale 등) — 범위를 벗어나면 범위 안으로 당긴다(렌더가 깨지지 않게). */
export const clamp = (v: number | undefined, min: number, max: number, fallback: number) =>
  v === undefined || !Number.isFinite(v) ? fallback : Math.min(max, Math.max(min, v));

/** 등장 움직임용 현재 프레임 — 스톱모션이면 종이를 손으로 옮기듯 2프레임마다 한 번만 움직인다. */
export const useFxFrame = () => {
  const frame = useCurrentFrame();
  const { stopMotion } = useContext(PrismFx);
  return stopMotion ? Math.floor(frame / 2) * 2 : frame;
};

/** 리소 인쇄 어긋남 — 큰 글자 뒤에 강조색 판이 살짝 비껴 찍힌 것처럼. */
export const risoShadow = (on: boolean | undefined, color: string): string | undefined => {
  if (!on) return undefined;
  const hex = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#E8452C";
  return `-5px 4px 0 ${hex}88`;
};
export const usePrismFx = () => useContext(PrismFx);

const MARKER = "#F7C531";
const RISO_RED = "#E8452C";

/** 강조 구간 하나에 효과를 건다. delay 프레임 뒤 0.3초 동안 칠해진다/그려진다. */
export const Em: React.FC<{ children: React.ReactNode; effect?: Effect; delay?: number; k?: number }> = ({ children, effect, delay = 12, k = 0 }) => {
  const frame = useFxFrame();
  const { seed, marker = MARKER } = usePrismFx();
  const p = interpolate(frame, [delay, delay + 9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (!effect || effect === "none" || effect === "typewriter") return <>{children}</>;
  const r = (n: number) => random(`${seed}-${k}-${n}`);
  if (effect === "marker") {
    // 브러시 질감 — 위아래 가장자리를 들쭉날쭉하게 자른 노란 띠가 왼쪽에서 오른쪽으로 칠해진다.
    const pts: string[] = [];
    for (let i = 0; i <= 10; i++) pts.push(`${i * 10}% ${4 + r(i) * 12}%`);
    for (let i = 10; i >= 0; i--) pts.push(`${i * 10}% ${86 + r(i + 20) * 12}%`);
    return (
      <span style={{ position: "relative", display: "inline-block", isolation: "isolate" }}>
        <span
          style={{
            position: "absolute",
            left: "-3%",
            right: "-3%",
            top: "12%",
            bottom: "0%",
            background: marker,
            opacity: 0.92,
            zIndex: -1,
            transformOrigin: "left center",
            transform: `scaleX(${p}) rotate(${(r(40) - 0.5) * 2}deg)`,
            clipPath: `polygon(${pts.join(",")})`,
          }}
        />
        {children}
      </span>
    );
  }
  const rot = (r(41) - 0.5) * 6;
  const path =
    effect === "circle"
      ? // 손으로 그린 동그라미 — 시작점과 끝점이 살짝 겹친다.
        `M ${8 + r(1) * 6} ${55 + r(2) * 10} C ${-2} ${10}, ${45} ${-4 + r(3) * 6}, ${80} ${6} S ${108} ${70}, ${62} ${96} S ${-6} ${88}, ${4} ${45} S ${30} ${2}, ${60 + r(4) * 10} ${4}`
      : `M 0 ${88 + r(5) * 4} C 25 ${80 + r(6) * 8}, 55 ${96}, 100 ${84 + r(7) * 6}`;
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      {children}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          left: effect === "circle" ? "-12%" : "-2%",
          top: effect === "circle" ? "-14%" : "10%",
          width: effect === "circle" ? "124%" : "104%",
          height: effect === "circle" ? "128%" : "100%",
          overflow: "visible",
          transform: `rotate(${rot}deg)`,
          pointerEvents: "none",
          // 늘어난 viewBox에서 dash 애니메이션이 끊겨 보여, 왼쪽부터 드러내는 방식으로 그린다.
          clipPath: `inset(-20% ${(1 - p) * 120 - 10}% -20% -20%)`,
        }}
      >
        <path d={path} fill="none" stroke={RISO_RED} strokeWidth={effect === "circle" ? 7 : 9} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
};

/** 타자기 — 글자가 한 자씩 찍히고 커서가 깜빡인다(초당 약 22자). */
export const useTypewriter = (total: number, delay = 4) => {
  const frame = useFxFrame();
  const shown = Math.max(0, Math.min(total, Math.floor((frame - delay) * 0.75)));
  const cursorOn = shown < total || Math.floor(frame / 8) % 2 === 0;
  return { shown, cursorOn, done: shown >= total };
};

/** 큰 그림 — iconStyle이 3d면 3D 스티커, 아니면 선 아이콘. 스티커가 없으면 선 아이콘으로 돌아간다. */
export const Visual: React.FC<{ name?: string; color: string; size: number; fallback?: string }> = ({ name, color, size, fallback = "info" }) => {
  const { iconStyle } = usePrismFx();
  const sticker = stickerFor(name);
  if (sticker && (iconStyle === "3d" || !hasPrismIcon(name))) return <StickerImg name={sticker} size={size * 1.15} />;
  return <PrismIcon name={hasPrismIcon(name) ? name : fallback} color={color} size={size} />;
};

/** 오려 붙인 스티커처럼 흰 테두리 + 그림자. */
export const StickerImg: React.FC<{ name: string; size: number; style?: React.CSSProperties }> = ({ name, size, style }) => (
  <Img
    src={staticFile(`3d/${name}.png`)}
    style={{
      width: size,
      height: size,
      objectFit: "contain",
      filter:
        "drop-shadow(4px 0 0 #fff) drop-shadow(-4px 0 0 #fff) drop-shadow(0 4px 0 #fff) drop-shadow(0 -4px 0 #fff) drop-shadow(0 10px 12px rgba(0,0,0,0.28))",
      ...style,
    }}
  />
);

/** 화면 귀퉁이에 톡 튀어나오는 스티커(오버슈트 큰 스프링 10/160). */
export const StickerPop: React.FC<{ name?: string; pos?: "tl" | "tr" | "bl" | "br"; delay?: number }> = ({ name, pos = "tr", delay = 14 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { seed } = usePrismFx();
  const sticker = stickerFor(name);
  if (!sticker) return null;
  const p = spring({ frame: frame - delay, fps, config: { damping: 10, stiffness: 160 } });
  const breathe = Math.sin((frame - delay) / 14) * 0.6;
  const tilt = (random(`${seed}-st`) - 0.5) * 22 + breathe;
  const at: React.CSSProperties = {
    tl: { left: 120, top: 150 },
    tr: { right: 150, top: 140 },
    bl: { left: 120, bottom: 190 },
    br: { right: 150, bottom: 190 },
  }[pos];
  return (
    <div style={{ position: "absolute", ...at, transform: `scale(${p}) rotate(${tilt}deg)`, opacity: interpolate(p, [0, 0.2], [0, 1], { extrapolateRight: "clamp" }) }}>
      <StickerImg name={sticker} size={220} />
    </div>
  );
};

/** 마스킹테이프 조각 — 카드·사진 모서리에 얹는다. */
export const TapeStrip: React.FC<{ style?: React.CSSProperties; color?: string }> = ({ style, color = "rgba(240,226,180,0.88)" }) => (
  <div
    style={{
      position: "absolute",
      width: 120,
      height: 34,
      background: color,
      boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
      clipPath: "polygon(3% 0, 97% 4%, 100% 50%, 97% 100%, 2% 96%, 0 50%)",
      ...style,
    }}
  />
);

/** 압정 — 빨간 머리 + 그림자. */
export const PushPin: React.FC<{ style?: React.CSSProperties; color?: string }> = ({ style, color = RISO_RED }) => (
  <svg width={54} height={54} viewBox="0 0 54 54" style={{ position: "absolute", overflow: "visible", ...style }}>
    <ellipse cx="30" cy="34" rx="12" ry="5" fill="rgba(0,0,0,0.22)" />
    <circle cx="27" cy="22" r="15" fill={color} />
    <circle cx="22" cy="17" r="5" fill="rgba(255,255,255,0.55)" />
  </svg>
);

/** 흐르는 띠 — 종이 테이프 위 활자가 천천히 흘러간다. */
export const TickerBand: React.FC<{ items: string[]; bg: string; color: string; dir?: 1 | -1; rotate?: number; size?: number; speed?: number; sep?: string }> = ({
  items,
  bg,
  color,
  dir = 1,
  rotate = -3,
  size = 92,
  speed = 7,
  sep = "●",
}) => {
  const frame = useCurrentFrame();
  const text = items.join(`  ${sep}  `) + `  ${sep}  `;
  const repeated = Array.from({ length: 6 }, () => text).join("");
  const offset = ((frame * speed) % 4000) * dir;
  return (
    <div style={{ position: "relative", width: "130%", marginLeft: "-15%", transform: `rotate(${rotate}deg)`, background: bg, boxShadow: "0 6px 14px rgba(0,0,0,0.18)", overflow: "hidden", padding: "14px 0 18px" }}>
      <div style={{ whiteSpace: "nowrap", fontFamily: FONT.display, fontSize: size, color, lineHeight: 1, transform: `translateX(${dir === 1 ? -offset : offset - 4000}px)` }}>{repeated}</div>
    </div>
  );
};
