import { StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { accent, colors, surface } from '../../theme';
import { activeDaysThisWeek, categoryStats, tendencyLine, type ReadLike } from './insights';

/**
 * 나의 LENS 맨 위 "쌓인 것" — 최근 30일 읽은 글로 만든 관심 지도(분야별 막대)와 성향 한 줄, 이번 주 읽은 날.
 * 모두 이 기기에 쌓인 읽은 기록에서 계산한다. 아직 쌓인 게 적으면 안내 문구만 보여 준다.
 */
export function KnowledgeMap({ items }: { items: ReadLike[] }) {
  const stats = categoryStats(items, 30);
  const total = stats.reduce((a, s) => a + s.count, 0);
  const line = tendencyLine(stats, total);
  const days = activeDaysThisWeek(items);

  if (total === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>쌓이고 있는 나의 관심</Text>
        <Text style={styles.empty}>기사를 읽으면 여기에 내 관심 분야가 차곡차곡 쌓여요.</Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>쌓이고 있는 나의 관심</Text>
        <Text style={styles.meta}>이번 주 {days}일 · 30일간 {total}건</Text>
      </View>
      {line ? <Text style={styles.line}>{line}</Text> : null}
      <View style={styles.bars}>
        {stats.slice(0, 5).map((s) => (
          <View key={s.category} style={styles.row}>
            <Text style={styles.label} numberOfLines={1}>{s.category}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(8, s.ratio * 100)}%` }]} />
            </View>
            <Text style={styles.count}>{s.count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...surface.card, marginHorizontal: 20, marginTop: 14, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  meta: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  line: { marginTop: 8, fontSize: 14.5, lineHeight: 21, fontWeight: '700', color: accent.ink },
  empty: { marginTop: 6, fontSize: 14, lineHeight: 21, color: colors.textMuted },
  bars: { marginTop: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { width: 52, fontSize: 13, fontWeight: '700', color: colors.textSub },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#eef1f6', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: accent.main },
  count: { width: 22, textAlign: 'right', fontSize: 12.5, fontWeight: '800', color: colors.textSub },
});
