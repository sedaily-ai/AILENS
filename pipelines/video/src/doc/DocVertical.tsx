import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, Series, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { type NewsScript } from "../lib/schema";
import { cutFrames, DOC_FPS, V_TIMING, verticalDurationInFrames } from "./timing";
import { C, EASE, enter, FitLine, fitSize, Small } from "./kit";
import { FONT } from "../prism/theme";

// 세로(1080x1920) 쇼츠용 다큐 해설 구성 — 가로 DocVideo와 같은 디자인 시스템(차콜, 흰 글자, 강조색 하나).
// 유튜브 쇼츠 UI가 위(약 200px)와 아래(약 380px)를 가리므로 핵심 요소는 그 사이에 둔다.
export const VW = 1080;
export const VH = 1920;
const VM = 80;
const CW = VW - VM * 2; // 콘텐츠 폭 920

const LEAD = V_TIMING.lead;
const TAIL = V_TIMING.tail;
const FPS = DOC_FPS;

export type VScene =
  | { kind: "photo"; src: string; lines: string[]; sub?: string }
  | { kind: "grid"; total: number; highlight?: number; label: string }
  | { kind: "number"; kicker?: string; big: string; unit?: string; sub?: string; count?: boolean; from?: number; instant?: boolean }
  | { kind: "list"; kicker?: string; items: { label: string; sub?: string }[] }
  | { kind: "compare"; top: { label: string; sub: string }; bottom: { label: string; sub: string } }
  | { kind: "statement"; lines: string[]; accent?: number; instant?: boolean }
  | { kind: "end"; lines: string[] };
export type VProps = { script: NewsScript; plan: (VScene & { sfx?: "whoosh" | "shutter" })[] };

const framesOf = (script: NewsScript, i: number) => cutFrames(script, i, V_TIMING);
export { verticalDurationInFrames };
const audioSrc = (f: string) => (f.startsWith("http") ? f : staticFile(f));

const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 30% 30%, ${C.bg0} 0%, ${C.bg1} 80%)` }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.5) 100%)", pointerEvents: "none" }} />
      <svg width={VW} height={VH} style={{ position: "absolute", inset: 0, opacity: 0.075, mixBlendMode: "overlay", pointerEvents: "none" }}>
        <filter id="vgrain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={Math.floor(frame / 2)} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#vgrain)" />
      </svg>
    </>
  );
};

// 첫 장면은 첫 프레임부터 완성된 모습이어야 쇼츠 표지로 쓸 수 있다 → 등장 지연을 음수로 줘서 0프레임에 이미 보이게 한다.
const NOW = -40;

const VPhoto: React.FC<{ src: string; lines: string[]; sub?: string }> = ({ src, lines, sub }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.06]);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 0, top: 0, width: VW, height: 1020, overflow: "hidden" }}>
        <Img
          src={staticFile(src)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "56% 20%",
            transform: `scale(${scale})`,
            transformOrigin: "56% 25%",
            WebkitMaskImage: "linear-gradient(180deg, #000 55%, transparent 100%)",
            maskImage: "linear-gradient(180deg, #000 55%, transparent 100%)",
          }}
        />
      </div>
      <div style={{ position: "absolute", left: VM, top: 880, width: CW, display: "flex", flexDirection: "column", gap: 10 }}>
        {lines.map((l, i) => (
          <FitLine key={i} text={l} width={CW} max={360} delay={NOW} lineHeight={0.98} />
        ))}
        {sub ? <div style={{ marginTop: 28 }}><Small text={sub} size={58} color={C.text} delay={NOW} weight={800} /></div> : null}
      </div>
    </AbsoluteFill>
  );
};

const VGrid: React.FC<{ total: number; highlight?: number; label: string }> = ({ total, highlight, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cols = 6;
  const gap = 12;
  const cell = (CW - gap * (cols - 1)) / cols;
  const top = 360;
  const dim = highlight ? interpolate(frame, [4, 18], [1, 0.2], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
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
              left: VM + c * (cell + gap),
              top: top + r * (cell + gap),
              width: cell,
              height: cell,
              boxSizing: "border-box",
              border: `2px solid ${isHi ? C.accent : C.line}`,
              background: isHi ? C.accent : "rgba(244,241,234,0.08)",
              opacity: isHi ? 1 : appear * dim,
              transform: `scale(${1 + pop * 0.2})`,
              zIndex: isHi ? 2 : 1,
              display: "flex",
              alignItems: "flex-end",
              padding: 12,
              fontFamily: FONT.display,
              fontSize: 38,
              color: isHi ? "#0A0B0E" : C.muted,
            }}
          >
            {String(n).padStart(2, "0")}
          </div>
        );
      })}
      <div style={{ position: "absolute", left: VM, top: top + 6 * (cell + gap) + 30, width: CW }}>
        <FitLine text={label} width={CW} max={190} delay={highlight ? 6 : 20} color={highlight ? C.accent : C.text} />
      </div>
    </AbsoluteFill>
  );
};

const Stack: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ padding: `0 ${VM}px 130px`, display: "flex", flexDirection: "column", justifyContent: "center" }}>{children}</AbsoluteFill>
);

const VNumber: React.FC<{ kicker?: string; big: string; unit?: string; sub?: string; count?: boolean; from?: number; instant?: boolean }> = ({ kicker, big, unit, sub, count, from, instant }) => {
  const frame = useCurrentFrame();
  const d = instant ? NOW : 0;
  const digits = /^[\d,]+$/.test(big);
  const target = digits ? Number(big.replace(/,/g, "")) : 0;
  const shown =
    digits && count && !instant
      ? Math.round(interpolate(frame, [4, 36], [from ?? 0, target], { easing: EASE, extrapolateRight: "clamp" })).toLocaleString("en-US")
      : big;
  const size = fitSize(big, CW, 640);
  return (
    <Stack>
      {kicker ? <div style={{ marginBottom: 26 }}><Small text={kicker} upper spacing="0.14em" size={38} delay={d} /></div> : null}
      <FitLine text={shown} width={CW} max={640} size={size} color={C.accent} delay={d + 2} lineHeight={0.95} />
      {unit ? <div style={{ marginTop: 4 }}><FitLine text={unit} width={CW} max={170} color={C.text} delay={d + 10} /></div> : null}
      {sub ? <div style={{ marginTop: 34 }}><Small text={sub} size={48} color={C.text} delay={d + 14} /></div> : null}
    </Stack>
  );
};

const VList: React.FC<{ kicker?: string; items: { label: string; sub?: string }[] }> = ({ kicker, items }) => {
  const size = Math.min(...items.map((it) => fitSize(it.label, CW - 150, 110)));
  return (
    <Stack>
      {kicker ? <div style={{ marginBottom: 56 }}><Small text={kicker} upper spacing="0.14em" size={38} color={C.accent} /></div> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 54 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 30 }}>
            <FitLine text={String(i + 1).padStart(2, "0")} width={140} size={84} color={C.accent} delay={8 + i * 30} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <FitLine text={it.label} width={CW - 150} size={size} delay={10 + i * 30} />
              {it.sub ? <Small text={it.sub} size={38} color={C.muted} delay={16 + i * 30} /> : null}
            </div>
          </div>
        ))}
      </div>
    </Stack>
  );
};

const VCompare: React.FC<{ top: { label: string; sub: string }; bottom: { label: string; sub: string } }> = ({ top, bottom }) => {
  const frame = useCurrentFrame();
  const size = Math.min(fitSize(top.label, CW, 230), fitSize(bottom.label, CW, 230));
  const line = enter(frame, 14, 20);
  return (
    <Stack>
      <FitLine text={top.label} width={CW} size={size} color={C.muted} delay={4} />
      <div style={{ marginTop: 10 }}><Small text={top.sub} size={44} color={C.muted} delay={10} /></div>
      <div style={{ margin: "56px 0", height: 3, width: CW * line, background: C.line }} />
      <FitLine text={bottom.label} width={CW} size={size} color={C.accent} delay={26} />
      <div style={{ marginTop: 10 }}><Small text={bottom.sub} size={44} color={C.text} delay={32} /></div>
    </Stack>
  );
};

const VStatement: React.FC<{ lines: string[]; accent?: number; instant?: boolean }> = ({ lines, accent, instant }) => {
  const size = Math.min(...lines.map((l) => fitSize(l, CW, 200)));
  return (
    <Stack>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {lines.map((l, i) => (
          <FitLine key={i} text={l} width={CW} max={200} size={size} delay={instant ? NOW : 4 + i * 10} color={accent === i ? C.accent : C.text} />
        ))}
      </div>
    </Stack>
  );
};

// 마무리 — AI 제작 고지(PRISM 마무리 화면과 같은 내용). 첫 줄만 크게.
const VEnd: React.FC<{ lines: string[] }> = ({ lines }) => (
  <Stack>
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {lines.map((l, i) => (
        <Small key={i} text={l} size={i === 0 ? 50 : 38} color={i === 0 ? C.text : C.muted} delay={6 + i * 12} />
      ))}
    </div>
  </Stack>
);

const Switch: React.FC<{ s: VScene }> = ({ s }) => {
  switch (s.kind) {
    case "photo":
      return <VPhoto src={s.src} lines={s.lines} sub={s.sub} />;
    case "grid":
      return <VGrid total={s.total} highlight={s.highlight} label={s.label} />;
    case "number":
      return <VNumber kicker={s.kicker} big={s.big} unit={s.unit} sub={s.sub} count={s.count} from={s.from} instant={s.instant} />;
    case "list":
      return <VList kicker={s.kicker} items={s.items} />;
    case "compare":
      return <VCompare top={s.top} bottom={s.bottom} />;
    case "statement":
      return <VStatement lines={s.lines} accent={s.accent} instant={s.instant} />;
    case "end":
      return <VEnd lines={s.lines} />;
  }
};

const SFX = { whoosh: { src: "doc/sfx/whoosh.wav", volume: 0.35 }, shutter: { src: "doc/sfx/shutter-modern.wav", volume: 0.3 } };

export const DocVerticalVideo: React.FC<VProps> = ({ script, plan }) => (
  <AbsoluteFill style={{ background: C.bg1 }}>
    <Backdrop />
    <Series>
      {script.cuts.map((cut, i) => {
        const s = plan[i];
        return (
          <Series.Sequence key={i} durationInFrames={framesOf(script, i)} name={`${String(i + 1).padStart(2, "0")} ${s?.kind ?? "?"}`}>
            {s ? <Switch s={s} /> : null}
            {cut.audioFile ? (
              <Sequence from={Math.round(LEAD * FPS)} layout="none">
                <Audio src={audioSrc(cut.audioFile)} />
              </Sequence>
            ) : null}
            {s?.sfx ? <Audio src={staticFile(SFX[s.sfx].src)} volume={SFX[s.sfx].volume} /> : null}
          </Series.Sequence>
        );
      })}
    </Series>
  </AbsoluteFill>
);
