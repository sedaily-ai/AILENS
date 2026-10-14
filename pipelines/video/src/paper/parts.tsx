import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Highlighter, PaperBackground, PaperDefs, Tape } from "./paper";
import { CLAMP, FONT, makePalette, MARGIN, PaletteProvider, PaperName, SpotName, SPRING, usePalette, useTwos } from "./theme";

/** Keyword written on masking tape, top-left, with the as-of date typed beside it. */
export const KeywordLabel: React.FC<{ label: string; asOf: string }> = ({ label, asOf }) => {
  const P = usePalette();
  return (
    <>
      <Tape x={MARGIN - 20} y={52} rotate={-2.5} color={P.tape}>
        <span style={{ fontFamily: FONT.pen, fontSize: 52, color: "#1B1B1B", lineHeight: 1.05 }}>{label}</span>
      </Tape>
      <div style={{ position: "absolute", left: MARGIN + label.length * 40 + 90, top: 74, fontFamily: FONT.mono, fontWeight: 700, fontSize: 24, color: P.muted }}>
        {asOf}
      </div>
    </>
  );
};

/** Narration line on a strip of tape, bottom center. */
export const SubtitleLine: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 6], [0, 1], CLAMP);
  if (!text.trim()) return null; // 엔드카드처럼 나레이션이 없는 장면
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 40, display: "flex", justifyContent: "center", opacity: o }}>
      <div
        style={{
          fontFamily: FONT.sans,
          fontWeight: 700,
          fontSize: 38,
          color: "#1B1B1B",
          background: "rgba(250,244,225,0.94)",
          padding: "8px 34px",
          transform: "rotate(-0.6deg)",
          boxShadow: "0 3px 8px rgba(0,0,0,0.18)",
          clipPath: "polygon(0 0, 2% 50%, 0 100%, 100% 100%, 98% 50%, 100% 0)",
        }}
      >
        {text}
      </div>
    </div>
  );
};

export const SourceLine: React.FC<{ text: string }> = ({ text }) => {
  const P = usePalette();
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: MARGIN, bottom: 118, fontFamily: FONT.mono, fontWeight: 700, fontSize: 24, color: P.muted, opacity: interpolate(frame, [10, 20], [0, 1], CLAMP) }}>
      {text}
    </div>
  );
};

/** One scene on one sheet of paper: stock, grain, slow push-in, keyword tape, source, subtitle. */
export const SceneShell: React.FC<{
  paper: PaperName;
  spot: SpotName;
  keyword?: { label: string; asOf: string };
  line: string;
  source?: string;
  zoom?: boolean;
  children: React.ReactNode;
}> = ({ paper, spot, keyword, line, source, zoom = true, children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = zoom ? interpolate(frame, [0, durationInFrames], [1, 1.03], CLAMP) : 1;
  return (
    <PaletteProvider palette={makePalette(paper, spot)}>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <PaperDefs />
        <PaperBackground />
        <AbsoluteFill style={{ transform: `scale(${scale})` }}>{children}</AbsoluteFill>
        {keyword && <KeywordLabel {...keyword} />}
        {source && <SourceLine text={source} />}
        <SubtitleLine text={line} />
      </AbsoluteFill>
    </PaletteProvider>
  );
};

/**
 * Big caption. The emphasis arrives 0.27s after the rest, larger and in the spot ink,
 * either slammed like a stamp or swiped with a highlighter.
 */
export const Caption: React.FC<{
  text: string;
  emphasis: string;
  emStyle: "stamp" | "marker";
  size?: number;
  emScale?: number;
  font?: "sans" | "serif";
  align?: "left" | "center";
  immediate?: boolean;
}> = ({ text, emphasis, emStyle, size = 84, emScale = 1.7, font = "sans", align = "left", immediate = false }) => {
  const P = usePalette();
  const frame = useCurrentFrame();
  const twos = useTwos();
  const { fps } = useVideoConfig();
  const idx = text.indexOf(emphasis);
  const before = idx >= 0 ? text.slice(0, idx) : text;
  const after = idx >= 0 ? text.slice(idx + emphasis.length) : "";
  const EM_AT = immediate ? 0 : 8;

  const enter = immediate ? 1 : spring({ frame: twos, fps, config: SPRING.enter });
  const em = spring({ frame: frame - EM_AT, fps, config: SPRING.pop, durationInFrames: 14 });
  const emTransform =
    emStyle === "stamp" ? `scale(${immediate ? 1 : 1.5 - 0.5 * em}) rotate(${(1 - em) * -6}deg)` : `translateY(${(1 - em) * 20}px)`;
  const gap = "0.28em";
  const plain: React.CSSProperties = { opacity: enter, display: "inline-block", whiteSpace: "pre", transform: `translateY(${(1 - enter) * 30}px)` };

  return (
    <div
      style={{
        fontFamily: font === "serif" ? FONT.serif : FONT.sans,
        fontWeight: 900,
        fontSize: size,
        color: P.ink,
        lineHeight: 1.15,
        textAlign: align,
        letterSpacing: -1,
      }}
    >
      {before.trim() && <span style={{ ...plain, marginRight: before.endsWith(" ") ? gap : 0 }}>{before.trim()}</span>}
      <span style={{ whiteSpace: after && !after.startsWith(" ") ? "nowrap" : "normal" }}>
        {idx >= 0 && (
          <span
            style={{
              position: "relative",
              display: "inline-block",
              whiteSpace: "pre",
              marginRight: after.startsWith(" ") ? `calc(${gap} / ${emScale})` : 0,
              color: P.spot,
              fontSize: size * emScale,
              opacity: immediate ? 1 : Math.min(1, em * 3),
              transform: emTransform,
              transformOrigin: align === "left" ? "0% 70%" : "50% 70%",
            }}
          >
            {emStyle === "marker" && <Highlighter start={EM_AT + 2} />}
            <span style={{ position: "relative" }}>{emphasis}</span>
          </span>
        )}
        {after.trim() && <span style={plain}>{after.trim()}</span>}
      </span>
    </div>
  );
};
