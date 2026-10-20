import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * 바로가기용 일러스트 아이콘(자체 제작 SVG). 연한 색 타일 위에 그라데이션 면과 흰 하이라이트를 겹친 입체 플랫 스타일이다.
 * 색은 앱 전체에서 형식마다 정해진 색(theme.formatColors)과 같다 — 읽기=보라, 웹툰=분홍, 듣기=초록, 영상=주황.
 * 그 밖에 타임머신(남색)·게임(하늘색)을 더했다. 64×64 좌표계로 그린다.
 */
export type IllustKind = 'read' | 'webtoon' | 'listen' | 'video' | 'time' | 'game';

const TONES: Record<IllustKind, { from: string; to: string; tileFrom: string; tileTo: string; soft: string }> = {
  read: { from: '#a78bfa', to: '#6d28d9', tileFrom: '#f3efff', tileTo: '#e4dcff', soft: '#ddd3ff' },
  webtoon: { from: '#fb7185', to: '#e11d48', tileFrom: '#fff0f2', tileTo: '#ffdfe4', soft: '#ffc2cc' },
  listen: { from: '#34d399', to: '#059669', tileFrom: '#e9faf2', tileTo: '#d3f3e4', soft: '#b3ecd0' },
  video: { from: '#fbbf24', to: '#d97706', tileFrom: '#fff6e3', tileTo: '#ffe9c2', soft: '#ffd98a' },
  time: { from: '#60a5fa', to: '#1d4ed8', tileFrom: '#ebf3ff', tileTo: '#d6e6ff', soft: '#bcd6ff' },
  game: { from: '#22d3ee', to: '#0e7490', tileFrom: '#e5f9fd', tileTo: '#c9f0f8', soft: '#a5e6f3' },
};

export function IllustIcon({ kind, size = 64 }: { kind: IllustKind; size?: number }) {
  const t = TONES[kind];
  const id = `g-${kind}`;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.31, overflow: 'hidden' }}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Defs>
          <LinearGradient id={`${id}-tile`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.tileFrom} />
            <Stop offset="1" stopColor={t.tileTo} />
          </LinearGradient>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={t.from} />
            <Stop offset="1" stopColor={t.to} />
          </LinearGradient>
        </Defs>
        <Rect width="64" height="64" fill={`url(#${id}-tile)`} />
        <Glyph kind={kind} fill={`url(#${id})`} soft={t.soft} />
      </Svg>
    </View>
  );
}

function Glyph({ kind, fill, soft }: { kind: IllustKind; fill: string; soft: string }) {
  switch (kind) {
    case 'read':
      return (
        <G>
          <Ellipse cx="32" cy="51" rx="19" ry="3" fill="#1f2937" opacity={0.08} />
          <Path d="M9 17 Q20 12 31 18 V47 Q20 42 9 46 Z" fill="#ffffff" />
          <Path d="M55 17 Q44 12 33 18 V47 Q44 42 55 46 Z" fill={fill} />
          <Path d="M14 24 Q20 22 26 24 M14 30 Q20 28 26 30 M14 36 Q20 34 26 36" stroke={soft} strokeWidth={2.4} strokeLinecap="round" fill="none" />
          <Path d="M38 25 Q44 23 50 25 M38 31 Q44 29 50 31" stroke="#ffffff" strokeOpacity={0.75} strokeWidth={2.4} strokeLinecap="round" fill="none" />
          <Path d="M31 18 V47 H33 V18 Z" fill="#000000" opacity={0.12} />
        </G>
      );
    case 'webtoon':
      return (
        <G>
          <Rect x="9" y="11" width="31" height="27" rx="7" fill={soft} />
          <Rect x="21" y="22" width="34" height="31" rx="8" fill={fill} />
          <Path d="M27 26 H49" stroke="#ffffff" strokeOpacity={0.5} strokeWidth={2.4} strokeLinecap="round" />
          <Ellipse cx="38" cy="39" rx="10.5" ry="7" fill="#ffffff" />
          <Path d="M31 44 L28 50 L36 45 Z" fill="#ffffff" />
          <Circle cx="33.5" cy="39" r="1.7" fill="#e11d48" />
          <Circle cx="38" cy="39" r="1.7" fill="#e11d48" />
          <Circle cx="42.5" cy="39" r="1.7" fill="#e11d48" />
        </G>
      );
    case 'listen':
      return (
        <G>
          <Ellipse cx="32" cy="53" rx="18" ry="3" fill="#1f2937" opacity={0.08} />
          <Path d="M14 38 V32 A18 18 0 0 1 50 32 V38" stroke={fill} strokeWidth={6} strokeLinecap="round" fill="none" />
          <Rect x="9" y="34" width="13" height="19" rx="6.5" fill={fill} />
          <Rect x="42" y="34" width="13" height="19" rx="6.5" fill={fill} />
          <Rect x="12" y="38" width="4" height="9" rx="2" fill="#ffffff" opacity={0.65} />
          <Rect x="45" y="38" width="4" height="9" rx="2" fill="#ffffff" opacity={0.65} />
          <Path d="M27 34 V44 M32 30 V48 M37 34 V44" stroke={soft} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case 'video':
      return (
        <G>
          <Ellipse cx="32" cy="52" rx="19" ry="3" fill="#1f2937" opacity={0.08} />
          <Rect x="9" y="15" width="46" height="33" rx="9" fill={fill} />
          <Rect x="13" y="19" width="38" height="4" rx="2" fill="#ffffff" opacity={0.35} />
          <Path d="M27 26 L42 32 L27 38 Z" fill="#ffffff" stroke="#ffffff" strokeWidth={4} strokeLinejoin="round" />
          <Circle cx="50" cy="12" r="2.5" fill={soft} />
        </G>
      );
    case 'time':
      return (
        <G>
          <Ellipse cx="32" cy="53" rx="17" ry="3" fill="#1f2937" opacity={0.08} />
          <Circle cx="32" cy="32" r="21" fill={fill} />
          <Circle cx="32" cy="32" r="15" fill="#ffffff" />
          <Path d="M32 22 V32 L39 36" stroke={soft === '#bcd6ff' ? '#1d4ed8' : '#1d4ed8'} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d="M11 22 Q8 28 9 34" stroke={soft} strokeWidth={3} strokeLinecap="round" fill="none" />
          <Path d="M8 28 L11 22 L15 27" stroke={soft} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </G>
      );
    case 'game':
      return (
        <G>
          <Ellipse cx="32" cy="51" rx="21" ry="3" fill="#1f2937" opacity={0.08} />
          <Path d="M16 22 H48 A10 10 0 0 1 57 33 L55 44 A6 6 0 0 1 46 47 L42 41 H22 L18 47 A6 6 0 0 1 9 44 L7 33 A10 10 0 0 1 16 22 Z" fill={fill} />
          <Path d="M20 29 V39 M15 34 H25" stroke="#ffffff" strokeWidth={3.4} strokeLinecap="round" />
          <Circle cx="43" cy="30" r="2.8" fill="#ffffff" />
          <Circle cx="49" cy="35" r="2.8" fill="#ffffff" opacity={0.8} />
        </G>
      );
  }
}
