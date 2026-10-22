import { StyleSheet, View } from 'react-native';
import { accent } from '../theme';

/** 작은 막대 추이(스파크라인). 가장 큰 값을 100%로 맞추고, 마지막(오늘) 막대만 진하게 칠한다. 값이 모두 0이면 바닥 막대만 보인다. */
export function Spark({ values, height = 28, bar = 5, gap = 3, color = accent.main }: { values: number[]; height?: number; bar?: number; gap?: number; color?: string }) {
  const max = Math.max(1, ...values);
  return (
    <View style={[styles.row, { height, gap }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {values.map((v, i) => {
        const last = i === values.length - 1;
        return <View key={i} style={{ width: bar, height: Math.max(3, Math.round((v / max) * height)), borderRadius: bar / 2, backgroundColor: last ? color : `${color}55` }} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'flex-end' } });
