import React from "react";
import { AbsoluteFill, random } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { W } from "./theme";

type NoProps = Record<string, never>;
type Comp = React.FC<TransitionPresentationComponentProps<NoProps>>;

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** New sheet slides in tilted from the right and lands over the old one. */
const PaperCover: Comp = ({ children, presentationDirection, presentationProgress }) => {
  if (presentationDirection === "exiting") {
    return <AbsoluteFill style={{ filter: `brightness(${1 - presentationProgress * 0.15})` }}>{children}</AbsoluteFill>;
  }
  const p = ease(presentationProgress);
  return (
    <AbsoluteFill
      style={{
        transform: `translateX(${(1 - p) * 105}%) rotate(${(1 - p) * 5}deg)`,
        transformOrigin: "100% 100%",
        boxShadow: "-30px 0 50px rgba(0,0,0,0.3)",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

// Fixed jagged tear profile (deterministic).
const TEAR = Array.from({ length: 28 }, (_, i) => ({ y: (i / 27) * 100, j: (random(`tear-${i}`) - 0.5) * 70 }));

/** A torn edge sweeps across the frame revealing the next scene. */
const Tear: Comp = ({ children, presentationDirection, presentationProgress }) => {
  if (presentationDirection === "exiting") return <AbsoluteFill>{children}</AbsoluteFill>;
  const edge = -120 + ease(presentationProgress) * (W + 240);
  const pts = TEAR.map(({ y, j }) => `${Math.max(0, edge + j)}px ${y}%`);
  const clip = `polygon(0 0, ${pts.join(", ")}, 0 100%)`;
  return (
    <AbsoluteFill style={{ clipPath: clip, filter: "drop-shadow(8px 0 10px rgba(0,0,0,0.35))" }}>
      {children}
    </AbsoluteFill>
  );
};

/** The old page turns away around its left edge, revealing the next one underneath. */
const PageFlip: Comp = ({ children, presentationDirection, presentationProgress }) => {
  if (presentationDirection === "entering") return <AbsoluteFill>{children}</AbsoluteFill>;
  const p = ease(presentationProgress);
  return (
    <AbsoluteFill style={{ zIndex: 2, perspective: 2200 }}>
      <AbsoluteFill
        style={{
          transform: `rotateY(${-p * 100}deg)`,
          transformOrigin: "0% 50%",
          filter: `brightness(${1 - p * 0.4})`,
          boxShadow: `${20 + p * 40}px 0 60px rgba(0,0,0,${0.35 * p})`,
          opacity: p > 0.92 ? 0 : 1,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Hard cut through a short black-paper flash, for punch scenes. */
const StampCut: Comp = ({ children, presentationDirection, presentationProgress }) => {
  const p = presentationProgress;
  if (presentationDirection === "exiting") return <AbsoluteFill style={{ opacity: p < 0.4 ? 1 : 0 }}>{children}</AbsoluteFill>;
  const flash = p > 0.35 && p < 0.65 ? 1 : 0;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: p >= 0.65 ? 1 : 0 }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ background: "#1C1B19", opacity: flash }} />
    </AbsoluteFill>
  );
};

/** Push into the previous scene's focal point, then the next scene settles in from slightly large. */
const ZoomThrough: Comp = ({ children, presentationDirection, presentationProgress }) => {
  const p = ease(presentationProgress);
  if (presentationDirection === "exiting") {
    return (
      <AbsoluteFill style={{ transform: `scale(${1 + p * 3})`, transformOrigin: "62% 52%", opacity: 1 - p }}>
        {children}
      </AbsoluteFill>
    );
  }
  return <AbsoluteFill style={{ transform: `scale(${1.25 - 0.25 * p})`, opacity: p }}>{children}</AbsoluteFill>;
};

const make = (component: Comp): TransitionPresentation<NoProps> => ({ component, props: {} as NoProps });

export type TransitionName = "cover" | "tear" | "flip" | "stampCut" | "zoom";

export const TRANSITIONS: Record<TransitionName, { presentation: () => TransitionPresentation<NoProps>; frames: number }> = {
  cover: { presentation: () => make(PaperCover), frames: 10 },
  tear: { presentation: () => make(Tear), frames: 12 },
  flip: { presentation: () => make(PageFlip), frames: 12 },
  stampCut: { presentation: () => make(StampCut), frames: 6 },
  zoom: { presentation: () => make(ZoomThrough), frames: 10 },
};

