import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ECON_CATEGORIES, econSubcategoriesFor, type SearchRecord } from '@ailens/domain';
import { AppHeader } from '../../components/AppHeader';
import { CategoryChips } from '../../components/CategoryChips';
import { GridCard } from '../../components/GridCard';
import { MiniPlayer } from '../../components/MiniPlayer';
import { colors } from '../../theme';
import type { FeedItem } from '../home/model';
import { loadSearchIndex } from '../search/searchData';

const PAGE = 20;

const toFeed = (r: SearchRecord): FeedItem => ({ id: r.i, title: r.h, excerpt: r.s, category: r.c, publishedAt: r.t || null, date: r.d, imageUrl: r.p || null });

/**
 * 카테고리 목록 — 웹 /{카테고리} 대응. 검색과 같은 가벼운 전체 목록(/api/search-index)에서 이 분류의 글을 최신순으로 20건씩 이어 붙이고,
 * 하위 분류(예: 시그널 → 국내증시/해외증시/IB&Deal)가 있으면 칩으로 거른다. 옛 이름('증시' 등)은 서버가 새 이름으로 맞춰 내려준다.
 */
export function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const category = ECON_CATEGORIES.find((c) => c.slug === slug);
  const subs = econSubcategoriesFor(slug);
  const [all, setAll] = useState<SearchRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sub, setSub] = useState('');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    setAll(null);
    setFailed(false);
    loadSearchIndex().then(setAll, () => setFailed(true));
  }, [slug]);
  useEffect(() => {
    setSub('');
    setLimit(PAGE);
  }, [slug]);

  const inCategory = useMemo(
    () => (all && category ? all.filter((r) => r.c === category.label).sort((a, b) => (b.t || b.d).localeCompare(a.t || a.d)) : []),
    [all, category],
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of inCategory) if (r.u) m.set(r.u, (m.get(r.u) ?? 0) + 1);
    return m;
  }, [inCategory]);
  const items = useMemo(() => (sub ? inCategory.filter((r) => r.u === sub) : inCategory), [inCategory, sub]);
  const shown = items.slice(0, limit);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader />
      <CategoryChips active={slug} />
      <View style={styles.body}>
        {failed ? (
          <View style={styles.center}>
            <Text style={styles.msg}>목록을 불러오지 못했어요.</Text>
            <Pressable style={styles.btn} onPress={() => { setFailed(false); setAll(null); loadSearchIndex().then(setAll, () => setFailed(true)); }} accessibilityRole="button">
              <Text style={styles.btnText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : all === null ? (
          <View style={styles.center}><ActivityIndicator color="#2563eb" /></View>
        ) : (
          <FlatList
            data={Array.from({ length: Math.ceil(shown.length / 2) }, (_, i) => shown.slice(i * 2, i * 2 + 2))}
            keyExtractor={(row) => row[0].i}
            contentContainerStyle={styles.list}
            onEndReachedThreshold={0.5}
            onEndReached={() => setLimit((n) => (n < items.length ? n + PAGE : n))}
            ListHeaderComponent={
              <View style={styles.head}>
                <Text style={[styles.title, category && { color: category.accent }]}>{category?.label ?? '카테고리'}</Text>
                {category ? <Text style={styles.desc}>{category.description}</Text> : null}
                {subs.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subRow}>
                    <Sub label={`전체 ${inCategory.length}`} on={sub === ''} onPress={() => { setSub(''); setLimit(PAGE); }} />
                    {subs.filter((s) => counts.get(s)).map((s) => (
                      <Sub key={s} label={`${s} ${counts.get(s)}`} on={sub === s} onPress={() => { setSub(s); setLimit(PAGE); }} />
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            }
            ListEmptyComponent={<Text style={styles.empty}>아직 올라온 글이 없어요.</Text>}
            renderItem={({ item: row }) => (
              <View style={styles.row}>
                {row.map((r) => <GridCard key={r.i} item={toFeed(r)} />)}
                {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
              </View>
            )}
          />
        )}
      </View>
      <MiniPlayer />
    </SafeAreaView>
  );
}

function Sub({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.sub, on && styles.subOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.subText, on && styles.subTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  list: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  row: { flexDirection: 'row', gap: 16, marginBottom: 28 },
  head: { marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  desc: { marginTop: 6, fontSize: 13.5, lineHeight: 20, color: colors.textMuted },
  subRow: { gap: 8, paddingTop: 16 },
  sub: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
  subOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  subText: { fontSize: 13, fontWeight: '600', color: colors.textSub },
  subTextOn: { color: '#fff', fontWeight: '700' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  msg: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  btn: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f3f4f6' },
  btnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
