import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listPosts, type LensPost, type LetterPost } from '@ailens/api-client';
import { ECON_CATEGORIES, categoryForDataLabel } from '@ailens/domain';
import { AppHeader } from '../../src/components/AppHeader';
import { AsyncView } from '../../src/components/AsyncView';
import { CategoryChips } from '../../src/components/CategoryChips';
import { GridCard } from '../../src/components/GridCard';
import { MiniPlayer } from '../../src/components/MiniPlayer';
import { buildLatest, type FeedItem } from '../../src/features/home/model';
import { useAsync } from '../../src/lib/useAsync';
import { colors } from '../../src/theme';

// 카테고리 목록 — 해당 분류의 최신 글(레터+LENS 병합)을 2열로. 하위 카테고리·페이지네이션은 이후 단계.
export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const category = ECON_CATEGORIES.find((c) => c.slug === slug);
  const { state, reload } = useAsync(async (signal) => {
    const [letters, lens] = await Promise.all([
      listPosts<LetterPost>('letters', { limit: 100, signal }),
      listPosts<LensPost>('lens', { limit: 100, signal }),
    ]);
    return buildLatest(letters, lens).filter((i) => categoryForDataLabel(i.category)?.slug === slug);
  }, [slug]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader />
      <CategoryChips active={slug} />
      <View style={styles.body}>
        <AsyncView state={state} onRetry={reload}>
          {(items: FeedItem[]) => (
            <FlatList
              data={items}
              numColumns={2}
              keyExtractor={(i) => i.id}
              columnWrapperStyle={styles.col}
              contentContainerStyle={styles.list}
              ListHeaderComponent={
                <View style={styles.head}>
                  <Text style={[styles.title, category && { color: category.accent }]}>{category?.label ?? '카테고리'}</Text>
                  {category ? <Text style={styles.desc}>{category.description}</Text> : null}
                </View>
              }
              ListEmptyComponent={<Text style={styles.empty}>아직 올라온 글이 없어요.</Text>}
              renderItem={({ item }) => <GridCard item={item} />}
            />
          )}
        </AsyncView>
      </View>
      <MiniPlayer />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  list: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  col: { gap: 16, marginBottom: 28 },
  head: { marginBottom: 20 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  desc: { marginTop: 6, fontSize: 13.5, lineHeight: 20, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
