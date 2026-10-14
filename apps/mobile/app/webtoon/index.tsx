import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, Stack } from 'expo-router';
import { listPosts, type WebtoonPost } from '@ailens/api-client';
import { displayHeadline } from '@ailens/domain';
import { AsyncView } from '../../src/components/AsyncView';
import { kstDateTime } from '../../src/lib/format';
import { useAsync } from '../../src/lib/useAsync';
import { colors, radius } from '../../src/theme';

// 웹툰 목록 — 표지 2열 그리드. 웹 /webtoon 대응(카테고리 칩·편집국 추천 레일은 이후 단계).
export default function WebtoonList() {
  const { state, reload } = useAsync((signal) => listPosts<WebtoonPost>('webtoon', { limit: 100, signal }), []);
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: '웹툰' }} />
      <AsyncView state={state} onRetry={reload}>
        {(items: WebtoonPost[]) => (
          <FlatList
            data={items}
            numColumns={2}
            keyExtractor={(w) => w.id}
            columnWrapperStyle={styles.col}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>아직 올라온 웹툰이 없어요.</Text>}
            renderItem={({ item }) => (
              <Link href={{ pathname: '/webtoon/[slug]', params: { slug: item.id } }} asChild>
                <Pressable style={styles.card} accessibilityRole="link">
                  <View style={styles.cover}>{item.cover_image_url ? <Image source={{ uri: item.cover_image_url }} style={styles.img} resizeMode="cover" /> : null}</View>
                  <Text style={styles.title} numberOfLines={2}>
                    {displayHeadline(item.title)}
                  </Text>
                  <Text style={styles.meta}>{[item.category, kstDateTime(item.published_at, item.date)].filter(Boolean).join('  ')}</Text>
                </Pressable>
              </Link>
            )}
          />
        )}
      </AsyncView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 20, paddingBottom: 40 },
  col: { gap: 16, marginBottom: 24 },
  card: { flex: 1 },
  cover: { width: '100%', aspectRatio: 4 / 5, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: colors.imagePlaceholder },
  img: { width: '100%', height: '100%' },
  title: { marginTop: 8, fontSize: 14.5, lineHeight: 20, fontWeight: '700', color: colors.text },
  meta: { marginTop: 4, fontSize: 12, color: colors.textFaint },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
