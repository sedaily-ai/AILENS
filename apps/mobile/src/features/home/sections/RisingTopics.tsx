import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '../../../ui/Text';
import { Spark } from '../../../ui/Spark';
import { CaretRight, TrendUp } from '../../../ui/icons';
import { accent, colors } from '../../../theme';
import { useRisingTopics } from '../../interests/useTrends';
import { topicIcon } from '../../interests/topicIcons';

/**
 * "요즘 많이 나오는 이야기" — 최근 3일 기사에 자주 나온 주제와 7일 추이. 기준은 우리 기사에 나온 빈도이고 독자 조회가 아니다.
 * 급상승(직전 대비 크게 늘어남)에는 파랑 알약을 붙이고, 누르면 그 주제의 소식 목록으로 간다.
 */
export function RisingTopics() {
  const router = useRouter();
  const { trends, loading } = useRisingTopics(5);
  if (!loading && trends.length === 0) return null;
  if (loading) return <View style={styles.skeleton} />;
  return (
    <View>
      {trends.map((t, i) => {
        const Icon = topicIcon(t.it.label, t.it.category);
        return (
          <Pressable
            key={t.it.key}
            onPress={() => router.push({ pathname: '/interest', params: { type: t.it.type, id: t.it.key, label: t.it.label } })}
            style={({ pressed }) => [styles.row, i > 0 && styles.rule, pressed && { backgroundColor: '#f7f9fc' }]}
            accessibilityRole="link"
            accessibilityLabel={`${t.it.label}, 최근 3일 ${t.recent}건${t.kind === 'rising' ? ', 급상승' : ''}`}
          >
            <Text style={styles.rank}>{i + 1}</Text>
            <View style={styles.icon}>
              <Icon size={18} color={colors.textSub} weight="regular" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{t.it.label}</Text>
                {t.kind === 'rising' ? (
                  <View style={styles.badge}>
                    <TrendUp size={11} color={accent.ink} weight="bold" />
                    <Text style={styles.badgeText}>급상승</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.sub}>최근 3일 {t.recent}건</Text>
            </View>
            <Spark values={t.spark} />
            <CaretRight size={14} color={colors.textFaint} weight="bold" />
          </Pressable>
        );
      })}
      <Text style={styles.note}>우리 기사에 많이 나온 이야기예요. 조회수 순위는 아니에요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { height: 220, borderRadius: 16, backgroundColor: '#f4f6f9' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e6eaf1' },
  rank: { width: 16, textAlign: 'center', fontSize: 14, fontWeight: '800', color: accent.main },
  icon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#f4f6f9', alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 15.5, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, height: 20, borderRadius: 10, backgroundColor: accent.soft },
  badgeText: { fontSize: 11, fontWeight: '800', color: accent.ink },
  sub: { marginTop: 2, fontSize: 12.5, color: colors.textMuted },
  note: { marginTop: 10, fontSize: 12, color: colors.textFaint },
});
