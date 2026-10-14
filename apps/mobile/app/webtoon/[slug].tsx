import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { getPost, type WebtoonPost } from '@ailens/api-client';
import { displayHeadline } from '@ailens/domain';
import { AsyncView } from '../../src/components/AsyncView';
import { kstDateTime } from '../../src/lib/format';
import { useAsync } from '../../src/lib/useAsync';
import { colors } from '../../src/theme';

// 웹툰 보기 — 컷을 세로로 이어 읽는다. 컷 높이는 이미지가 로드되면 원본 비율로 맞춘다.
// caption 은 컷 이미지에 이미 박혀 있는 경우가 대부분이라, text_caption 컷만 아래에 글자로 보여 준다(웹과 같은 규칙).
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
            {(post.panels ?? []).map((p, i) => (
              <Panel key={`${p.url}-${i}`} url={p.url} caption={p.text_caption ? p.caption : ''} />
            ))}
            {(post.panels ?? []).length === 0 ? <Text style={styles.empty}>컷을 불러오지 못했어요.</Text> : null}
          </ScrollView>
        )}
      </AsyncView>
    </View>
  );
}

function Panel({ url, caption }: { url: string; caption: string }) {
  const [ratio, setRatio] = useState(1);
  return (
    <View>
      <Image
        source={{ uri: url }}
        style={{ width: '100%', aspectRatio: ratio, backgroundColor: colors.imagePlaceholder }}
        resizeMode="cover"
        onLoad={(e) => {
          const { width, height } = e.nativeEvent.source;
          if (width && height) setRatio(width / height);
        }}
        accessibilityLabel={caption || undefined}
      />
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
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
  caption: { paddingHorizontal: 20, paddingVertical: 16, fontSize: 16, lineHeight: 26, color: '#1f2937', backgroundColor: '#fff' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
