import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { getPost, type WebtoonPost } from '@ailens/api-client';
import { displayHeadline } from '@ailens/domain';
import { AsyncView } from '../../src/components/AsyncView';
import { WebtoonCuts } from '../../src/components/WebtoonCuts';
import { kstDateTime } from '../../src/lib/format';
import { useAsync } from '../../src/lib/useAsync';
import { colors } from '../../src/theme';

// 웹툰 보기 — 컷을 세로로 이어 읽는다(컷 렌더는 WebtoonCuts, 기사 상세의 웹툰 형식과 같은 컴포넌트).
export default function WebtoonView() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { state, reload } = useAsync((signal) => getPost<WebtoonPost>(slug, { channel: 'webtoon', signal }), [slug]);
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: '웹툰' }} />
      <AsyncView state={state} onRetry={reload}>
        {(post) => (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.head}>
              <Text style={styles.meta}>{[post.category, kstDateTime(post.published_at, post.date)].filter(Boolean).join('  ')}</Text>
              <Text style={styles.title}>{displayHeadline(post.title)}</Text>
              {post.excerpt ? <Text style={styles.excerpt}>{post.excerpt}</Text> : null}
            </View>
            <WebtoonCuts panels={post.panels ?? []} />
            {(post.panels ?? []).length === 0 ? <Text style={styles.empty}>컷을 불러오지 못했어요.</Text> : null}
          </ScrollView>
        )}
      </AsyncView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 48 },
  head: { padding: 20, paddingBottom: 16 },
  meta: { fontSize: 12.5, fontWeight: '700', color: colors.beta.text },
  title: { marginTop: 8, fontSize: 22, lineHeight: 30, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  excerpt: { marginTop: 10, fontSize: 14, lineHeight: 21, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
