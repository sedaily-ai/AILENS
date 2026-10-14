import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme';

/** 섹션 공통 헤더 — 웹의 얇은 eyebrow(작은 대문자 라벨) + 우측 보조 문구. */
export function SectionHeader({ title, right, accent }: { title: string; right?: string; accent?: string }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.title, accent ? { color: accent } : null]}>{title}</Text>
      {right ? <Text style={styles.right}>{right}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 13, fontWeight: '800', letterSpacing: 1.2, color: colors.text },
  right: { fontSize: 13, fontWeight: '600', color: colors.textFaint },
});
