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
          <View style={styles.tabs}>
            {TABS.map(([k, label]) => (
              <Pressable key={k} style={[styles.tab, tab === k && styles.tabOnBg]} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
                <Text style={[styles.tabText, tab === k && styles.tabOn]} numberOfLines={1}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1 }}>
            {tab === 'drawer' ? <Drawer userId={state.userId} /> : null}
            {tab === 'saved' ? <ArticleList items={saved.items} icon="bookmark-outline" empty={'저장한 글이 없어요.\n기사 상단의 북마크 아이콘으로 저장해 보세요.'} onRemove={(id) => void bookmarks.remove(id)} /> : null}
            {tab === 'read' ? <ArticleList items={read.items} icon="time-outline" empty={'아직 읽은 글이 없어요.\n오늘의 지면에서 하나 골라 읽어 보세요.'} onRemove={(id) => void history.remove(id)} showTime /> : null}
            {tab === 'interest' ? <Interests /> : null}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function Empty({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  const router = useRouter();
  return (
    <View style={styles.emptyBox}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color="#6b7280" />
      </View>
      <Text style={styles.emptyText}>{text}</Text>
      <Pressable style={styles.emptyBtn} onPress={() => router.navigate('/')} accessibilityRole="button">
        <Text style={styles.emptyBtnText}>오늘의 기사 보러 가기</Text>
      </Pressable>
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
      ListEmptyComponent={
        <Empty
          icon="chatbox-ellipses-outline"
          text={state.data.length === 0 ? '담은 문장이 없어요.\n기사 본문의 문단을 길게 눌러 마음에 드는 문장을 담아 보세요.' : '검색 결과가 없어요.'}
        />
      }
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

function ArticleList({ items, empty, icon, onRemove, showTime }: { items: SavedArticle[]; empty: string; icon: React.ComponentProps<typeof Ionicons>['name']; onRemove: (id: string) => void; showTime?: boolean }) {
  return (
    <FlatList
      data={items}
      keyExtractor={(a) => a.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Empty icon={icon} text={empty} />}
      renderItem={({ item }) => (
        <View style={styles.rowWrap}>
          <Link href={{ pathname: '/article/[slug]', params: { slug: item.id } }} asChild>
            <Pressable style={styles.row} accessibilityRole="link">
              <View style={{ flex: 1 }}>
                {item.category ? <View style={styles.cat}><Text style={styles.catText}>{item.category}</Text></View> : null}
                <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
                {showTime ? <Text style={styles.rowMeta}>{kstDateTime(new Date(item.at).toISOString())}</Text> : null}
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
              {item.category ? <View style={styles.cat}><Text style={styles.catText}>{item.category}</Text></View> : null}
              <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.rowMeta}>{kstDateTime(item.publishedAt, item.date)}</Text>
            </View>
            <View style={styles.thumb}>{item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.img} resizeMode="cover" /> : null}</View>
          </Pressable>
        </Link>
      )}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f6fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  h1: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 6 },
  note: { fontSize: 14, lineHeight: 22, color: colors.textMuted, textAlign: 'center' },
  cta: { marginTop: 14, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 10, backgroundColor: colors.brand },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  retry: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f3f4f6' },
  retryText: { fontSize: 14, fontWeight: '600', color: colors.text },
  summary: { paddingHorizontal: 20, paddingTop: 18 },
  title: { fontSize: 26, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8, color: colors.text },
  hello: { marginTop: 4, fontSize: 14, color: colors.textMuted },
  tabs: { flexDirection: 'row', gap: 2, marginHorizontal: 20, marginTop: 14, padding: 4, borderRadius: 999, backgroundColor: 'rgba(17,24,39,0.055)' },
  tab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, borderRadius: 999 },
  tabOnBg: { backgroundColor: '#fff', elevation: 2, shadowColor: '#111827' },
  tabText: { fontSize: 13.5, fontWeight: '600', letterSpacing: -0.14, color: '#6b7280' },
  tabOn: { color: colors.text, fontWeight: '700' },
  list: { padding: 20, paddingBottom: 40, gap: 10 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 36, lineHeight: 21 },
  emptyBox: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#f1f3f6', alignItems: 'center', justifyContent: 'center' },
  emptyText: { marginTop: 16, fontSize: 14.5, lineHeight: 23, color: colors.textMuted, textAlign: 'center' },
  emptyBtn: { marginTop: 18, paddingHorizontal: 20, height: 44, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  emptyBtnText: { fontSize: 14.5, fontWeight: '700', color: '#fff' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 14, backgroundColor: '#f1f3f6', paddingHorizontal: 14, marginBottom: 6 },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  card: { padding: 18, paddingLeft: 20, borderRadius: 18, backgroundColor: '#fff', elevation: 1, shadowColor: '#3c372d' },
  quote: { fontSize: 16, lineHeight: 25, fontWeight: '600', color: colors.text },
  src: { marginTop: 10, fontSize: 13, color: '#2563eb', textDecorationLine: 'underline' },
  actions: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actRow: { flexDirection: 'row', gap: 18 },
  date: { fontSize: 12, color: colors.textFaint },
  rowWrap: { position: 'relative' },
  row: { flexDirection: 'row', gap: 14, padding: 14, paddingRight: 34, borderRadius: 18, backgroundColor: '#fff', elevation: 1, shadowColor: '#3c372d' },
  cat: { alignSelf: 'flex-start', marginBottom: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(37,99,235,0.08)' },
  catText: { fontSize: 11.5, fontWeight: '800', color: '#2563eb' },
  rowTitle: { fontSize: 15.5, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2, color: colors.text },
  rowMeta: { marginTop: 5, fontSize: 12, color: colors.textFaint },
  thumb: { width: 84, height: 63, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.imagePlaceholder },
  img: { width: '100%', height: '100%' },
  x: { position: 'absolute', right: 8, top: 10, padding: 4 },
  sec: { fontSize: 15, fontWeight: '800', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: '#e1e5ec', backgroundColor: '#fff' },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.textSub },
});
