import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listPosts, type LensPost } from '@ailens/api-client';
import { AsyncView } from '../../src/components/AsyncView';
import { PostCard } from '../../src/components/PostCard';
import { useAsync } from '../../src/lib/useAsync';

// LENS 피드(읽기 전용) — 기사 하나를 여러 시선으로 풀어주는 카드. 웹 /lens 대응.
export default function LensScreen() {
  const insets = useSafeAreaInsets();
  const { state, reload } = useAsync((signal) => listPosts<LensPost>('lens', { limit: 20, signal }), []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AsyncView state={state} onRetry={reload}>
        {(posts) => (
          <FlatList
            data={posts}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={<Text style={styles.h1}>LENS</Text>}
            ListEmptyComponent={<Text style={styles.empty}>아직 올라온 글이 없어요.</Text>}
            renderItem={({ item }) => (
              <PostCard
                id={item.id}
                title={item.headline}
                summary={item.context}
                category={item.category}
                date={item.published_at ?? item.date}
                imageUrl={item.photo_image_url}
              />
            )}
            onRefresh={reload}
            refreshing={false}
          />
        )}
      </AsyncView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0c' },
  list: { padding: 16 },
  h1: { color: '#f5f5f5', fontSize: 28, fontWeight: '700', marginBottom: 16 },
  empty: { color: '#9aa0a6', textAlign: 'center', marginTop: 40 },
});
