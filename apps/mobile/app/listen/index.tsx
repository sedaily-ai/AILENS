import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../src/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, Stack } from 'expo-router';
import { Headphones, Play } from '../../src/ui/icons';
import { usePlayer } from '../../src/features/player/PlayerContext';
import { listPosts, type HomePlayerPost } from '@ailens/api-client';
import { displayHeadline } from '@ailens/domain';
import { AppHeader } from '../../src/components/AppHeader';
import { AsyncView } from '../../src/components/AsyncView';
import { MiniPlayer } from '../../src/components/MiniPlayer';
import { kstDateTime } from '../../src/lib/format';
import { useAsync } from '../../src/lib/useAsync';
import { colors } from '../../src/theme';

// 듣기 — "오늘의 뉴스를 귀로"(home_player 채널) 전체 목록. 항목을 누르면 /listen/[slug] 가 열리며 그 곡부터 재생한다(전역 PlayerProvider).
export default function ListenScreen() {
  const { playDefault } = usePlayer();
  const { state, reload } = useAsync((signal) => listPosts<HomePlayerPost>('home_player', { limit: 50, signal }), []);
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader title="듣기" back />
      <View style={styles.body}>
        <AsyncView state={state} onRetry={reload}>
          {(items: HomePlayerPost[]) => (
            <FlatList
              data={items}
              keyExtractor={(a) => a.id}
              contentContainerStyle={styles.list}
              ListHeaderComponent={
                <View style={styles.head}>
                  <View style={styles.hero}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.title}>오늘의 뉴스를 귀로</Text>
                      <Text style={styles.sub}>출근길에 듣는 오늘의 핵심 {items.length}건</Text>
                    </View>
                    <Pressable style={({ pressed }) => [styles.playAll, pressed && { opacity: 0.85 }]} onPress={() => void playDefault()} accessibilityRole="button" accessibilityLabel="전체 재생">
                      <Play size={20} color={colors.brand} weight="fill" />
                      <Text style={styles.playAllText}>전체 재생</Text>
                    </Pressable>
                  </View>
                </View>
              }
              ListEmptyComponent={<Text style={styles.empty}>아직 올라온 오디오가 없어요.</Text>}
              renderItem={({ item, index }) => (
                <Link href={{ pathname: '/listen/[slug]', params: { slug: item.id } }} asChild>
                  <Pressable style={styles.row} accessibilityRole="link">
                    <View style={styles.noBox}><Text style={styles.no}>{index + 1}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {displayHeadline(item.title)}
                      </Text>
                      <Text style={styles.meta}>{[item.category, kstDateTime(item.published_at, item.date)].filter(Boolean).join('  ')}</Text>
                    </View>
                    <Headphones size={22} color={colors.textFaint} />
                  </Pressable>
                </Link>
              )}
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
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  head: { marginBottom: 14 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderRadius: 22, backgroundColor: colors.brand },
  title: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4, color: '#fff' },
  sub: { marginTop: 4, fontSize: 13.5, color: 'rgba(255,255,255,0.72)' },
  playAll: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#fff' },
  playAllText: { fontSize: 14, fontWeight: '800', color: colors.brand },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  noBox: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f1f3f6', alignItems: 'center', justifyContent: 'center' },
  no: { fontSize: 13.5, fontWeight: '800', color: colors.textSub },
  rowTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2, color: colors.text },
  meta: { marginTop: 4, fontSize: 12, color: colors.textFaint },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
