import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listPosts, type HomePlayerPost } from '@ailens/api-client';
import { displayHeadline } from '@ailens/domain';
import { AppHeader } from '../../src/components/AppHeader';
import { AsyncView } from '../../src/components/AsyncView';
import { MiniPlayer } from '../../src/components/MiniPlayer';
import { kstDateTime } from '../../src/lib/format';
import { useAsync } from '../../src/lib/useAsync';
import { colors } from '../../src/theme';

// 듣기 — "오늘의 뉴스를 귀로"(home_player 채널) 전체 목록. 재생은 미니 플레이어 연결(M4, expo-audio)에서 붙인다.
export default function ListenScreen() {
  const { state, reload } = useAsync((signal) => listPosts<HomePlayerPost>('home_player', { limit: 50, signal }), []);
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <AppHeader />
      <View style={styles.body}>
        <AsyncView state={state} onRetry={reload}>
          {(items: HomePlayerPost[]) => (
            <FlatList
              data={items}
              keyExtractor={(a) => a.id}
              contentContainerStyle={styles.list}
              ListHeaderComponent={
                <View style={styles.head}>
                  <Text style={styles.title}>오늘의 뉴스를 귀로</Text>
                  <Text style={styles.sub}>출근길에 듣는 오늘의 핵심 {items.length}건</Text>
                </View>
              }
              ListEmptyComponent={<Text style={styles.empty}>아직 올라온 오디오가 없어요.</Text>}
              renderItem={({ item, index }) => (
                <Link href={{ pathname: '/article/[slug]', params: { slug: item.id } }} asChild>
                  <Pressable style={styles.row} accessibilityRole="link">
                    <Text style={styles.no}>{index + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {displayHeadline(item.title)}
                      </Text>
                      <Text style={styles.meta}>{[item.category, kstDateTime(item.published_at, item.date)].filter(Boolean).join('  ')}</Text>
                    </View>
                    <Ionicons name="headset-outline" size={20} color={colors.textFaint} />
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
  list: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  head: { marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  sub: { marginTop: 6, fontSize: 13.5, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  no: { width: 24, fontSize: 16, fontWeight: '800', color: colors.beta.text },
  rowTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.text },
  meta: { marginTop: 4, fontSize: 12, color: colors.textFaint },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
