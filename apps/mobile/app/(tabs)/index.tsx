import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listPosts, type LetterPost } from '@ailens/api-client';
import { AsyncView } from '../../src/components/AsyncView';
import { PostCard } from '../../src/components/PostCard';
import { useAsync } from '../../src/lib/useAsync';

// 홈 — 오늘의 레터(읽기 전용). 웹 / 의 레터 영역에 대응. 제목은 @ailens/domain 의 displayHeadline 을 PostCard 에서 쓴다.
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { state, reload } = useAsync((signal) => listPosts<LetterPost>('letters', { limit: 20, signal }), []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AsyncView state={state} onRetry={reload}>
        {(posts) => (
          <FlatList
            data={posts}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.header}>
                <Text style={styles.badge}>AI LENS</Text>
                <Text style={styles.h1}>오늘의 한 통</Text>
              </View>
            }
            ListEmptyComponent={<Text style={styles.empty}>아직 올라온 글이 없어요.</Text>}
            renderItem={({ item }) => (
              <PostCard
                id={item.id}
                title={item.headline}
                summary={item.subtitle}
                category={item.category}
                date={item.publish_date ?? item.published_at}
                imageUrl={item.photo_image_url ?? item.cover_image_url}
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
  header: { marginBottom: 16 },
  badge: { color: '#8ab4ff', fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  h1: { color: '#f5f5f5', fontSize: 28, fontWeight: '700', marginTop: 8 },
  empty: { color: '#9aa0a6', textAlign: 'center', marginTop: 40 },
});
