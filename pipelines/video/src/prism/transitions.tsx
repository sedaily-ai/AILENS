import React from "react";
import { AbsoluteFill, random } from "remotion";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { H, W } from "./theme";

// PRISM 종이 전환(2026-10-29) — 셰이더 없이 CSS만 써서 Lambda·로컬 어디서나 같게 그린다.
// TransitionSeries는 나가는 장면 → 들어오는 장면 순으로 그리므로, 나가는 장면이 위에 와야 하는 전환(페이지 넘기기)은 zIndex로 올린다.

type Kind = "cover" | "tear" | "pageTurn" | "zoom" | "stampCut" | "tapePeel";
type Props = { kind: Kind; seed: string };

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

const PaperTransition: React.FC<TransitionPresentationComponentProps<Props>> = ({ children, presentationDirection, presentationProgress, passedProps }) => {
  const t = ease(presentationProgress);
  const entering = presentationDirection === "entering";
  const { kind, seed } = passedProps;
  // 나가는 장면은 전환 구간 밖(진행 0)에서도 이 컴포넌트로 감싸져 그려진다(Remotion Lambda 렌더에서 확인 — 테이프 조각이
  // 컷 내내 보였다). 전환 전에는 장식·그림자 없이 장면만 그린다.
  if (!entering && presentationProgress <= 0) return <AbsoluteFill>{children}</AbsoluteFill>;

  if (kind === "cover") {
    // 종이 덮기 — 새 종이가 아래에서 비스듬히 올라와 덮는다.
    if (!entering) return <AbsoluteFill style={{ filter: `brightness(${1 - t * 0.25})` }}>{children}</AbsoluteFill>;
    return (
      <AbsoluteFill style={{ transform: `translateY(${(1 - t) * H}px) rotate(${(1 - t) * 4}deg)`, transformOrigin: "left bottom", boxShadow: "0 -12px 30px rgba(0,0,0,0.3)" }}>
        {children}
      </AbsoluteFill>
    );
  }
  if (kind === "tear") {
    // 찢기 — 들쭉날쭉한 찢어진 경계가 왼쪽에서 오른쪽으로 지나가며 새 장면을 드러낸다.
    if (!entering) return <AbsoluteFill>{children}</AbsoluteFill>;
    const x = t * (W + 160) - 80;
    const pts: string[] = ["0px 0px"];
    const steps = 24;
    for (let i = 0; i <= steps; i++) pts.push(`${x + (random(`${seed}-tear-${i}`) - 0.5) * 70}px ${(H / steps) * i}px`);
    pts.push(`0px ${H}px`);
    return <AbsoluteFill style={{ clipPath: `polygon(${pts.join(",")})` }}>{children}</AbsoluteFill>;
  }
  if (kind === "pageTurn") {
    // 페이지 넘기기 — 나가는 장면이 왼쪽 모서리를 축으로 넘어가며 그늘이 진다.
    if (entering) return <AbsoluteFill style={{ filter: `brightness(${0.75 + t * 0.25})` }}>{children}</AbsoluteFill>;
    return (
      <AbsoluteFill style={{ zIndex: 2, perspective: 2400 }}>
        <AbsoluteFill style={{ transformOrigin: "left center", transform: `rotateY(${-t * 100}deg)`, boxShadow: `${20 + t * 40}px 0 40px rgba(0,0,0,${0.35 * (1 - t)})`, backfaceVisibility: "hidden" }}>
          {children}
          <AbsoluteFill style={{ background: `linear-gradient(90deg, rgba(0,0,0,0) 40%, rgba(0,0,0,${t * 0.35}) 100%)` }} />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  if (kind === "tapePeel") {
    // 테이프 떼기 — 오른쪽 위 테이프가 떨어져 나가면, 왼쪽 위 한 귀퉁이에 매달린 종이가 아래로 휙 떨어진다.
    if (entering) return <AbsoluteFill style={{ filter: `brightness(${0.8 + t * 0.2})` }}>{children}</AbsoluteFill>;
    const fall = Math.max(0, (presentationProgress - 0.25) / 0.75);
    return (
      <AbsoluteFill style={{ zIndex: 2 }}>
        <AbsoluteFill style={{ transformOrigin: "left top", transform: `rotate(${ease(fall) * 38}deg) translateY(${Math.pow(fall, 2) * H * 1.1}px)`, boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}>
          {children}
          <div style={{ position: "absolute", left: 40, top: -10, width: 150, height: 44, background: "rgba(240,226,180,0.9)", transform: "rotate(-8deg)" }} />
        </AbsoluteFill>
        <div
          style={{
            position: "absolute",
            right: 40,
            top: -10,
            width: 150,
            height: 44,
            background: "rgba(240,226,180,0.9)",
            transformOrigin: "right top",
            transform: `rotate(${8 + t * 50}deg) translate(${t * 120}px, ${-t * 160}px)`,
            opacity: 1 - t,
          }}
        />
      </AbsoluteFill>
    );
  }
  if (kind === "zoom") {
    // 줌 스루 — 나가는 장면 안으로 들어가듯 커지며 사라지고, 새 장면이 살짝 작게 시작해 자리를 잡는다.
    if (!entering) return <AbsoluteFill style={{ transform: `scale(${1 + t * 0.6})`, opacity: 1 - t }}>{children}</AbsoluteFill>;
    return <AbsoluteFill style={{ transform: `scale(${0.86 + t * 0.14})`, opacity: Math.min(1, t * 1.6) }}>{children}</AbsoluteFill>;
  }
  // stampCut — 새 장면이 도장처럼 쾅 찍힌다(1.12배 → 1.0, 처음 몇 프레임 흰 번쩍).
  if (!entering) return <AbsoluteFill>{children}</AbsoluteFill>;
  return (
    <AbsoluteFill style={{ transform: `scale(${1.12 - t * 0.12})`, opacity: Math.min(1, presentationProgress * 4) }}>
      {children}
      <AbsoluteFill style={{ background: "#fff", opacity: Math.max(0, 0.5 - presentationProgress * 1.5) }} />
    </AbsoluteFill>
  );
};

export const paperTransition = (kind: Kind, seed: string): TransitionPresentation<Props> => ({ component: PaperTransition, props: { kind, seed } });
