import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/ui/Text';
import { Link, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listPosts, type VideoPost } from '@ailens/api-client';
import { displayHeadline } from '@ailens/domain';
import { AsyncView } from '../../src/components/AsyncView';
import { kstDateTime } from '../../src/lib/format';
import { useAsync } from '../../src/lib/useAsync';
import { colors, radius } from '../../src/theme';

// 영상 목록 — 16:9 썸네일 카드 한 줄씩. 웹 /video 대응.
export default function VideoList() {
  const { state, reload } = useAsync((signal) => listPosts<VideoPost>('video', { limit: 100, signal }), []);
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: '영상' }} />
      <AsyncView state={state} onRetry={reload}>
        {(items: VideoPost[]) => (
          <FlatList
            data={items}
            keyExtractor={(v) => v.id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={{ height: 24 }} />}
            ListEmptyComponent={<Text style={styles.empty}>아직 올라온 영상이 없어요.</Text>}
            renderItem={({ item }) => (
              <Link href={{ pathname: '/video/[slug]', params: { slug: item.id } }} asChild>
                <Pressable accessibilityRole="link">
                  <View style={styles.thumb}>
                    {item.thumbnail_url ? <Image source={{ uri: item.thumbnail_url }} style={styles.img} resizeMode="cover" /> : null}
                    <View style={styles.play}>
                      <Ionicons name="play" size={22} color="#fff" style={{ marginLeft: 2 }} />
                    </View>
                  </View>
                  <Text style={styles.title} numberOfLines={2}>
                    {displayHeadline(item.title)}
                  </Text>
                  <Text style={styles.meta}>{kstDateTime(item.published_at, item.date)}</Text>
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
  thumb: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: '#111827' },
  img: { width: '100%', height: '100%' },
  play: { position: 'absolute', right: 12, bottom: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(16,28,61,0.85)', alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 10, fontSize: 17, lineHeight: 24, fontWeight: '700', color: colors.text },
  meta: { marginTop: 4, fontSize: 12, color: colors.textFaint },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
