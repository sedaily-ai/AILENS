import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

/**
 * 바로가기용 아이콘(자체 제작 SVG). 연한 회색 타일 위에 잉크색 선 아이콘을 두고, 형식마다 정해진 색(theme.formatColors)을
 * 아이콘 한 군데에만 포인트로 쓴다 — 읽기=보라, 웹툰=분홍, 듣기=초록, 영상=주황, 타임머신=파랑, 게임=하늘.
 * 색 면을 크게 쓰지 않고 선의 굵기와 비례로 완성도를 내는 절제된 에디토리얼 톤이다. 64×64 좌표계.
 */
export type IllustKind = 'read' | 'webtoon' | 'listen' | 'video' | 'time' | 'game';

const ACCENT: Record<IllustKind, string> = {
  read: '#7c3aed',
  webtoon: '#e11d48',
  listen: '#059669',
  video: '#d97706',
  time: '#2563eb',
  game: '#0891b2',
};
const INK = '#1f2937';
const TILE = '#f3f5f9';
const SW = 2.4;

export function IllustIcon({ kind, size = 64 }: { kind: IllustKind; size?: number }) {
  const a = ACCENT[kind];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.34, backgroundColor: TILE, overflow: 'hidden' }}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <G fill="none" stroke={INK} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <Glyph kind={kind} a={a} />
        </G>
      </Svg>
    </View>
  );
}

function Glyph({ kind, a }: { kind: IllustKind; a: string }) {
  switch (kind) {
    case 'read':
      return (
        <>
          <Path d="M32 20 C26 16 18 16 12 18 V45 C18 43 26 43 32 47 C38 43 46 43 52 45 V18 C46 16 38 16 32 20 Z" />
          <Path d="M32 20 V47" />
          <Path d="M18 25 H26 M18 31 H26" stroke={a} />
          <Path d="M38 25 H46 M38 31 H43" strokeOpacity={0.35} />
        </>
      );
    case 'webtoon':
      return (
        <>
          <Rect x="12" y="13" width="40" height="19" rx="4.5" />
          <Rect x="12" y="36" width="18" height="15" rx="4.5" />
          <Rect x="34" y="36" width="18" height="15" rx="4.5" />
          <Path d="M24 22.5 H40" stroke={a} />
          <Circle cx="43" cy="43.5" r="1.4" fill={a} stroke="none" />
          <Circle cx="38" cy="43.5" r="1.4" fill={a} stroke="none" />
        </>
      );
    case 'listen':
      return (
        <>
          <Path d="M14 36 V32 A18 18 0 0 1 50 32 V36" />
          <Rect x="11" y="35" width="10" height="16" rx="5" />
          <Rect x="43" y="35" width="10" height="16" rx="5" />
          <Path d="M28 38 V46 M32 34 V50 M36 38 V46" stroke={a} />
        </>
      );
    case 'video':
      return (
        <>
          <Rect x="11" y="16" width="42" height="32" rx="8" />
          <Path d="M28 26 L40 32 L28 38 Z" fill={a} stroke={a} />
          <Path d="M20 53 H44" strokeOpacity={0.35} />
        </>
      );
    case 'time':
      return (
        <>
          <Circle cx="32" cy="32" r="19" />
          <Path d="M32 21 V32 L39 36" stroke={a} />
          <Path d="M32 13 V15 M32 49 V51 M13 32 H15 M49 32 H51" strokeOpacity={0.35} />
        </>
      );
    case 'game':
      return (
        <>
          <Path d="M17 23 H47 A9 9 0 0 1 55 32 L53 43 A6 6 0 0 1 44 45 L40 40 H24 L20 45 A6 6 0 0 1 11 43 L9 32 A9 9 0 0 1 17 23 Z" />
          <Path d="M21 29 V37 M17 33 H25" stroke={a} />
          <Circle cx="43" cy="31" r="1.9" fill={a} stroke="none" />
          <Circle cx="48" cy="35" r="1.9" fill={a} stroke="none" />
        </>
      );
  }
}
