import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '../../ui/Text';
import { Spark } from '../../ui/Spark';
import { CaretRight, TrendDown, TrendUp } from '../../ui/icons';
import { accent, colors, surface } from '../../theme';
import { slugOfCategory } from '../interests/dictionary';
import { keyOf, type RecLike } from '../interests/match';
import { useInterestItems } from '../interests/store';
import { weekly } from '../interests/trend';
import { loadSearchIndex } from '../search/searchData';

/**
 * 나의 LENS "내 관심의 흐름" — 내가 담은 주제별로 이번 주(최근 7일)에 기사가 얼마나 나왔는지, 지난주와 비교해 늘었는지와 일별 추이.
 * 담은 주제가 없으면 안내 한 줄만 보인다. 기준은 우리 기사에 나온 빈도다.
 */
export function InterestFlow() {
  const router = useRouter();
  const { items } = useInterestItems();
  const [recs, setRecs] = useState<RecLike[] | null>(null);
  useEffect(() => {
    loadSearchIndex().then((r) => setRecs(r as unknown as RecLike[]), () => setRecs([]));
  }, []);
  const rows = useMemo(() => {
    if (!recs) return [];
    return items
      .map((it) => ({ it, ...weekly(it, recs, (c) => slugOfCategory(c)) }))
      .sort((a, b) => b.thisWeek - a.thisWeek)
      .slice(0, 6);
  }, [items, recs]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>내 관심의 흐름</Text>
      {items.length === 0 ? (
        <Text style={styles.empty}>관심 주제를 담으면 요즘 얼마나 다뤄지는지 여기서 볼 수 있어요.</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>흐름을 불러오는 중이에요…</Text>
      ) : (
        rows.map((r, i) => {
          const diff = r.thisWeek - r.lastWeek;
          const Up = diff >= 0 ? TrendUp : TrendDown;
          return (
            <Pressable
              key={keyOf(r.it)}
              onPress={() => router.push({ pathname: '/interest', params: { type: r.it.type, id: r.it.key, label: r.it.label } })}
              style={[styles.row, i > 0 && styles.rule]}
              accessibilityRole="link"
              accessibilityLabel={`${r.it.label}, 이번 주 ${r.thisWeek}건, 지난주보다 ${diff >= 0 ? '+' : ''}${diff}건`}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{r.it.label}</Text>
                <View style={styles.meta}>
                  <Text style={styles.count}>이번 주 {r.thisWeek}건</Text>
                  {diff !== 0 ? (
                    <View style={[styles.delta, diff > 0 ? styles.up : styles.down]}>
                      <Up size={11} color={diff > 0 ? accent.ink : colors.textMuted} weight="bold" />
                      <Text style={[styles.deltaText, diff > 0 ? { color: accent.ink } : { color: colors.textMuted }]}>{diff > 0 ? `+${diff}` : diff}</Text>
                    </View>
                  ) : (
                    <Text style={styles.same}>지난주와 같아요</Text>
                  )}
                </View>
              </View>
              <Spark values={r.spark} />
              <CaretRight size={14} color={colors.textFaint} weight="bold" />
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...surface.card, marginHorizontal: 20, marginTop: 14, padding: 16 },
  title: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3, color: colors.text, marginBottom: 4 },
  empty: { marginTop: 6, fontSize: 14, lineHeight: 21, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e6eaf1' },
  name: { fontSize: 15, fontWeight: '800', color: colors.text },
  meta: { marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { fontSize: 12.5, color: colors.textMuted },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, height: 20, borderRadius: 10 },
  up: { backgroundColor: accent.soft },
  down: { backgroundColor: '#f1f3f6' },
  deltaText: { fontSize: 11.5, fontWeight: '800' },
  same: { fontSize: 12, color: colors.textFaint },
});
