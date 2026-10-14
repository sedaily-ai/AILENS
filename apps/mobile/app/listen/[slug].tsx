import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../src/ui/Text';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPost, listPosts, type HomePlayerPost } from '@ailens/api-client';
import { displayHeadline } from '@ailens/domain';
import { AsyncView } from '../../src/components/AsyncView';
import { usePlayer } from '../../src/features/player/PlayerContext';
import { kstDateTime } from '../../src/lib/format';
import { useAsync } from '../../src/lib/useAsync';
import { colors } from '../../src/theme';

const RATES = [1, 1.25, 1.5, 2];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// 오디오 상세 — 전체 플레이어 + 대본. 진입 시 이 곡이 재생 중이 아니면 오늘의 오디오 큐에서 이 곡부터 재생한다(웹 /listen/[slug] 대응).
export default function ListenDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const player = usePlayer();
  const [trackW, setTrackW] = useState(0);
  const { state, reload } = useAsync(async (signal) => {
    const [post, list] = await Promise.all([
      getPost<HomePlayerPost>(slug, { channel: 'home_player', signal }),
      listPosts<HomePlayerPost>('home_player', { limit: 50, signal }).catch(() => [] as HomePlayerPost[]),
    ]);
    return { post, list: list.filter((p) => p.media_embed_url) };
  }, [slug]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    const { post, list } = state.data;
    if (player.current?.id === post.id) return;
    const i = list.findIndex((p) => p.id === post.id);
    if (i >= 0) player.playQueue(list, i);
    else if (post.media_embed_url) player.playQueue([post], 0);
    // 진입 시 한 번만 큐를 맞춘다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status === 'ready' ? state.data.post.id : null]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: '듣기' }} />
      <AsyncView state={state} onRetry={reload}>
        {({ post }) => {
          const active = player.current?.id === post.id;
          const pos = active ? player.position : 0;
          const dur = active ? player.duration : 0;
          return (
            <ScrollView contentContainerStyle={styles.content}>
              <View style={styles.art}>
                <Ionicons name="headset" size={64} color={colors.brand} />
              </View>
              <Text style={styles.meta}>{[post.category, kstDateTime(post.published_at, post.date)].filter(Boolean).join('  ')}</Text>
              <Text style={styles.title}>{displayHeadline(post.title)}</Text>

              <View style={styles.seekWrap}>
                <Pressable
                  style={styles.trackHit}
                  onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
                  onPress={(e) => active && dur > 0 && trackW > 0 && player.seekTo((e.nativeEvent.locationX / trackW) * dur)}
                  accessibilityRole="adjustable"
                  accessibilityLabel="재생 위치"
                >
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: dur > 0 ? `${Math.min(100, (pos / dur) * 100)}%` : '0%' }]} />
                  </View>
                </Pressable>
                <View style={styles.times}>
                  <Text style={styles.time}>{mmss(pos)}</Text>
                  <Text style={styles.time}>{mmss(dur)}</Text>
                </View>
              </View>

              <View style={styles.controls}>
                <Pressable onPress={() => player.seekTo(Math.max(0, pos - 15))} hitSlop={10} accessibilityRole="button" accessibilityLabel="15초 뒤로">
                  <Ionicons name="play-back" size={28} color={colors.text} />
                </Pressable>
                <Pressable onPress={player.prev} hitSlop={10} accessibilityRole="button" accessibilityLabel="이전 곡">
                  <Ionicons name="play-skip-back" size={28} color={colors.text} />
                </Pressable>
                <Pressable style={styles.big} onPress={() => (active ? player.toggle() : undefined)} accessibilityRole="button" accessibilityLabel={player.playing && active ? '일시정지' : '재생'}>
                  <Ionicons name={player.playing && active ? 'pause' : 'play'} size={32} color="#fff" style={{ marginLeft: player.playing && active ? 0 : 3 }} />
                </Pressable>
                <Pressable onPress={player.next} hitSlop={10} accessibilityRole="button" accessibilityLabel="다음 곡">
                  <Ionicons name="play-skip-forward" size={28} color={colors.text} />
                </Pressable>
                <Pressable onPress={() => player.seekTo(Math.min(dur || pos + 15, pos + 15))} hitSlop={10} accessibilityRole="button" accessibilityLabel="15초 앞으로">
                  <Ionicons name="play-forward" size={28} color={colors.text} />
                </Pressable>
              </View>

              <View style={styles.rates}>
                {RATES.map((r) => (
                  <Pressable key={r} onPress={() => player.setRate(r)} style={[styles.rate, player.rate === r && styles.rateOn]} accessibilityRole="button" accessibilityState={{ selected: player.rate === r }}>
                    <Text style={[styles.rateText, player.rate === r && styles.rateTextOn]}>{r}x</Text>
                  </Pressable>
                ))}
              </View>

              {post.transcript ? (
                <View style={styles.transcript}>
                  <Text style={styles.tHead}>대본</Text>
                  <Text style={styles.tBody}>{post.transcript}</Text>
                </View>
              ) : null}
            </ScrollView>
          );
        }}
      </AsyncView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingBottom: 48 },
  art: { alignSelf: 'center', width: 160, height: 160, borderRadius: 24, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  meta: { marginTop: 24, fontSize: 12.5, fontWeight: '700', color: colors.beta.text, textAlign: 'center' },
  title: { marginTop: 8, fontSize: 21, lineHeight: 30, fontWeight: '800', letterSpacing: -0.3, color: colors.text, textAlign: 'center' },
  seekWrap: { marginTop: 28 },
  trackHit: { paddingVertical: 12 },
  track: { height: 6, borderRadius: 3, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.brand },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  time: { fontSize: 12, color: colors.textFaint },
  controls: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  big: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  rates: { marginTop: 22, flexDirection: 'row', justifyContent: 'center', gap: 8 },
  rate: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f3f4f6' },
  rateOn: { backgroundColor: colors.brand },
  rateText: { fontSize: 13, fontWeight: '700', color: colors.textSub },
  rateTextOn: { color: '#fff' },
  transcript: { marginTop: 32, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  tHead: { fontSize: 13, fontWeight: '800', letterSpacing: 1, color: colors.textFaint },
  tBody: { marginTop: 10, fontSize: 15.5, lineHeight: 26, color: '#1f2937' },
});
