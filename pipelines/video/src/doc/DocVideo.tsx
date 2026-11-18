import React from "react";
import { AbsoluteFill, Audio, Sequence, Series, staticFile, useCurrentFrame } from "remotion";
import { type NewsScript } from "../lib/schema";
import { cutFrames, DOC_FPS, H_TIMING, docDurationInFrames } from "./timing";
import { C, H, W } from "./kit";
import {
  ContrastScene,
  EndScene,
  GridScene,
  ListScene,
  NamesScene,
  NumberScene,
  PairScene,
  PhotoScene,
  PhotoFullScene,
  BarsScene,
  FlowRouteScene,
  StepsScene,
  Statement,
  TimelineScene,
  type DocScene,
} from "./scenes";

// 컷 앞뒤 호흡(초). 음성이 컷 경계에 딱 붙어 들리지 않도록 앞에 짧은 정적, 뒤에 여운을 둔다.
const LEAD = H_TIMING.lead;
const TAIL = H_TIMING.tail;
const FPS = DOC_FPS;

export type DocSfx = "whoosh" | "shutter";
export type DocProps = { script: NewsScript; plan: (DocScene & { sfx?: DocSfx })[] };

const framesOf = (script: NewsScript, i: number) => cutFrames(script, i, H_TIMING);

export { docDurationInFrames };

const audioSrc = (file: string) => (file.startsWith("http") ? file : staticFile(file));

const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 2); // 입자는 2프레임마다 바뀐다(필름 느낌)
  return (
    <>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 28% 38%, ${C.bg0} 0%, ${C.bg1} 78%)` }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.5) 100%)", pointerEvents: "none" }} />
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: 0.075, mixBlendMode: "overlay", pointerEvents: "none" }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={seed} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </>
  );
};

const SceneSwitch: React.FC<{ s: DocScene }> = ({ s }) => {
  switch (s.kind) {
    case "statement":
      return <Statement lines={s.lines} accent={s.accent} />;
    case "number":
      return <NumberScene kicker={s.kicker} big={s.big} unit={s.unit} sub={s.sub} count={s.count} from={s.from} />;
    case "list":
      return <ListScene kicker={s.kicker} items={s.items} />;
    case "steps":
      return <StepsScene step={s.step} />;
    case "photofull":
      return <PhotoFullScene src={s.src} lines={s.lines} sub={s.sub} fx={s.fx} fy={s.fy} z0={s.z0} z1={s.z1} pos={s.pos} />;
    case "flow":
      return <FlowRouteScene kicker={s.kicker} nodes={s.nodes} />;
    case "bars":
      return <BarsScene kicker={s.kicker} items={s.items} reveal={s.reveal} max={s.max} unit={s.unit} prefix={s.prefix} />;
    case "photo":
      return <PhotoScene src={s.src} lines={s.lines} sub={s.sub} />;
    case "grid":
      return <GridScene total={s.total} highlight={s.highlight} label={s.label} />;
    case "names":
      return <NamesScene lead={s.lead} names={s.names} />;
    case "contrast":
      return <ContrastScene left={s.left} right={s.right} />;
    case "pair":
      return <PairScene kicker={s.kicker} items={s.items} />;
    case "timeline":
      return <TimelineScene points={s.points} />;
    case "end":
      return <EndScene lines={s.lines} />;
  }
};

const SFX: Record<DocSfx, { src: string; volume: number }> = {
  whoosh: { src: "doc/sfx/whoosh.wav", volume: 0.35 },
  shutter: { src: "doc/sfx/shutter-modern.wav", volume: 0.3 },
};

export const DocVideo: React.FC<DocProps> = ({ script, plan }) => {
  return (
    <AbsoluteFill style={{ background: C.bg1 }}>
      <Backdrop />
      <Series>
        {script.cuts.map((cut, i) => {
          const s = plan[i];
          return (
            <Series.Sequence key={i} durationInFrames={framesOf(script, i)} name={`${String(i + 1).padStart(2, "0")} ${s?.kind ?? "?"}`}>
              {s ? <SceneSwitch s={s} /> : null}
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
};
