import { useEffect, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, View, type View as RNView } from 'react-native';
import { FONT, Text } from '../../ui/Text';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { categoryForDataLabel, displayCategoryLabel, displayHeadline, letterChapters, lensPath, readMinutes } from '@ailens/domain';
import type { LensItem, LensPost } from '@ailens/api-client';
import { AsyncView } from '../../components/AsyncView';
import { kstDateTime } from '../../lib/format';
import { colors } from '../../theme';
import { FONT_SCALES, useFontScale } from './FontScale';
import { FormatPanel, FORMATS } from './FormatPanels';
import { ArticleHeader, ArticlePhoto, coreSummary, FormatPicker, Rule, SummaryCard, type PickerTab } from './ArticleParts';
import { LetterArticle } from './LetterArticle';
import { useArticle, type Article } from './useArticle';
import { ChapterContext } from './chapterContext';
import { bookmarks, history } from '../mylens/stores';
import { getPreferredFormat } from '../onboarding/prefs';
import { SentenceSheet } from './SentenceSheet';

const SITE = 'https://ailens.sedaily.ai';



/**
 * 기사 상세 — 웹 LensViewClient / letters 상세 대응. LENS 글은 4가지 형식 탭(읽기·웹툰·듣기·영상), letters 글은 본문 한 벌.
 * 헤더에 글자 크기·공유, 상단에 읽기 진행바. 하단에 원문 링크와 같은 분류의 다른 글.
 */
export function ArticleScreen() {
  const { slug, format } = useLocalSearchParams<{ slug: string; format?: string }>();
  const { state, reload } = useArticle(slug);
  const { scale, idx, cycle } = useFontScale();
  const [progress, setProgress] = useState(0);
  const [saved, setSaved] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const chapters = useRef(new Map<number, RNView>());
  const [tocOpen, setTocOpen] = useState(false);
  const goChapter = (no: number) => {
    const node = chapters.current.get(no);
    const inner = scrollRef.current?.getInnerViewNode?.();
    setTocOpen(false);
    if (node && inner) node.measureLayout(inner as never, (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true }), () => {});
  };
  const [sentenceText, setSentenceText] = useState<string | null>(null);

  // 글이 열리면 열람 기록에 남기고, 저장(북마크) 여부를 읽는다.
  const ready = state.status === 'ready' ? state.data : null;
  const summary = ready
    ? {
        id: ready.post.id,
        title: displayHeadline(ready.post.headline),
        category: ready.post.category ?? null,
        imageUrl: ready.post.photo_image_url ?? ('cover_image_url' in ready.post ? ready.post.cover_image_url : null) ?? null,
      }
    : null;
  useEffect(() => {
    if (!summary) return;
    void history.add({ ...summary, at: Date.now() });
    void bookmarks.has(summary.id).then(setSaved);
    // 글이 바뀔 때만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary?.id]);
  const toggleSaved = () => {
    if (!summary) return;
    if (saved) void bookmarks.remove(summary.id);
    else void bookmarks.add({ ...summary, at: Date.now() });
    setSaved(!saved);
  };

  const share = (article: Article) => {
    const url = article.kind === 'lens' ? `${SITE}${lensPath(article.post)}` : `${SITE}/letters/${encodeURIComponent(article.post.id)}`;
    const title = displayHeadline(article.post.headline);
    // 안드로이드는 message 만, iOS 는 url 도 쓴다 — 둘 다 넣으면 어느 쪽에서도 링크가 공유된다.
    void Share.share({ title, message: `${title}\n${url}`, url }).catch(() => {});
  };

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerRight: () => (
            <View style={styles.tools}>
              <Pressable onPress={cycle} hitSlop={10} accessibilityRole="button" accessibilityLabel={`글자 크기 ${Math.round(FONT_SCALES[idx] * 100)}%`}>
                <Text style={styles.aa}>가<Text style={styles.aaBig}>가</Text></Text>
              </Pressable>
              {state.status === 'ready' ? (
                <Pressable onPress={toggleSaved} hitSlop={10} accessibilityRole="button" accessibilityState={{ selected: saved }} accessibilityLabel={saved ? '저장 취소' : '저장'}>
                  <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={24} color={saved ? '#2563eb' : colors.text} />
                </Pressable>
              ) : null}
              {state.status === 'ready' ? (
                <Pressable onPress={() => share(state.data)} hitSlop={10} accessibilityRole="button" accessibilityLabel="공유">
                  <Ionicons name="share-outline" size={24} color={colors.text} />
                </Pressable>
              ) : null}
            </View>
          ),
        }}
      />
      <View style={[styles.progress, { width: `${progress * 100}%` }]} />
      <AsyncView state={state} onRetry={reload}>
        {(article) => (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.content}
            scrollEventThrottle={64}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              const max = contentSize.height - layoutMeasurement.height;
              setProgress(max > 0 ? Math.min(1, Math.max(0, contentOffset.y / max)) : 0);
            }}
          >
            <ChapterContext.Provider value={{ register: (no, node) => (node ? chapters.current.set(no, node) : chapters.current.delete(no)) }}>
              {article.kind === 'lens' ? <LensArticle lens={article.post} scale={scale} onSaveText={setSentenceText} formatParam={format} onToc={() => setTocOpen(true)} /> : <LetterHead post={article.post} scale={scale} onSaveText={setSentenceText} />}
            </ChapterContext.Provider>
            <Footer article={article} />
          </ScrollView>
        )}
      </AsyncView>
      {ready && ready.kind === 'lens' ? <TocSheet open={tocOpen} lens={ready.post} onPick={goChapter} onClose={() => setTocOpen(false)} /> : null}
      {summary ? <SentenceSheet text={sentenceText} article={{ id: summary.id, title: summary.title, publishedAt: ready?.post.published_at }} onClose={() => setSentenceText(null)} /> : null}
    </View>
  );
}

function Meta({ category, when }: { category?: string | null; when: string }) {
  return (
    <Text style={styles.meta}>
      {[category ? displayCategoryLabel(category) : null, when].filter(Boolean).join('  ·  ')}
    </Text>
  );
}

function LensArticle({ lens, scale, onSaveText, formatParam, onToc }: { lens: LensPost; scale: number; onSaveText: (t: string) => void; formatParam?: string; onToc: () => void }) {
  const items = lens.lenses ?? [];
  // 데이터에 있는 형식만 탭으로(빈 탭으로 길을 막지 않음). 이름·아이콘·분량은 웹 formatAmount 와 같은 규칙.
  const tabs = FORMATS.map((f) => ({ ...f, item: items.find((l) => l.label === f.label) })).filter((t) => t.item);
  // 기본 탭: 온보딩 결과로 넘어온 format 파라미터 → 저장된 선호 형식 → 첫 탭. 형식 인덱스(레터0·웹툰1·팟캐스트2·영상3)를 데이터에 있는 탭 위치로 바꾼다.
  const [active, setActive] = useState(0);
  useEffect(() => {
    const pref = formatParam !== undefined && formatParam !== '' ? Number(formatParam) : null;
    void (pref !== null && Number.isInteger(pref) ? Promise.resolve(pref) : getPreferredFormat()).then((f) => {
      const at = f === null ? -1 : tabs.findIndex((t) => t.label === FORMATS[f]?.label);
      if (at >= 0) setActive(at);
    });
    // 글·파라미터가 바뀔 때만 한 번.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens.id, formatParam]);
  const current = tabs[Math.min(active, tabs.length - 1)];
  const picker: PickerTab[] = tabs.map((t) => ({ key: t.key, name: t.name, icon: t.icon, amount: formatAmount(t.key, t.item!) }));

  return (
    <View>
      <ArticleHeader lens={lens} scale={scale} />
      <ArticlePhoto lens={lens} />
      <SummaryCard bullets={coreSummary(lens)} scale={scale} />
      {tabs.length > 0 ? (
        <View style={{ marginTop: 32 }}>
          <Rule />
          <View style={{ marginTop: 10 }}>
            <FormatPicker tabs={picker} active={Math.min(active, tabs.length - 1)} onSelect={setActive} />
          </View>
          {current.label === '레터' && letterChapters(current.item!.paragraphs).length >= 2 ? (
            <Pressable style={styles.tocBtn} onPress={onToc} accessibilityRole="button">
              <Ionicons name="list-outline" size={18} color={colors.text} />
              <Text style={styles.tocText}>목차 {letterChapters(current.item!.paragraphs).length}개 구간</Text>
            </Pressable>
          ) : null}
          <View style={{ marginTop: 28 }}>
            <FormatPanel key={current.label} lens={lens} item={current.item!} scale={scale} onSaveText={onSaveText} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** 형식 선택기의 분량 표기 — 웹 formatAmount: 레터 약 N분 / 웹툰 N컷 / 팟캐스트·영상은 길이를 파일에서 읽어야 해서 로딩 전에는 "음성"·"영상", 없으면 "준비 중". */
function formatAmount(key: PickerTab['key'], item: LensItem): string {
  if (key === 'letter') {
    const chars = (item.paragraphs?.length ? item.paragraphs : item.bullets).join('').length;
    return chars > 0 ? `약 ${readMinutes(chars)}분` : '준비 중';
  }
  if (key === 'webtoon') return item.images?.length ? `${item.images.length}컷` : '준비 중';
  if (key === 'podcast') return item.media_url ? '음성' : '준비 중';
  return item.video_url ? '영상' : '준비 중';
}

function LetterHead({ post, scale, onSaveText }: { post: Article['post']; scale: number; onSaveText: (t: string) => void }) {
  const p = post as import('@ailens/api-client').LetterPost;
  return (
    <View>
      <Meta category={p.category} when={kstDateTime(p.published_at, p.publish_date)} />
      <Text style={styles.title}>{displayHeadline(p.headline)}</Text>
      <PlainPhoto uri={p.photo_image_url ?? p.cover_image_url} />
      <LetterArticle post={p} scale={scale} onSaveText={onSaveText} />
    </View>
  );
}

function TocSheet({ open, lens, onPick, onClose }: { open: boolean; lens: LensPost; onPick: (no: number) => void; onClose: () => void }) {
  const chapters = letterChapters(lens.lenses?.find((l) => l.label === '레터')?.paragraphs);
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="닫기" />
      <View style={styles.tocSheet}>
        <Text style={styles.tocHead}>목차</Text>
        {chapters.map((c, i) => (
          <Pressable key={c.id} style={styles.tocRow} onPress={() => onPick(i)} accessibilityRole="button">
            <Text style={styles.tocNo}>{String(i + 1).padStart(2, '0')}</Text>
            <Text style={styles.tocLabel} numberOfLines={2}>{c.full}</Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

function Footer({ article }: { article: Article }) {
  const source = article.post.source_url;
  const category = article.post.category;
  const [copied, setCopied] = useState(false);
  const link = article.kind === 'lens' ? `${SITE}${lensPath(article.post)}` : `${SITE}/letters/${encodeURIComponent(article.post.id)}`;
  return (
    <View style={styles.footer}>
      <Pressable
        style={styles.sourceBtn}
        onPress={() => void Clipboard.setStringAsync(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
        accessibilityRole="button"
      >
        <Ionicons name={copied ? 'checkmark' : 'link-outline'} size={16} color={colors.text} />
        <Text style={styles.sourceText}>{copied ? '링크를 복사했어요' : '링크 복사'}</Text>
      </Pressable>
      <View style={{ height: 10 }} />
      {source ? (
        <Pressable onPress={() => Linking.openURL(source)} style={styles.sourceBtn} accessibilityRole="link">
          <Text style={styles.sourceText}>기사 원문 보기</Text>
          <Ionicons name="open-outline" size={16} color={colors.text} />
        </Pressable>
      ) : null}
      <Text style={styles.disclaimer}>AI LENS는 서울경제 기사를 바탕으로 AI가 재구성한 콘텐츠예요. 중요한 판단 전에는 원문을 확인해 주세요.</Text>
      {article.prev || article.next ? (
        <View style={styles.neighbors}>
          {article.next ? <Neighbor label="다음 글(최근)" post={article.next} /> : null}
          {article.prev ? <Neighbor label="이전 글" post={article.prev} /> : null}
        </View>
      ) : null}
      {article.related.length > 0 ? (
        <View style={styles.related}>
          <Text style={styles.relatedHead}>{category && categoryForDataLabel(category) ? `${displayCategoryLabel(category)}의 다른 글` : '다른 글'}</Text>
          {article.related.map((r) => (
            <Link key={r.id} href={{ pathname: '/article/[slug]', params: { slug: r.id } }} asChild>
              <Pressable style={styles.relRow} accessibilityRole="link">
                <Text style={styles.relTitle} numberOfLines={2}>{displayHeadline(r.headline)}</Text>
                <Text style={styles.relMeta}>{kstDateTime(r.published_at, r.date)}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PlainPhoto({ uri }: { uri?: string | null }) {
  if (!uri) return null;
  return <Image source={{ uri }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 16, marginBottom: 16, backgroundColor: colors.imagePlaceholder }} resizeMode="cover" />;
}

function Neighbor({ label, post }: { label: string; post: LensPost }) {
  return (
    <Link href={{ pathname: '/article/[slug]', params: { slug: post.id } }} asChild>
      <Pressable style={styles.neighbor} accessibilityRole="link">
        <Text style={styles.nbLabel}>{label}</Text>
        <Text style={styles.nbTitle} numberOfLines={2}>{displayHeadline(post.headline)}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  tocBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 14, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#f3f4f6' },
  tocText: { fontSize: 13, fontWeight: '700', color: colors.text },
  scrim: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)' },
  tocSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  tocHead: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 6 },
  tocRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  tocNo: { width: 24, fontSize: 13, fontWeight: '800', color: '#5b8def', marginTop: 2 },
  tocLabel: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.text },
  neighbors: { marginTop: 28, gap: 10 },
  neighbor: { padding: 14, borderRadius: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: colors.line },
  nbLabel: { fontSize: 12, fontWeight: '800', color: colors.textFaint },
  nbTitle: { marginTop: 4, fontSize: 15.5, lineHeight: 22, fontWeight: '700', color: colors.text },
  root: { flex: 1, backgroundColor: colors.bg },
  progress: { height: 2, backgroundColor: '#2563eb', zIndex: 2 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  aa: { fontSize: 14, fontWeight: '700', color: colors.text },
  aaBig: { fontSize: 19 },
  content: { padding: 20, paddingBottom: 56 },
  meta: { fontSize: 12.5, fontWeight: '700', color: '#2563eb' },
  title: { marginTop: 8, marginBottom: 16, fontFamily: FONT.serif, fontSize: 26, lineHeight: 36, letterSpacing: -0.5, color: colors.text },
  lede: { marginTop: 16, color: '#374151' },
  tabs: { flexDirection: 'row', marginTop: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  tab: { flex: 1, alignItems: 'center', paddingTop: 10, gap: 4 },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textFaint, paddingBottom: 8 },
  tabTextOn: { color: '#2563eb', fontWeight: '800' },
  ind: { height: 2, alignSelf: 'stretch', backgroundColor: 'transparent' },
  indOn: { backgroundColor: '#2563eb' },
  footer: { marginTop: 40, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  sourceBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, backgroundColor: '#f3f4f6' },
  sourceText: { fontSize: 14, fontWeight: '700', color: colors.text },
  disclaimer: { marginTop: 16, fontSize: 12.5, lineHeight: 19, color: colors.textFaint },
  related: { marginTop: 32 },
  relatedHead: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, color: colors.text, marginBottom: 6 },
  relRow: { paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  relTitle: { fontSize: 16, lineHeight: 23, fontWeight: '600', color: colors.text },
  relMeta: { marginTop: 4, fontSize: 12, color: colors.textFaint },
});
