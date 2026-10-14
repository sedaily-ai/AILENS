import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { displayHeadline } from '@ailens/domain';
import { getPost, type LensPost, type LetterPost } from '@ailens/api-client';
import { AsyncView } from '../../src/components/AsyncView';
import { useAsync } from '../../src/lib/useAsync';
import { dateLabel } from '../../src/lib/format';

type Post = LetterPost | LensPost;

// lens 글은 lenses[] 를 가진다. letters 와 모양이 달라 이것으로 구분한다.
const isLens = (p: Post): p is LensPost => 'lenses' in p && Array.isArray((p as LensPost).lenses);

// 기사 상세(읽기 전용). 딥링크 ailens://article/<slug>, slug = 글 id. 리치텍스트(body_html)·차트·이미지 삽입은 M4.
export default function ArticleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { state, reload } = useAsync((signal) => getPost<Post>(slug, signal), [slug]);

  return (
    <View style={styles.root}>
      <AsyncView state={state} onRetry={reload}>
        {(post) => (
          <ScrollView contentContainerStyle={styles.content}>
            <Stack.Screen options={{ title: '' }} />
            {(post.photo_image_url ?? post.cover_image_url) ? (
              <Image source={{ uri: (post.photo_image_url ?? post.cover_image_url) as string }} style={styles.image} />
            ) : null}
            <Text style={styles.meta}>
              {[post.category, dateLabel(isLens(post) ? (post.published_at ?? post.date) : (post.publish_date ?? post.published_at))]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text style={styles.title}>{displayHeadline(post.headline)}</Text>
            {isLens(post) ? <LensBody post={post} /> : <LetterBody post={post} />}
            {post.source_url ? (
              <Pressable onPress={() => Linking.openURL(post.source_url as string)} accessibilityRole="link">
                <Text style={styles.source}>원문 기사 보기</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </AsyncView>
    </View>
  );
}

function LetterBody({ post }: { post: LetterPost }) {
  return (
    <>
      {post.subtitle ? <Text style={styles.subtitle}>{post.subtitle}</Text> : null}
      {post.body.map((para, i) => (
        <Text key={i} style={styles.para}>
          {para}
        </Text>
      ))}
    </>
  );
}

function LensBody({ post }: { post: LensPost }) {
  return (
    <>
      {post.context ? <Text style={styles.subtitle}>{post.context}</Text> : null}
      {post.lenses.map((l, i) => (
        <View key={i} style={styles.lensCard}>
          <Text style={styles.lensLabel}>{l.label}</Text>
          <Text style={styles.lensQuestion}>{l.question}</Text>
          {(l.paragraphs?.length ? l.paragraphs : l.bullets).map((t, j) => (
            <Text key={j} style={styles.para}>
              {l.paragraphs?.length ? t : `• ${t}`}
            </Text>
          ))}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 16, paddingBottom: 48 },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: '#f3f4f6', marginBottom: 16 },
  meta: { color: '#2563eb', fontSize: 12, fontWeight: '600' },
  title: { color: '#111827', fontSize: 24, fontWeight: '700', lineHeight: 32, marginTop: 8 },
  subtitle: { color: '#4b5563', fontSize: 15, lineHeight: 23, marginTop: 12 },
  para: { color: '#1f2937', fontSize: 16, lineHeight: 26, marginTop: 14 },
  lensCard: { backgroundColor: '#f8f9fa', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', padding: 14, marginTop: 16 },
  lensLabel: { color: '#2563eb', fontSize: 12, fontWeight: '700' },
  lensQuestion: { color: '#111827', fontSize: 17, fontWeight: '700', lineHeight: 25, marginTop: 6 },
  source: { color: '#2563eb', fontSize: 14, marginTop: 28, textDecorationLine: 'underline' },
});
