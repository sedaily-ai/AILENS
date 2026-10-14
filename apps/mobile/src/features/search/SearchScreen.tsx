import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  DEFAULT_PARAMS,
  MAX_QUERY_LENGTH,
  UNCATEGORIZED,
  ECON_CATEGORIES,
  countByCategory,
  parseTerms,
  search,
  splitHighlight,
  topKeywords,
  type SearchHit,
  type SearchParams,
  type SearchPeriod,
  type SearchRecord,
  type SearchSort,
} from '@ailens/domain';
import { kstDateTime } from '../../lib/format';
import { colors, radius } from '../../theme';
import { addRecentSearch, clearRecentSearches, getRecentSearches, removeRecentSearch } from './recentSearches';
import { loadSearchIndex } from './searchData';

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 250;
const SORTS: Array<[SearchSort, string]> = [['latest', '최신순'], ['relevance', '정확도순']];
const PERIODS: Array<[SearchPeriod, string]> = [['all', '전체'], ['today', '오늘'], ['week', '1주'], ['month', '1달']];
const CATEGORY_ORDER = [...ECON_CATEGORIES.map((c) => c.label), UNCATEGORIZED];

type IndexState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: SearchRecord[] };

/**
 * 검색 — 웹 SearchPage 의 모바일 판. 목록을 한 번 받아 기기에서 바로 거른다(서버 검색 API 없음).
 * 입력은 250ms 디바운스, 엔터·최근 검색어·키워드 탭은 즉시 검색하고 최근 검색어에 저장한다.
 * 범위(제목/요약)·하위 분류 필터는 웹에만 있고 앱은 정렬·기간·분류까지 둔다.
 */
export function SearchScreen() {
  const router = useRouter();
  const { q: initial } = useLocalSearchParams<{ q?: string }>();
  const [input, setInput] = useState(initial ?? '');
  const [query, setQuery] = useState(initial ?? '');
  const [sort, setSort] = useState<SearchSort>(DEFAULT_PARAMS.sort);
  const [period, setPeriod] = useState<SearchPeriod>(DEFAULT_PARAMS.period);
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [index, setIndex] = useState<IndexState>({ status: 'loading' });
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);

  const loadIndex = useCallback(() => {
    setIndex({ status: 'loading' });
    loadSearchIndex().then(
      (items) => setIndex({ status: 'ready', items }),
      () => setIndex({ status: 'error' })
    );
  }, []);

  useEffect(() => {
    loadIndex();
    void getRecentSearches().then(setRecent);
  }, [loadIndex]);

  // 입력 → 디바운스 → 검색어 반영. 검색어가 바뀌면 분류·페이지를 처음으로 되돌린다.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(input.trim());
      setCategory('');
      setLimit(PAGE_SIZE);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input]);

  const commit = useCallback((q: string) => {
    const term = q.trim().slice(0, MAX_QUERY_LENGTH);
    setInput(term);
    setQuery(term);
    setCategory('');
    setLimit(PAGE_SIZE);
    Keyboard.dismiss();
    if (term) void addRecentSearch(term).then(setRecent);
  }, []);

  const items = index.status === 'ready' ? index.items : [];
  const params: SearchParams = useMemo(() => ({ ...DEFAULT_PARAMS, q: query, sort, period, category }), [query, sort, period, category]);
  const terms = useMemo(() => parseTerms(query), [query]);
  const hits = useMemo(() => (query ? search(items, params) : []), [items, params, query]);
  const counts = useMemo(() => (query ? countByCategory(items, params) : new Map<string, number>()), [items, params, query]);
  const keywords = useMemo(() => topKeywords(items), [items]);
  const total = useMemo(() => [...counts.values()].reduce((a, b) => a + b, 0), [counts]);

  const showResults = query.length > 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="뒤로">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.inputWrap}>
          <Ionicons name="search-outline" size={18} color={colors.textFaint} />
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => commit(input)}
            placeholder="기사 제목·요약 검색"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            autoFocus={!initial}
            returnKeyType="search"
            maxLength={MAX_QUERY_LENGTH}
            autoCorrect={false}
            accessibilityLabel="검색어"
          />
          {input ? (
            <Pressable onPress={() => { setInput(''); inputRef.current?.focus(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="지우기">
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {index.status === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.msg}>검색 목록을 불러오지 못했어요.</Text>
          <Pressable style={styles.btn} onPress={loadIndex} accessibilityRole="button">
            <Text style={styles.btnText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : !showResults ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.idle}>
          {recent.length > 0 ? (
            <View style={styles.block}>
              <View style={styles.blockHead}>
                <Text style={styles.blockTitle}>최근 검색어</Text>
                <Pressable onPress={() => void clearRecentSearches().then(() => setRecent([]))} accessibilityRole="button">
                  <Text style={styles.clear}>전체 삭제</Text>
                </Pressable>
              </View>
              {recent.map((r) => (
                <View key={r} style={styles.recentRow}>
                  <Pressable style={styles.recentMain} onPress={() => commit(r)} accessibilityRole="button">
                    <Ionicons name="time-outline" size={18} color={colors.textFaint} />
                    <Text style={styles.recentText}>{r}</Text>
                  </Pressable>
                  <Pressable onPress={() => void removeRecentSearch(r).then(setRecent)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${r} 삭제`}>
                    <Ionicons name="close" size={18} color={colors.textFaint} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.block}>
            <Text style={styles.blockTitle}>요즘 많이 나온 키워드</Text>
            <Text style={styles.hint}>최근 기사 제목에 자주 나온 말이에요(검색 순위가 아니에요).</Text>
            {index.status === 'loading' ? (
              <ActivityIndicator color="#2563eb" style={{ marginTop: 16, alignSelf: 'flex-start' }} />
            ) : (
              <View style={styles.chips}>
                {keywords.map((k) => (
                  <Pressable key={k} style={styles.chip} onPress={() => commit(k)} accessibilityRole="button">
                    <Text style={styles.chipText}>{k}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      ) : index.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color="#2563eb" />
        </View>
      ) : (
        <FlatList
          data={hits.slice(0, limit)}
          keyExtractor={(h) => h.rec.i}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          onEndReachedThreshold={0.4}
          onEndReached={() => setLimit((n) => (n < hits.length ? n + PAGE_SIZE : n))}
          ListHeaderComponent={
            <View>
              <View style={styles.filters}>
                <Segment options={SORTS} value={sort} onChange={setSort} />
                <Segment options={PERIODS} value={period} onChange={setPeriod} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                <CatTab label="전체" count={total} on={category === ''} onPress={() => { setCategory(''); setLimit(PAGE_SIZE); }} />
                {CATEGORY_ORDER.filter((c) => counts.get(c)).map((c) => (
                  <CatTab key={c} label={c} count={counts.get(c) ?? 0} on={category === c} onPress={() => { setCategory(c); setLimit(PAGE_SIZE); }} />
                ))}
              </ScrollView>
              <Text style={styles.total}>검색 결과 {hits.length.toLocaleString('ko-KR')}건</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.msg}>&apos;{query}&apos;에 대한 결과가 없어요.</Text>
              <Text style={styles.hint}>다른 단어로 검색하거나 기간·분류를 바꿔 보세요.</Text>
            </View>
          }
          renderItem={({ item }) => <ResultRow hit={item} terms={terms} />}
        />
      )}
    </SafeAreaView>
  );
}

function Segment<T extends string>({ options, value, onChange }: { options: Array<[T, string]>; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg}>
      {options.map(([v, label]) => (
        <Pressable key={v} onPress={() => onChange(v)} style={[styles.segItem, value === v && styles.segOn]} accessibilityRole="button" accessibilityState={{ selected: value === v }}>
          <Text style={[styles.segText, value === v && styles.segTextOn]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function CatTab({ label, count, on, onPress }: { label: string; count: number; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.cat, on && styles.catOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.catText, on && styles.catTextOn]}>
        {label} {count}
      </Text>
    </Pressable>
  );
}

function Highlight({ text, terms, style }: { text: string; terms: string[]; style: object }) {
  return (
    <Text style={style}>
      {splitHighlight(text, terms).map((p, i) => (
        <Text key={i} style={p.hit ? styles.mark : undefined}>
          {p.text}
        </Text>
      ))}
    </Text>
  );
}

function ResultRow({ hit, terms }: { hit: SearchHit; terms: string[] }) {
  const r = hit.rec;
  return (
    <Link href={{ pathname: '/article/[slug]', params: { slug: r.i } }} asChild>
      <Pressable style={styles.row} accessibilityRole="link">
        <View style={styles.rowText}>
          <Highlight text={r.h} terms={terms} style={styles.rowTitle} />
          {r.s ? <Highlight text={r.s} terms={terms} style={styles.rowSummary} /> : null}
          <Text style={styles.meta}>{[r.c, kstDateTime(r.t, r.d)].filter(Boolean).join('  ')}</Text>
        </View>
        <View style={styles.thumb}>{r.p ? <Image source={{ uri: r.p }} style={styles.img} resizeMode="cover" /> : null}</View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, height: 42 },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  msg: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  btn: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f3f4f6' },
  btnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  idle: { padding: 20, gap: 28 },
  block: { gap: 10 },
  blockHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  blockTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  clear: { fontSize: 13, color: colors.textFaint },
  hint: { fontSize: 12.5, color: colors.textFaint },
  recentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  recentMain: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  recentText: { fontSize: 15.5, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f3f4f6' },
  chipText: { fontSize: 14, color: colors.textSub, fontWeight: '600' },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
  filters: { flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginTop: 14 },
  seg: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 8, padding: 2 },
  segItem: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  segOn: { backgroundColor: '#fff' },
  segText: { fontSize: 12.5, color: colors.textFaint, fontWeight: '600' },
  segTextOn: { color: colors.text, fontWeight: '800' },
  catRow: { gap: 8, paddingVertical: 14 },
  cat: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
  catOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  catText: { fontSize: 13, color: colors.textSub, fontWeight: '600' },
  catTextOn: { color: '#fff', fontWeight: '700' },
  total: { fontSize: 12.5, color: colors.textFaint, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, lineHeight: 23, fontWeight: '700', color: colors.text },
  rowSummary: { marginTop: 5, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  mark: { backgroundColor: '#fef08a', color: colors.text },
  meta: { marginTop: 6, fontSize: 12, color: colors.textFaint },
  thumb: { width: 92, height: 69, borderRadius: radius.thumb - 4, overflow: 'hidden', backgroundColor: colors.imagePlaceholder },
  img: { width: '100%', height: '100%' },
});
