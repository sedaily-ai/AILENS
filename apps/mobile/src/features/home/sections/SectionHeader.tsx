import { StyleSheet, View } from 'react-native';
import { Text } from '../../../ui/Text';
import { CaretRight } from '../../../ui/icons';
import { colors } from '../../../theme';

/** 섹션 공통 머리 — 큰 굵은 제목 + 오른쪽 "전체 보기 >". 오른쪽 문구 끝의 화살표 글자(→)는 아이콘으로 바꿔 그린다. */
export function SectionHeader({ title, right, accent }: { title: string; right?: string; accent?: string }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.title, accent ? { color: accent } : null]}>{title}</Text>
      {right ? (
        <View style={styles.more}>
          <Text style={styles.right}>{right.replace(/\s*→\s*$/, '')}</Text>
          <CaretRight size={13} color={colors.textFaint} weight="bold" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  right: { fontSize: 13.5, fontWeight: '600', color: colors.textFaint },
});
