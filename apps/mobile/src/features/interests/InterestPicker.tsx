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
import { CATEGORY_EMOJI, emojiFor, SHOW_EMOJI } from './emoji';
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
  const sub = full ? `최대 ${MAX_INTERESTS}개까지 담을 수 있어요` : n >= GOAL ? '좋아요! 더 담을수록 소식이 더 잘 맞아요' : `${GOAL}개 이상 고르면 맞춤 소식이 시작돼요`;
  const searching = q.trim().length > 0;

  // 분야별 섹션(분야 순서 고정). 섹터·화두를 한데 섞어 칩으로 보여 준다(분야 전체 받기 칩이 맨 앞).
  const sections = useMemo(() => {
    const order = [...cats.map((c) => c.it.key), 'etc'];
    return order
      .map((slug) => {
        const head = cats.find((c) => c.it.key === slug);
        const list = entries.filter((e) => e.it.type !== 'category' && (e.cat ?? 'etc') === slug);
        return { slug, label: head?.it.label ?? '기타', head, list: list.sort((a, b) => (fresh.get(keyOf(b.it)) ?? 0) - (fresh.get(keyOf(a.it)) ?? 0) || a.it.label.localeCompare(b.it.label, 'ko')) };
      })
      .filter((g) => g.list.length > 0);
  }, [entries, cats, fresh]);

  const chip = (e: Entry, opts: { fresh?: boolean; wide?: boolean } = {}) => {
    const on = picked.has(keyOf(e.it));
    const f = fresh.get(keyOf(e.it)) ?? 0;
    const emoji = SHOW_EMOJI ? emojiFor(e.it.label, e.cat) : '';
    return (
      <Pop key={keyOf(e.it)} on={on} onPress={() => void toggle(e.it)} label={`${e.it.label} ${on ? '빼기' : '담기'}`} style={[styles.chip, on && styles.chipOn]}>
        {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
        <Text style={[styles.chipText, on && { color: '#fff' }]}>{e.it.type === 'category' ? `${e.it.label} 전체` : e.it.label}</Text>
        {opts.fresh && f > 0 ? <Text style={[styles.chipFresh, on && { color: 'rgba(255,255,255,0.85)' }]}>{f}</Text> : null}
        {on ? <Check size={14} color="#fff" weight="bold" /> : null}
      </Pop>
    );
  };

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        <View style={styles.top}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="닫기">
            <X size={24} color={colors.text} />
          </Pressable>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={styles.skip}>{n === 0 ? '건너뛰기' : '나중에'}</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: 130 }}>
          <View style={styles.hero}>
            <Text style={styles.title}>{'관심 있는 주제를\n골라 주세요'}</Text>
            <Text style={[styles.sub, full && { color: '#dc2626' }]}>{sub}</Text>
          </View>

          {/* 고정 머리: 진행 막대와 검색창이 스크롤해도 위에 남는다. */}
          <View style={styles.sticky}>
            <View style={styles.counterRow}>
              <Progress n={n} />
              <Text style={styles.counter}>{n}<Text style={styles.counterMax}> / {GOAL}+</Text></Text>
            </View>
            <View style={styles.search}>
              <MagnifyingGlass size={20} color={colors.textFaint} />
              <TextInput value={q} onChangeText={setQ} placeholder="반도체, 금리, 부동산처럼 검색해 보세요" placeholderTextColor={colors.textFaint} style={styles.input} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} autoCorrect={false} accessibilityLabel="관심 주제 검색" />
              {q ? (
                <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="지우기">
                  <XCircle size={20} color={colors.textFaint} weight="fill" />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.body}>
            {searching ? (
              <View>
                <Text style={styles.label}>{results.length > 0 ? `'${q.trim()}' 검색 결과` : '찾는 주제가 없어요'}</Text>
                <View style={styles.chips}>{results.map((e) => chip(e, { fresh: true }))}</View>
                {results.length === 0 ? <Text style={styles.empty}>다른 말로 검색해 보세요. 예: 금리, 반도체, 전세</Text> : null}
              </View>
            ) : (
              <>
                {n > 0 ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>담은 주제 {n}</Text>
                    <View style={styles.chips}>
                      {items.map((it) => (
                        <Pop key={keyOf(it)} on label={`${it.label} 빼기`} onPress={() => void toggle(it)} style={styles.mine}>
                          {SHOW_EMOJI ? <Text style={styles.emoji}>{it.type === 'category' ? CATEGORY_EMOJI[it.key] ?? '✨' : emojiFor(it.label, it.category)}</Text> : null}
                          <Text style={styles.mineText}>{it.label}</Text>
                          <X size={13} color={accent.ink} weight="bold" />
                        </Pop>
                      ))}
                    </View>
                  </View>
                ) : null}
                {suggestions.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>✨ 이런 주제는 어때요?</Text>
                    <Text style={styles.sectionSub}>숫자는 오늘 올라온 새 소식이에요</Text>
                    <View style={styles.chips}>{suggestions.map((e) => chip(e, { fresh: true }))}</View>
                  </View>
                ) : null}
                {sections.map((g) => (
                  <View key={g.slug} style={styles.section}>
                    <Text style={styles.sectionTitle}>{CATEGORY_EMOJI[g.slug] ?? '✨'} {g.label}</Text>
                    <View style={styles.chips}>
                      {g.head ? chip({ ...g.head, catLabel: '분야' }) : null}
                      {g.list.map((e) => chip(e, { fresh: true }))}
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        </ScrollView>

        {/* 하단 고정 버튼: 3개 전에는 회색으로 몇 개 남았는지, 3개부터 파랑으로 바뀐다. */}
        <View style={styles.bar}>
          <Pressable style={({ pressed }) => [styles.done, n < GOAL && styles.doneIdle, pressed && { opacity: 0.9 }]} onPress={onClose} accessibilityRole="button">
            <Text style={[styles.doneText, n < GOAL && { color: colors.textSub }]}>{n === 0 ? '주제를 골라 주세요' : n < GOAL ? `${GOAL - n}개 더 고르면 시작할 수 있어요` : `${n}개로 시작하기`}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', paddingTop: 44 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 52 },
  skip: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
  hero: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10, backgroundColor: '#fff' },
  title: { fontSize: 28, lineHeight: 37, fontWeight: '800', letterSpacing: -0.9, color: colors.text },
  sub: { marginTop: 8, fontSize: 15, color: colors.textMuted },
  sticky: { backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eceff4' },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  counter: { fontSize: 18, fontWeight: '800', color: accent.main },
  counterMax: { fontSize: 13, fontWeight: '700', color: colors.textFaint },
  progress: { flex: 1, flexDirection: 'row', gap: 6 },
  seg: { flex: 1, height: 6, borderRadius: 3 },
  search: { marginTop: 12, height: 48, borderRadius: 16, backgroundColor: '#f1f3f6', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  body: { paddingHorizontal: 20, paddingTop: 0 },
  section: { marginTop: 22 },
  sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4, color: colors.text },
  sectionSub: { marginTop: 3, fontSize: 12.5, color: colors.textMuted },
  label: { marginTop: 14, fontSize: 14, fontWeight: '800', color: colors.textSub },
  chips: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#dfe4ec' },
  chipOn: { backgroundColor: accent.main, borderColor: accent.main },
  emoji: { fontSize: 16 },
  chipText: { fontSize: 15, fontWeight: '700', color: colors.text },
  chipFresh: { minWidth: 18, paddingHorizontal: 5, height: 18, borderRadius: 9, overflow: 'hidden', textAlign: 'center', lineHeight: 18, fontSize: 11.5, fontWeight: '800', color: accent.ink, backgroundColor: accent.soft },
  mine: { height: 42, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: accent.soft, borderWidth: 1.5, borderColor: accent.line },
  mineText: { fontSize: 14.5, fontWeight: '800', color: accent.ink },
  empty: { marginTop: 10, fontSize: 13.5, color: colors.textMuted },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 26, backgroundColor: 'rgba(255,255,255,0.97)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eceff4' },
  done: { height: 56, borderRadius: 18, backgroundColor: accent.main, alignItems: 'center', justifyContent: 'center' },
  doneIdle: { backgroundColor: '#eef1f6' },
  doneText: { fontSize: 16.5, fontWeight: '800', color: '#fff' },
});
