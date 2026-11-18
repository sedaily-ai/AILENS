import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { fitText } from "@remotion/layout-utils";
import { FONT } from "../prism/theme";

// 다큐 해설형(DOC) 디자인 시스템 — 차콜 단색 바탕, 흰 글자, 강조색은 한 장면에 하나.
// 종이 질감·테이프·핀·섹션 번호·하단 자막 박스는 쓰지 않는다(템플릿 느낌을 줄이기 위해).
export const W = 1920;
export const H = 1080;
export const M = 120; // 좌우 여백

export const C = {
  bg0: "#171921",
  bg1: "#0A0B0E",
  text: "#F4F1EA",
  muted: "#8D93A0",
  accent: "#F7C531",
  line: "rgba(244,241,234,0.22)",
};

// 튀지 않는 감속 곡선(되튐 없음).
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const enter = (frame: number, delay = 0, dur = 20) =>
  interpolate(frame, [delay, delay + dur], [0, 1], { easing: EASE, extrapolateLeft: "clamp", extrapolateRight: "clamp" });

/** 박스 폭에 맞는 글자 크기를 측정해 그린다(max로 상한). 글자 크기를 눈대중이 아니라 규칙으로 정한다. */
export const fitSize = (text: string, width: number, max = 200, upper = true): number =>
  Math.min(max, fitText({ text, withinWidth: width, fontFamily: FONT.display, textTransform: upper ? "uppercase" : "none" }).fontSize);

export const FitLine: React.FC<{
  text: string;
  width: number;
  max?: number;
  color?: string;
  delay?: number;
  align?: "left" | "center";
  upper?: boolean;
  lineHeight?: number;
  size?: number; // 지정하면 측정 대신 이 크기를 쓴다(여러 항목의 글자 크기를 맞출 때)
}> = ({ text, width, max = 200, color = C.text, delay = 0, align = "left", upper = true, lineHeight = 1.0, size: forced }) => {
  const frame = useCurrentFrame();
  const t = enter(frame, delay);
  const { fontSize } = fitText({
    text,
    withinWidth: width,
    fontFamily: FONT.display,
    textTransform: upper ? "uppercase" : "none",
  });
  const size = forced ?? Math.min(max, fontSize);
  return (
    <div
      style={{
        fontFamily: FONT.display,
        fontSize: size,
        lineHeight,
        color,
        textTransform: upper ? "uppercase" : "none",
        textAlign: align,
        whiteSpace: "nowrap",
        opacity: t,
        transform: `translateY(${(1 - t) * 28}px)`,
      }}
    >
      {text}
    </div>
  );
};

export const Small: React.FC<{ text: string; color?: string; size?: number; delay?: number; upper?: boolean; spacing?: string; weight?: number }> = ({
  text,
  color = C.muted,
  size = 40,
  delay = 0,
  upper = false,
  spacing = "0.01em",
  weight = 700,
}) => {
  const frame = useCurrentFrame();
  const t = enter(frame, delay);
  return (
    <div
      style={{
        fontFamily: FONT.body,
        fontWeight: weight,
        fontSize: size,
        color,
        letterSpacing: spacing,
        textTransform: upper ? "uppercase" : "none",
        opacity: t,
        transform: `translateY(${(1 - t) * 16}px)`,
      }}
    >
      {text}
    </div>
  );
};
