import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, UIManager, View } from 'react-native';
import { Text, TextInput } from '../../ui/Text';
import { Check, MagnifyingGlass, X, XCircle } from '../../ui/icons';
import { accent, colors } from '../../theme';
import { history } from '../mylens/stores';
import { useListStore } from '../mylens/listStore';
import { categoriesOf, useMyEditor } from '../home/myEditor';
import { loadSearchIndex } from '../search/searchData';
import { catalog, slugOfCategory } from './dictionary';
import { freshCount, keyOf, type Interest, type RecLike } from './match';
import { searchEntries, suggest, type Entry } from './suggest';
import { MAX_INTERESTS, toggleInterest, useInterestItems } from './store';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

/**
 * 관심 주제 담기 시트 — "어떤 소식이 궁금하세요?"
 * 분야·섹터·화두를 사용자에게는 "주제" 하나로 보여 준다. 처음에는 3개만 고르면 되고, 추천 주제("오늘 N건")를 먼저 보여 주며,
 * 검색으로 바로 찾거나 분야 필터로 둘러볼 수 있다. 담은 주제는 위 줄에 쌓이고, 누르면 빠진다. 칩은 누를 때 살짝 튀어 오른다.
 */
const GOAL = 3;
const ease = () => LayoutAnimation.configureNext(LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));

function Pop({ on, onPress, children, style, label }: { on: boolean; onPress: () => void; children: React.ReactNode; style: object | object[]; label: string }) {
  const s = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    // 담기/빼기가 바뀔 때 한 번 튀어 오르는 스프링.
    Animated.sequence([Animated.timing(s, { toValue: 1.1, duration: 90, useNativeDriver: true }), Animated.spring(s, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true })]).start();
  }, [on, s]);
  const press = (v: number) => Animated.spring(s, { toValue: v, friction: 6, tension: 220, useNativeDriver: true }).start();
  return (
    <Animated.View style={{ transform: [{ scale: s }] }}>
      <Pressable onPress={onPress} onPressIn={() => press(0.95)} onPressOut={() => press(1)} style={style} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

function Progress({ n }: { n: number }) {
  const v = useRef(new Animated.Value(Math.min(n, GOAL))).current;
  useEffect(() => {
    Animated.timing(v, { toValue: Math.min(n, GOAL), duration: 260, useNativeDriver: false }).start();
  }, [n, v]);
  return (
    <View style={styles.progress}>
      {Array.from({ length: GOAL }, (_, i) => {
        const bg = v.interpolate({ inputRange: [i, i + 1], outputRange: ['#e5e9f1', accent.main], extrapolate: 'clamp' });
        return <Animated.View key={i} style={[styles.seg, { backgroundColor: bg }]} />;
      })}
    </View>
  );
}

export function InterestPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, slugs } = useInterestItems();
  const read = useListStore(history);
  const myEditor = useMyEditor(slugs);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [recs, setRecs] = useState<RecLike[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!open) return;
    void catalog().then(setEntries);
    loadSearchIndex().then((r) => setRecs(r as unknown as RecLike[]), () => setRecs([]));
  }, [open]);
  useEffect(() => {
    if (!open) {
      setQ('');
      setFilter('all');
      setFull(false);
    }
  }, [open]);

  const picked = useMemo(() => new Set(items.map(keyOf)), [items]);
  const fresh = useMemo(() => {
    const m = new Map<string, number>();
    if (recs && entries.length) for (const e of entries) m.set(keyOf(e.it), freshCount(e.it, recs, (c) => slugOfCategory(c)));
    return m;
  }, [recs, entries]);

  const suggestions = useMemo(
    () =>
      suggest(entries, {
        picked,
        fresh,
        editorCats: categoriesOf(myEditor.editor.id),
        editorTopics: myEditor.editor.topics.map((t) => t.name),
        readCats: read.items.map((r) => slugOfCategory(r.category)).filter((c): c is string => !!c).slice(0, 30),
        limit: 8,
      }),
    [entries, picked, fresh, myEditor.editor, read.items]
  );
  const results = useMemo(() => (q.trim() ? searchEntries(entries, q) : []), [entries, q]);
  const browse = useMemo(() => {
    // '전체'에서는 위 추천과 겹치지 않게 추천에 나온 주제는 뺀다.
    const shown = new Set(suggestions.map((e) => keyOf(e.it)));
    const base = entries.filter((e) => e.it.type !== 'category' && (filter === 'all' ? !shown.has(keyOf(e.it)) : e.cat === filter));
    return base.sort((a, b) => (fresh.get(keyOf(b.it)) ?? 0) - (fresh.get(keyOf(a.it)) ?? 0) || a.it.label.localeCompare(b.it.label, 'ko')).slice(0, filter === 'all' ? 18 : 60);
  }, [entries, filter, fresh, suggestions]);
  const cats = useMemo(() => entries.filter((e) => e.it.type === 'category'), [entries]);

  const toggle = async (it: Interest) => {
    ease();
    const ok = await toggleInterest(it);
    setFull(!ok);
  };

  const n = items.length;
  const sub = n === 0 ? '관심 주제를 3개만 골라 보세요' : n < GOAL ? `${GOAL - n}개만 더 고르면 맞춤 소식이 시작돼요` : '좋아요! 더 담아도 되고, 바로 시작해도 돼요';
  const searching = q.trim().length > 0;

  const chip = (e: Entry, withFresh = true) => {
    const on = picked.has(keyOf(e.it));
    const f = fresh.get(keyOf(e.it)) ?? 0;
    return (
      <Pop key={keyOf(e.it)} on={on} onPress={() => void toggle(e.it)} label={`${e.it.label} ${on ? '빼기' : '담기'}`} style={[styles.chip, on && styles.chipOn]}>
        {on ? <Check size={14} color="#fff" weight="bold" /> : null}
        <Text style={[styles.chipText, on && { color: '#fff' }]}>{e.it.label}</Text>
        {withFresh && f > 0 ? <Text style={[styles.chipFresh, on && { color: 'rgba(255,255,255,0.85)' }]}>오늘 {f}건</Text> : null}
      </Pop>
    );
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
      <View style={styles.sheet}>
        <View style={styles.grab} />
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>어떤 소식이 궁금하세요?</Text>
            <Text style={[styles.sub, full && { color: '#dc2626' }]}>{full ? `최대 ${MAX_INTERESTS}개까지 담을 수 있어요` : sub}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
            <X size={22} color={colors.textMuted} />
          </Pressable>
        </View>
        <Progress n={n} />

        <View style={styles.search}>
          <MagnifyingGlass size={20} color={colors.textFaint} />
          <TextInput value={q} onChangeText={setQ} placeholder="반도체, 금리, 부동산처럼 검색해 보세요" placeholderTextColor={colors.textFaint} style={styles.input} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} autoCorrect={false} accessibilityLabel="관심 주제 검색" />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="지우기">
              <XCircle size={20} color={colors.textFaint} weight="fill" />
            </Pressable>
          ) : null}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
          {n > 0 ? (
            <View style={styles.block}>
              <Text style={styles.label}>담은 주제 {n}</Text>
              <View style={styles.chips}>
                {items.map((it) => (
                  <Pop key={keyOf(it)} on label={`${it.label} 빼기`} onPress={() => void toggle(it)} style={styles.mine}>
                    <Text style={styles.mineText}>{it.label}</Text>
                    <X size={13} color={accent.ink} weight="bold" />
                  </Pop>
                ))}
              </View>
            </View>
          ) : null}

          {searching ? (
            <View style={styles.block}>
              <Text style={styles.label}>{results.length > 0 ? `'${q.trim()}' 검색 결과` : '찾는 주제가 없어요'}</Text>
              <View style={styles.list}>
                {results.map((e) => {
                  const on = picked.has(keyOf(e.it));
                  return (
                    <Pressable key={keyOf(e.it)} onPress={() => void toggle(e.it)} style={styles.row} accessibilityRole="button" accessibilityState={{ selected: on }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{e.it.label}</Text>
                        <Text style={styles.rowSub}>{e.catLabel}{(fresh.get(keyOf(e.it)) ?? 0) > 0 ? ` · 오늘 ${fresh.get(keyOf(e.it))}건` : ''}</Text>
                      </View>
                      <View style={[styles.round, on && styles.roundOn]}>{on ? <Check size={14} color="#fff" weight="bold" /> : null}</View>
                    </Pressable>
                  );
                })}
              </View>
              {results.length === 0 ? <Text style={styles.empty}>다른 말로 검색해 보세요. 예: 금리, 반도체, 전세</Text> : null}
            </View>
          ) : (
            <>
              {suggestions.length > 0 ? (
                <View style={styles.block}>
                  <Text style={styles.label}>이런 주제는 어때요?</Text>
                  <View style={styles.chips}>{suggestions.map((e) => chip(e))}</View>
                </View>
              ) : null}
              <View style={styles.block}>
                <Text style={styles.label}>둘러보기</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={{ marginHorizontal: -20 }}>
                  {[{ slug: 'all', label: '전체' }, ...cats.map((c) => ({ slug: c.it.key, label: c.it.label }))].map((f) => (
                    <Pressable key={f.slug} onPress={() => { ease(); setFilter(f.slug); }} style={[styles.filter, filter === f.slug && styles.filterOn]} accessibilityRole="button" accessibilityState={{ selected: filter === f.slug }}>
                      <Text style={[styles.filterText, filter === f.slug && { color: '#fff' }]}>{f.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={[styles.chips, { marginTop: 12 }]}>{browse.map((e) => chip(e))}</View>
                {filter !== 'all' ? (
                  <View style={{ marginTop: 14 }}>
                    {(() => {
                      const c = cats.find((x) => x.it.key === filter);
                      if (!c) return null;
                      const on = picked.has(keyOf(c.it));
                      return (
                        <Pop on={on} onPress={() => void toggle(c.it)} label={`${c.it.label} 분야 전체 ${on ? '빼기' : '담기'}`} style={[styles.wide, on && styles.wideOn]}>
                          {on ? <Check size={16} color="#fff" weight="bold" /> : null}
                          <Text style={[styles.wideText, on && { color: '#fff' }]}>{c.it.label} 분야 소식 전체 받기</Text>
                        </Pop>
                      );
                    })()}
                  </View>
                ) : null}
              </View>
            </>
          )}
        </ScrollView>

        <Pressable style={({ pressed }) => [styles.done, n === 0 && styles.doneIdle, pressed && { opacity: 0.9 }]} onPress={onClose} accessibilityRole="button">
          <Text style={[styles.doneText, n === 0 && { color: colors.textSub }]}>{n === 0 ? '나중에 할게요' : n < GOAL ? `${n}개 담았어요 · 시작하기` : `${n}개로 시작하기`}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)' },
  sheet: { maxHeight: '92%', backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#dfe3ea', marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6, color: colors.text },
  sub: { marginTop: 4, fontSize: 14, color: colors.textMuted },
  progress: { marginTop: 14, flexDirection: 'row', gap: 6 },
  seg: { flex: 1, height: 5, borderRadius: 3 },
  search: { marginTop: 14, height: 48, borderRadius: 16, backgroundColor: '#f1f3f6', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  block: { marginTop: 20 },
  label: { marginBottom: 10, fontSize: 14, fontWeight: '800', color: colors.textSub },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 15, borderRadius: 999, backgroundColor: '#f1f3f6' },
  chipOn: { backgroundColor: accent.main },
  chipText: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  chipFresh: { fontSize: 12, fontWeight: '700', color: colors.textFaint },
  mine: { height: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, borderRadius: 999, backgroundColor: accent.soft },
  mineText: { fontSize: 14, fontWeight: '800', color: accent.ink },
  list: { borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eceff4' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eceff4' },
  rowTitle: { fontSize: 15.5, fontWeight: '800', color: colors.text },
  rowSub: { marginTop: 2, fontSize: 12.5, color: colors.textMuted },
  round: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: '#d3d9e3', alignItems: 'center', justifyContent: 'center' },
  roundOn: { backgroundColor: accent.main, borderColor: accent.main },
  empty: { marginTop: 8, fontSize: 13.5, color: colors.textMuted },
  filters: { paddingHorizontal: 20, gap: 8 },
  filter: { height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e1e5ec', alignItems: 'center', justifyContent: 'center' },
  filterOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterText: { fontSize: 13.5, fontWeight: '800', color: '#4b5563' },
  wide: { height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: accent.line, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  wideOn: { backgroundColor: accent.main, borderColor: accent.main },
  wideText: { fontSize: 14.5, fontWeight: '800', color: accent.ink },
  done: { marginTop: 10, height: 54, borderRadius: 16, backgroundColor: accent.main, alignItems: 'center', justifyContent: 'center' },
  doneIdle: { backgroundColor: '#eef1f6' },
  doneText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
