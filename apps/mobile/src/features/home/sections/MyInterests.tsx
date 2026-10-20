import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '../../../ui/Text';
import { Plus } from '../../../ui/icons';
import { accent, colors, surface } from '../../../theme';
import { freshCount, keyOf, type Interest, type RecLike } from '../../interests/match';
import { slugOfCategory } from '../../interests/dictionary';
import { loadSearchIndex } from '../../search/searchData';

/**
 * 홈 "내 관심" 줄 — 담은 분야·섹터·화두가 칩으로 나오고, 칩마다 최근 24시간 새 소식 건수가 붙는다. 누르면 그 관심의 소식 목록(/interest).
 * 아직 안 담았으면 담기를 권하는 카드 하나만 보인다. 건수는 검색 목록(/api/search-index)으로 센다.
 */
export function MyInterests({ items, onAdd }: { items: Interest[]; onAdd: () => void }) {
  const router = useRouter();
  const [recs, setRecs] = useState<RecLike[] | null>(null);
  useEffect(() => {
    loadSearchIndex().then((r) => setRecs(r as unknown as RecLike[]), () => setRecs([]));
  }, []);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    if (recs) for (const it of items) m.set(keyOf(it), freshCount(it, recs, (c) => slugOfCategory(c)));
    return m;
  }, [items, recs]);

  if (items.length === 0) {
    return (
      <Pressable style={({ pressed }) => [styles.empty, pressed && { opacity: 0.9 }]} onPress={onAdd} accessibilityRole="button">
        <View style={styles.plusBig}>
          <Plus size={20} color="#fff" weight="bold" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.emptyTitle}>관심 있는 분야·주제를 담아 보세요</Text>
          <Text style={styles.emptySub}>금리, 반도체, 부동산… 담으면 새 소식을 먼저 모아 드려요</Text>
        </View>
      </Pressable>
    );
  }
  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.title}>내 관심</Text>
        <Pressable onPress={onAdd} hitSlop={8} accessibilityRole="button" accessibilityLabel="관심 담기·편집">
          <Text style={styles.edit}>편집</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
        {items.map((it) => {
          const n = counts.get(keyOf(it)) ?? 0;
          return (
            <Pressable
              key={keyOf(it)}
              onPress={() => router.push({ pathname: '/interest', params: { type: it.type, id: it.key, label: it.label } })}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.85 }]}
              accessibilityRole="link"
              accessibilityLabel={`${it.label}, 새 소식 ${n}건`}
            >
              <Text style={styles.chipText}>{it.label}</Text>
              {n > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{n}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        <Pressable onPress={onAdd} style={styles.add} accessibilityRole="button" accessibilityLabel="관심 담기">
          <Plus size={16} color={accent.ink} weight="bold" />
          <Text style={styles.addText}>담기</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  edit: { fontSize: 13.5, fontWeight: '700', color: colors.textFaint },
  scroll: { marginHorizontal: -20 },
  row: { paddingHorizontal: 20, gap: 8 },
  chip: { ...surface.card, flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 16, borderRadius: 999 },
  chipText: { fontSize: 15, fontWeight: '800', color: colors.text },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: accent.main, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 46, paddingHorizontal: 16, borderRadius: 999, backgroundColor: accent.soft },
  addText: { fontSize: 14.5, fontWeight: '800', color: accent.ink },
  empty: { ...surface.card, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  plusBig: { width: 44, height: 44, borderRadius: 22, backgroundColor: accent.main, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  emptySub: { marginTop: 3, fontSize: 13, lineHeight: 19, color: colors.textMuted },
});
