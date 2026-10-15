import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * 웹의 "스케치 톤" 요소(손으로 그은 획·살짝 불규칙한 모서리)를 SVG 로 그대로 재현한다.
 * 선 경로는 웹 .rule / .lread-hr / .lread-sign-mark 의 SVG 와 같은 곡선이다(viewBox 700×8, 늘어나게 그림).
 */
const WAVE = 'M2 4.6 C 90 1.8, 170 6.6, 280 3.4 S 450 5.8, 560 3.2 S 650 4.6, 698 3.6';

export function HandLine({ height = 8, color = '#111827', opacity = 0.26, strokeWidth = 1.6, style }: { height?: number; color?: string; opacity?: number; strokeWidth?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ height }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 700 8" preserveAspectRatio="none">
        <Path d={WAVE} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={strokeWidth} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

/** CSS border-radius 의 "가로 4개 / 세로 4개"(좌상·우상·우하·좌하) 표기. 값이 없으면 가로 값을 세로에도 쓴다. */
export type Radii = { h: [number, number, number, number]; v?: [number, number, number, number] };

function blobPath(w: number, h: number, r: Radii): string {
  const hx = r.h;
  const vy = r.v ?? r.h;
  // CSS 와 같이 인접한 반지름의 합이 변을 넘으면 비례해 줄인다.
  const f = Math.min(1, w / (hx[0] + hx[1] || 1), w / (hx[3] + hx[2] || 1), h / (vy[0] + vy[3] || 1), h / (vy[1] + vy[2] || 1));
  const [a, b, c, d] = hx.map((x) => x * f);
  const [e, g, i, j] = vy.map((x) => x * f);
  return `M ${a} 0 H ${w - b} A ${b} ${g} 0 0 1 ${w} ${g} V ${h - i} A ${c} ${i} 0 0 1 ${w - c} ${h} H ${d} A ${d} ${j} 0 0 1 0 ${h - j} V ${e} A ${a} ${e} 0 0 1 ${a} 0 Z`;
}

/** 불규칙한(타원) 모서리를 가진 면. 배경을 SVG 로 그리고 자식은 그 위에 얹는다. 패딩·정렬은 style 로 준다. */
export function Blob({ fill, radii, style, children }: { fill: string; radii: Radii; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View style={style} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 ? (
        <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h} pointerEvents="none">
          <Path d={blobPath(size.w, size.h, radii)} fill={fill} />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}
