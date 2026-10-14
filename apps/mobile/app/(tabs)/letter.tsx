import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listPosts, type LetterPost } from '@ailens/api-client';
import { AsyncView } from '../../src/components/AsyncView';
import { PostCard } from '../../src/components/PostCard';
import { useAsync } from '../../src/lib/useAsync';

// 레터 아카이브(읽기 전용) — 최근 발행분을 길게 훑는다. 웹 /letter 대응. 날짜·카테고리 필터는 M4.
export default function LetterScreen() {
  const insets = useSafeAreaInsets();
  const { state, reload } = useAsync((signal) => listPosts<LetterPost>('letters', { limit: 100, signal }), []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AsyncView state={state} onRetry={reload}>
        {(posts) => (
          <FlatList
            data={posts}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={<Text style={styles.h1}>레터</Text>}
            ListEmptyComponent={<Text style={styles.empty}>아직 올라온 글이 없어요.</Text>}
            renderItem={({ item }) => (
              <PostCard
                id={item.id}
                title={item.headline}
                summary={item.subtitle}
                category={item.category}
                date={item.publish_date ?? item.published_at}
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
