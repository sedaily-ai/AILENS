import Svg, { Circle, ClipPath, Defs, G, Line, Rect } from 'react-native-svg';

/** 앱 아이콘과 같은 4색 원 마크(웹 icon.svg 와 같은 값). 로고 글자 앞에 작게 둔다. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <ClipPath id="bm">
          <Circle cx="32" cy="32" r="30" />
        </ClipPath>
      </Defs>
      <G clipPath="url(#bm)">
        <Rect x="0" y="0" width="32" height="32" fill="#3B82F6" />
        <Rect x="32" y="0" width="32" height="32" fill="#EF4444" />
        <Rect x="0" y="32" width="32" height="32" fill="#10B981" />
        <Rect x="32" y="32" width="32" height="32" fill="#F59E0B" />
      </G>
      <Line x1="32" y1="2" x2="32" y2="62" stroke="#fff" strokeWidth={4.5} />
      <Line x1="2" y1="32" x2="62" y2="32" stroke="#fff" strokeWidth={4.5} />
    </Svg>
  );
}
