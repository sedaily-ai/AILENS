import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../src/ui/Text';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { getPost, type VideoPost } from '@ailens/api-client';
import { displayHeadline } from '@ailens/domain';
import { AsyncView } from '../../src/components/AsyncView';
import { usePlayer } from '../../src/features/player/PlayerContext';
import { kstDateTime } from '../../src/lib/format';
import { useAsync } from '../../src/lib/useAsync';
import { colors } from '../../src/theme';

// 영상 보기 — mp4 를 네이티브 플레이어로 재생한다(전체화면·PIP 는 시스템 컨트롤 사용).
export default function VideoDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { state, reload } = useAsync((signal) => getPost<VideoPost>(slug, { channel: 'video', signal }), [slug]);
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: '영상' }} />
      <AsyncView state={state} onRetry={reload}>{(post) => <Player post={post} />}</AsyncView>
    </View>
  );
}

function Player({ post }: { post: VideoPost }) {
  const audio = usePlayer();
  const player = useVideoPlayer(post.video_url ?? null, (p) => {
    p.loop = false;
    // 영상 소리와 오디오(듣기)가 겹치지 않게 영상 재생 시작 전에 오디오를 멈춘다.
    audio.current && audio.playing && audio.toggle();
    p.play();
  });
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.videoWrap}>
        {post.video_url ? <VideoView player={player} style={styles.video} nativeControls contentFit="contain" allowsPictureInPicture /> : <Text style={styles.empty}>영상을 불러오지 못했어요.</Text>}
      </View>
      <View style={styles.info}>
        <Text style={styles.meta}>{kstDateTime(post.published_at, post.date)}</Text>
        <Text style={styles.title}>{displayHeadline(post.title)}</Text>
        {post.excerpt ? <Text style={styles.excerpt}>{post.excerpt}</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 48 },
  videoWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  video: { width: '100%', height: '100%' },
  empty: { color: '#fff' },
  info: { padding: 20 },
  meta: { fontSize: 12.5, color: colors.textFaint },
  title: { marginTop: 8, fontSize: 21, lineHeight: 29, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  excerpt: { marginTop: 12, fontSize: 14.5, lineHeight: 22, color: colors.textMuted },
});
