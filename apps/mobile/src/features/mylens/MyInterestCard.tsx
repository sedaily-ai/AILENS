import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '../../ui/Text';
import { Spark } from '../../ui/Spark';
import { CaretRight, Plus, TrendDown, TrendUp } from '../../ui/icons';
import { accent, colors, surface } from '../../theme';
import { labelOfCategory, slugOfCategory } from '../interests/dictionary';
import { keyOf, matches, type Interest, type RecLike } from '../interests/match';
import { toggleInterest, useInterestItems } from '../interests/store';
import { weekly } from '../interests/trend';
import { loadSearchIndex } from '../search/searchData';
import { categoryStats, tendencyLine, type ReadLike } from './insights';

/**
 * 나의 LENS 맨 위 "내 관심" 한 장 — 담은 주제마다 한 줄(이번 주 기사 수·지난주 대비·7일 추이, 오른쪽 아래에 내가 읽은 건수).
 * 읽은 기록(기기)과 기사 흐름(서버 기사)을 한 줄에서 비교하고, 많이 읽었지만 아직 안 담은 분야는 아래 알약으로 바로 담게 한다.
 */
export interface ReadItem extends ReadLike {
  title: string;
}

export function MyInterestCard({ read, onEdit }: { read: ReadItem[]; onEdit: () => void }) {
  const router = useRouter();
  const { items } = useInterestItems();
  const [recs, setRecs] = useState<RecLike[] | null>(null);
  useEffect(() => {
    loadSearchIndex().then((r) => setRecs(r as unknown as RecLike[]), () => setRecs([]));
  }, []);

  const stats = useMemo(() => categoryStats(read, 30), [read]);
  const total = stats.reduce((a, s) => a + s.count, 0);
  const line = tendencyLine(stats, total);

  const rows = useMemo(() => {
    if (!recs) return [];
    const readRecs: RecLike[] = read.map((r) => ({ i: r.id, h: r.title, c: r.category ?? undefined, d: '' }));
    return items
      .map((it) => ({
        it,
        ...weekly(it, recs, (c) => slugOfCategory(c)),
        // 섹터는 읽은 기록에 세부 분류가 없어 읽은 건수를 세지 않는다.
        readN: it.type === 'sub' ? null : readRecs.filter((r) => matches(it, r, (c) => slugOfCategory(c))).length,
      }))
      .sort((a, b) => b.thisWeek - a.thisWeek)
      .slice(0, 5);
  }, [items, recs, read]);

  // 많이 읽었는데 아직 안 담은 분야(최대 2개).
  const suggestions = useMemo(() => {
    const saved = new Set(items.filter((i) => i.type === 'category').map((i) => i.key));
    const out: Interest[] = [];
    for (const s of stats) {
      const slug = slugOfCategory(s.category);
      if (!slug || saved.has(slug) || s.count < 2) continue;
      out.push({ type: 'category', key: slug, label: labelOfCategory(slug) ?? s.category });
      if (out.length >= 2) break;
    }
    return out;
  }, [stats, items]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>내 관심</Text>
        <Pressable onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel="관심 담기·편집">
          <Text style={styles.edit}>편집</Text>
        </Pressable>
      </View>
      {line ? <Text style={styles.line}>{line}</Text> : null}

      {items.length === 0 ? (
        <Pressable onPress={onEdit} style={styles.emptyBtn} accessibilityRole="button">
          <Plus size={16} color="#fff" weight="bold" />
          <Text style={styles.emptyBtnText}>관심 주제 담기</Text>
        </Pressable>
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
              accessibilityLabel={`${r.it.label}, 이번 주 ${r.thisWeek}건, 지난주보다 ${diff >= 0 ? '+' : ''}${diff}건${r.readN ? `, 내가 읽은 ${r.readN}건` : ''}`}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{r.it.label}</Text>
                <View style={styles.meta}>
                  <Text style={styles.count}>이번 주 {r.thisWeek}건</Text>
                  {diff !== 0 ? (
                    <View style={[styles.delta, diff > 0 ? styles.up : styles.down]}>
                      <Up size={11} color={diff > 0 ? accent.ink : colors.textMuted} weight="bold" />
                      <Text style={[styles.deltaText, { color: diff > 0 ? accent.ink : colors.textMuted }]}>{diff > 0 ? `+${diff}` : diff}</Text>
                    </View>
                  ) : null}
                  {r.readN ? <Text style={styles.readN}>· 읽은 {r.readN}</Text> : null}
                </View>
              </View>
              <Spark values={r.spark} />
              <CaretRight size={14} color={colors.textFaint} weight="bold" />
            </Pressable>
          );
        })
      )}

      {suggestions.length > 0 ? (
        <View style={styles.suggest}>
          <Text style={styles.suggestText}>자주 읽으셨어요. 담아 볼까요?</Text>
          <View style={styles.pills}>
            {suggestions.map((s) => (
              <Pressable key={keyOf(s)} onPress={() => void toggleInterest(s)} style={styles.pill} accessibilityRole="button" accessibilityLabel={`${s.label} 담기`}>
                <Plus size={13} color={accent.ink} weight="bold" />
                <Text style={styles.pillText}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...surface.card, borderWidth: 0, marginHorizontal: 20, marginTop: 14, padding: 18, borderRadius: 22 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4, color: colors.text },
  edit: { fontSize: 13.5, fontWeight: '700', color: colors.textMuted },
  line: { marginTop: 6, fontSize: 14, lineHeight: 20, fontWeight: '700', color: accent.ink },
  empty: { marginTop: 10, fontSize: 14, color: colors.textMuted },
  emptyBtn: { marginTop: 12, height: 46, borderRadius: 14, backgroundColor: accent.main, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  emptyBtnText: { fontSize: 14.5, fontWeight: '800', color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e6eaf1' },
  name: { fontSize: 15, fontWeight: '800', color: colors.text },
  meta: { marginTop: 3, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  count: { fontSize: 12.5, color: colors.textMuted },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, height: 20, borderRadius: 10 },
  up: { backgroundColor: accent.soft },
  down: { backgroundColor: '#f1f3f6' },
  deltaText: { fontSize: 11.5, fontWeight: '800' },
  readN: { fontSize: 12.5, fontWeight: '700', color: colors.textSub },
  suggest: { marginTop: 4, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e6eaf1' },
  suggestText: { fontSize: 13, color: colors.textMuted },
  pills: { marginTop: 8, flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 13, borderRadius: 999, backgroundColor: accent.soft },
  pillText: { fontSize: 13.5, fontWeight: '800', color: accent.ink },
});
