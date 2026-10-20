import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, Share, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { categoryForDataLabel, ECON_CATEGORIES } from '@ailens/domain';
import { listPosts, type LensPost, type LetterPost } from '@ailens/api-client';
import { AppHeader } from '../../components/AppHeader';
import { useAuth } from '../../auth/AuthContext';
import { kstDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { colors } from '../../theme';
import { buildLatest } from '../home/model';
import { deleteSentence, listArchive, type ArchiveSentence } from './archiveApi';
import { useListStore } from './listStore';
import { bookmarks, getInterests, history, setInterests, type SavedArticle } from './stores';

const SITE = 'https://ailens.sedaily.ai';
type Tab = 'drawer' | 'saved' | 'read' | 'interest';
const TABS: Array<[Tab, string]> = [['drawer', '내 서랍'], ['saved', '저장한 글'], ['read', '읽은 글'], ['interest', '관심 분야']];

/**
 * 나의 LENS — 웹 /my-lens 대응(앱 판). 로그인 필수.
 *  · 내 서랍: 담은 문장(서버 저장, 검색·삭제·공유·원문)
 *  · 저장한 글 / 읽은 글: 이 기기에 저장(웹도 브라우저 범위 — 계정 동기화는 백엔드 연동 후)
 *  · 관심 분야: 고른 분야의 최신 글
 * 웹의 리워드·배지·개인화 푸시는 서버가 아직 없어(웹도 "예시/초안" 표시) 앱에도 넣지 않았다.
 */
export function MyLensScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const [tab, setTab] = useState<Tab>('drawer');
  const saved = useListStore(bookmarks);
  const read = useListStore(history);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <AppHeader />
      {state.status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator color="#2563eb" />
        </View>
      ) : state.status === 'signedOut' ? (
        <View style={styles.center}>
          <Ionicons name="bookmark-outline" size={44} color={colors.textFaint} />
          <Text style={styles.h1}>나의 LENS</Text>
          <Text style={styles.note}>로그인하면 담은 문장과 저장한 글,{'\n'}관심 분야를 한곳에서 볼 수 있어요.</Text>
          <Pressable style={styles.cta} onPress={() => router.push('/login')} accessibilityRole="button">
            <Text style={styles.ctaText}>로그인 · 회원가입</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.summary}>
            <Text style={styles.hello} numberOfLines={1}>{state.email ?? '나의 LENS'}</Text>
            <View style={styles.stats}>
              <Stat n={saved.items.length} label="저장한 글" />
            </View>
          </View>
          <View style={styles.tabs}>
            {TABS.map(([k, label]) => (
              <Pressable key={k} style={styles.tab} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
                <Text style={[styles.tabText, tab === k && styles.tabOn]}>{label}</Text>
                <View style={[styles.ind, tab === k && styles.indOn]} />
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1 }}>
            {tab === 'drawer' ? <Drawer userId={state.userId} /> : null}
            {tab === 'saved' ? <ArticleList items={saved.items} empty="저장한 글이 없어요. 기사 상단의 북마크 아이콘으로 저장해 보세요." onRemove={(id) => void bookmarks.remove(id)} /> : null}
            {tab === 'read' ? <ArticleList items={read.items} empty="아직 읽은 글이 없어요." onRemove={(id) => void history.remove(id)} showTime /> : null}
            {tab === 'interest' ? <Interests /> : null}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

function Drawer({ userId }: { userId: string }) {
  const { state, reload } = useAsync((signal) => listArchive(userId).then((l) => (signal.aborted ? [] : l)), [userId]);
  const [q, setQ] = useState('');
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  if (state.status === 'loading') return <View style={styles.center}><ActivityIndicator color="#2563eb" /></View>;
  if (state.status === 'error')
    return (
      <View style={styles.center}>
        <Text style={styles.note}>서랍을 불러오지 못했어요. {state.message}</Text>
        <Pressable style={styles.retry} onPress={reload} accessibilityRole="button"><Text style={styles.retryText}>다시 시도</Text></Pressable>
      </View>
    );

  const term = q.trim().toLowerCase();
  const items = state.data.filter((s) => !removed.has(s.id) && (!term || s.text.toLowerCase().includes(term) || s.article_title.toLowerCase().includes(term)));
  const confirmDelete = (s: ArchiveSentence) =>
    Alert.alert('이 문장을 삭제할까요?', s.text.slice(0, 60), [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          setRemoved((r) => new Set(r).add(s.id));
          deleteSentence(s.id, userId).catch(() => {
            setRemoved((r) => {
              const n = new Set(r);
              n.delete(s.id);
              return n;
            });
            Alert.alert('삭제하지 못했어요', '잠시 뒤 다시 시도해 주세요.');
          });
        },
      },
    ]);

  return (
    <FlatList
      data={items}
      keyExtractor={(s) => s.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.search}>
          <Ionicons name="search-outline" size={18} color={colors.textFaint} />
          <TextInput value={q} onChangeText={setQ} placeholder="담은 문장 검색" placeholderTextColor={colors.textFaint} style={styles.searchInput} accessibilityLabel="담은 문장 검색" />
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>{state.data.length === 0 ? '담은 문장이 없어요. 기사 본문의 문단을 길게 눌러 문장을 담아 보세요.' : '검색 결과가 없어요.'}</Text>}
      renderItem={({ item: s }) => (
        <View style={styles.card}>
          <Text style={styles.quote}>“{s.text}”</Text>
          <Link href={{ pathname: '/article/[slug]', params: { slug: s.article_id } }} asChild>
            <Pressable accessibilityRole="link">
              <Text style={styles.src} numberOfLines={1}>{s.article_title}</Text>
            </Pressable>
          </Link>
          <View style={styles.actions}>
            <Text style={styles.date}>{kstDateTime(s.created_at)}</Text>
            <View style={styles.actRow}>
              <Pressable onPress={() => void Share.share({ message: `“${s.text}”\n— ${s.article_title}\n${SITE}/lens/${encodeURIComponent(s.article_id)}` })} hitSlop={8} accessibilityRole="button" accessibilityLabel="공유">
                <Ionicons name="share-outline" size={20} color={colors.textMuted} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(s)} hitSlop={8} accessibilityRole="button" accessibilityLabel="삭제">
                <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>
        </View>
      )}
    />
  );
}

function ArticleList({ items, empty, onRemove, showTime }: { items: SavedArticle[]; empty: string; onRemove: (id: string) => void; showTime?: boolean }) {
  return (
    <FlatList
      data={items}
      keyExtractor={(a) => a.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>{empty}</Text>}
      renderItem={({ item }) => (
        <View style={styles.rowWrap}>
          <Link href={{ pathname: '/article/[slug]', params: { slug: item.id } }} asChild>
            <Pressable style={styles.row} accessibilityRole="link">
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.rowMeta}>{[item.category, showTime ? kstDateTime(new Date(item.at).toISOString()) : null].filter(Boolean).join('  ')}</Text>
              </View>
              <View style={styles.thumb}>{item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.img} resizeMode="cover" /> : null}</View>
            </Pressable>
          </Link>
          <Pressable onPress={() => onRemove(item.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="목록에서 지우기" style={styles.x}>
            <Ionicons name="close" size={18} color={colors.textFaint} />
          </Pressable>
        </View>
      )}
    />
  );
}

function Interests() {
  const [picked, setPicked] = useState<string[] | null>(null);
  useEffect(() => {
    void getInterests().then(setPicked);
  }, []);
  const toggle = useCallback((slug: string) => {
    setPicked((p) => {
      const cur = p ?? [];
      const next = cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug];
      void setInterests(next);
      return next;
    });
  }, []);
  const { state } = useAsync(async (signal) => {
    const [letters, lens] = await Promise.all([listPosts<LetterPost>('letters', { limit: 100, signal }), listPosts<LensPost>('lens', { limit: 100, signal })]);
    return buildLatest(letters, lens);
  }, []);

  const feed = state.status === 'ready' && picked ? state.data.filter((i) => picked.includes(categoryForDataLabel(i.category)?.slug ?? '')).slice(0, 12) : [];
  return (
    <FlatList
      data={feed}
      keyExtractor={(i) => i.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View>
          <Text style={styles.sec}>관심 있는 분야를 골라 보세요</Text>
          <View style={styles.chips}>
            {ECON_CATEGORIES.map((c) => {
              const on = picked?.includes(c.slug) ?? false;
              return (
                <Pressable key={c.slug} onPress={() => toggle(c.slug)} style={[styles.chip, on && { backgroundColor: c.accent, borderColor: c.accent }]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Text style={[styles.chipText, on && { color: '#fff' }]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.sec, { marginTop: 24 }]}>내 관심 분야 최신 글</Text>
          {state.status === 'loading' ? <ActivityIndicator color="#2563eb" style={{ marginTop: 16 }} /> : null}
          {picked && picked.length === 0 ? <Text style={styles.empty}>분야를 고르면 해당 분야의 최신 글을 모아 보여 줘요.</Text> : null}
        </View>
      }
      renderItem={({ item }) => (
        <Link href={{ pathname: '/article/[slug]', params: { slug: item.id } }} asChild>
          <Pressable style={styles.row} accessibilityRole="link">
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.rowMeta}>{[item.category, kstDateTime(item.publishedAt, item.date)].filter(Boolean).join('  ')}</Text>
            </View>
            <View style={styles.thumb}>{item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.img} resizeMode="cover" /> : null}</View>
          </Pressable>
        </Link>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  h1: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 6 },
  note: { fontSize: 14, lineHeight: 22, color: colors.textMuted, textAlign: 'center' },
  cta: { marginTop: 14, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 10, backgroundColor: colors.brand },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  retry: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f3f4f6' },
  retryText: { fontSize: 14, fontWeight: '600', color: colors.text },
  summary: { paddingHorizontal: 20, paddingTop: 16 },
  hello: { fontSize: 13, color: colors.textMuted },
  stats: { flexDirection: 'row', marginTop: 10, gap: 10 },
  stat: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f8fafc', alignItems: 'center' },
  statN: { fontSize: 22, fontWeight: '800', color: colors.brand },
  statL: { marginTop: 2, fontSize: 11.5, color: colors.textMuted },
  tabs: { flexDirection: 'row', marginTop: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  tab: { flex: 1, alignItems: 'center', paddingTop: 10 },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textFaint, paddingBottom: 8 },
  tabOn: { color: colors.text, fontWeight: '800' },
  ind: { height: 2, alignSelf: 'stretch', backgroundColor: 'transparent' },
  indOn: { backgroundColor: colors.text },
  list: { padding: 20, paddingBottom: 40 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 36, lineHeight: 21 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 10, backgroundColor: '#f3f4f6', paddingHorizontal: 12, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  card: { padding: 16, borderRadius: 14, backgroundColor: '#fffdf5', borderWidth: 1, borderColor: '#fde68a', marginBottom: 12 },
  quote: { fontSize: 16, lineHeight: 25, fontWeight: '600', color: colors.text },
  src: { marginTop: 10, fontSize: 13, color: '#2563eb', textDecorationLine: 'underline' },
  actions: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actRow: { flexDirection: 'row', gap: 18 },
  date: { fontSize: 12, color: colors.textFaint },
  rowWrap: { position: 'relative' },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 14, paddingRight: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowTitle: { fontSize: 15.5, lineHeight: 22, fontWeight: '600', color: colors.text },
  rowMeta: { marginTop: 5, fontSize: 12, color: colors.textFaint },
  thumb: { width: 84, height: 63, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.imagePlaceholder },
  img: { width: '100%', height: '100%' },
  x: { position: 'absolute', right: -4, top: 12, padding: 4 },
  sec: { fontSize: 15, fontWeight: '800', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.textSub },
});
