import { useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { categoryForDataLabel, displayCategoryLabel, displayHeadline, lensPath, readMinutes } from '@ailens/domain';
import type { LensPost } from '@ailens/api-client';
import { AsyncView } from '../../components/AsyncView';
import { kstDateTime } from '../../lib/format';
import { colors } from '../../theme';
import { FONT_SCALES, useFontScale } from './FontScale';
import { FormatPanel, FORMATS, PhotoHeader } from './FormatPanels';
import { LetterArticle } from './LetterArticle';
import { useArticle, type Article } from './useArticle';

const SITE = 'https://ailens.sedaily.ai';

/**
 * 기사 상세 — 웹 LensViewClient / letters 상세 대응. LENS 글은 4가지 형식 탭(읽기·웹툰·듣기·영상), letters 글은 본문 한 벌.
 * 헤더에 글자 크기·공유, 상단에 읽기 진행바. 하단에 원문 링크와 같은 분류의 다른 글.
 */
export function ArticleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { state, reload } = useArticle(slug);
  const { scale, idx, cycle } = useFontScale();
  const [progress, setProgress] = useState(0);

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
            contentContainerStyle={styles.content}
            scrollEventThrottle={64}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              const max = contentSize.height - layoutMeasurement.height;
              setProgress(max > 0 ? Math.min(1, Math.max(0, contentOffset.y / max)) : 0);
            }}
          >
            {article.kind === 'lens' ? <LensArticle lens={article.post} scale={scale} /> : <LetterHead post={article.post} scale={scale} />}
            <Footer article={article} />
          </ScrollView>
        )}
      </AsyncView>
    </View>
  );
}

function Meta({ category, when, readMin }: { category?: string | null; when: string; readMin?: number | null }) {
  return (
    <Text style={styles.meta}>
      {[category ? displayCategoryLabel(category) : null, when, readMin ? `약 ${readMin}분` : null].filter(Boolean).join('  ·  ')}
    </Text>
  );
}

function LensArticle({ lens, scale }: { lens: LensPost; scale: number }) {
  const items = lens.lenses ?? [];
  // 형식 이름 → 탭. 데이터에 없는 형식은 탭에서 뺀다(빈 탭으로 길을 막지 않음).
  const tabs = FORMATS.map((f) => ({ ...f, item: items.find((l) => l.label === f.label) })).filter((t) => t.item);
  const [active, setActive] = useState(0);
  const current = tabs[Math.min(active, tabs.length - 1)];
  const letter = items.find((l) => l.label === '레터');
  const readMin = letter?.paragraphs?.length ? readMinutes(letter.paragraphs.join('').length) : null;

  return (
    <View>
      <Meta category={lens.category} when={kstDateTime(lens.published_at, lens.date)} readMin={readMin} />
      <Text style={styles.title}>{displayHeadline(lens.headline)}</Text>
      <PhotoHeader uri={lens.photo_image_url} />

      {tabs.length > 0 ? (
        <>
          <View style={styles.tabs} accessibilityRole="tablist">
            {tabs.map((t, i) => {
              const on = current === t;
              return (
                <Pressable key={t.label} style={styles.tab} onPress={() => setActive(i)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  <Ionicons name={t.icon} size={20} color={on ? '#2563eb' : colors.textFaint} />
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.tab}</Text>
                  <View style={[styles.ind, on && styles.indOn]} />
                </Pressable>
              );
            })}
          </View>
          <FormatPanel key={current.label} lens={lens} item={current.item!} scale={scale} />
        </>
      ) : lens.context ? (
        <Text style={[styles.lede, { fontSize: 16 * scale, lineHeight: 26 * scale }]}>{lens.context}</Text>
      ) : null}
    </View>
  );
}

function LetterHead({ post, scale }: { post: Article['post']; scale: number }) {
  const p = post as import('@ailens/api-client').LetterPost;
  return (
    <View>
      <Meta category={p.category} when={kstDateTime(p.published_at, p.publish_date)} />
      <Text style={styles.title}>{displayHeadline(p.headline)}</Text>
      <PhotoHeader uri={p.photo_image_url ?? p.cover_image_url} />
      <LetterArticle post={p} scale={scale} />
    </View>
  );
}

function Footer({ article }: { article: Article }) {
  const source = article.post.source_url;
  const category = article.post.category;
  return (
    <View style={styles.footer}>
      {source ? (
        <Pressable onPress={() => Linking.openURL(source)} style={styles.sourceBtn} accessibilityRole="link">
          <Text style={styles.sourceText}>기사 원문 보기</Text>
          <Ionicons name="open-outline" size={16} color={colors.text} />
        </Pressable>
      ) : null}
      <Text style={styles.disclaimer}>AI LENS는 서울경제 기사를 바탕으로 AI가 재구성한 콘텐츠예요. 중요한 판단 전에는 원문을 확인해 주세요.</Text>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  progress: { height: 2, backgroundColor: '#2563eb', zIndex: 2 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  aa: { fontSize: 14, fontWeight: '700', color: colors.text },
  aaBig: { fontSize: 19 },
  content: { padding: 20, paddingBottom: 56 },
  meta: { fontSize: 12.5, fontWeight: '700', color: '#2563eb' },
  title: { marginTop: 8, marginBottom: 16, fontSize: 26, lineHeight: 36, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
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
