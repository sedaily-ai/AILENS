import type { ReactNode } from 'react';
import { View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

/**
 * 부모의 좌우 패딩을 무시하고 화면 폭 전체를 쓰는 블록(사진·영상·웹툰 컷).
 * 음수 마진(marginHorizontal: -20)은 안드로이드에서 aspectRatio 와 만나면 폭이 늘지 않고 왼쪽으로만 밀려 "왼쪽으로 쏠리는" 문제가 생긴다.
 * 그래서 폭을 화면 폭으로 못 박고 alignSelf: 'center' 로 부모 중앙에 둔다(양쪽으로 같게 넘친다).
 */
export function FullBleed({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { width } = useWindowDimensions();
  return <View style={[{ width, alignSelf: 'center' }, style]}>{children}</View>;
}
