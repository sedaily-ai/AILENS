import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../ui/Text';
import { useRouter } from 'expo-router';
import { Headphones, Pause, Play, SkipForward, X } from '../ui/icons';
import { displayHeadline } from '@ailens/domain';
import { usePlayer } from '../features/player/PlayerContext';
import { colors } from '../theme';

/**
 * 하단 "오늘의 뉴스를 귀로" 미니 플레이어(웹 TodayNewsPlayer 대응). 전역 PlayerProvider 상태를 그대로 보여 준다.
 * 재생 전: 재생 버튼이 오늘의 오디오 목록을 받아 1번부터 시작. 재생 중: 제목·진행 표시, 이전/재생·일시정지/다음/닫기. 본체를 누르면 상세 플레이어.
 */
export function MiniPlayer() {
  const router = useRouter();
  const { current, queue, index, playing, loading, position, duration, playDefault, toggle, next, close } = usePlayer();
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View style={styles.bar}>
      {current ? <View style={[styles.progress, { width: `${progress * 100}%` }]} /> : null}
      <Pressable
        style={styles.main}
        disabled={!current}
        onPress={() => current && router.push({ pathname: '/listen/[slug]', params: { slug: current.id } })}
        accessibilityRole="button"
        accessibilityLabel="재생 화면 열기"
      >
        <Headphones size={30} color={colors.brand} weight="duotone" />
        <View style={styles.text}>
          <Text style={styles.label}>오늘의 뉴스를 귀로{current ? ` · ${index + 1}/${queue.length}` : ''}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {current ? displayHeadline(current.title) : '눌러서 오늘의 뉴스를 들어 보세요'}
          </Text>
        </View>
      </Pressable>
      <Pressable
        style={styles.play}
        onPress={() => (current ? toggle() : void playDefault())}
        accessibilityRole="button"
        accessibilityLabel={playing ? '일시정지' : '재생'}
      >
        {loading && !playing ? <ActivityIndicator color="#fff" /> : (playing ? <Pause size={22} color="#fff" weight="fill" /> : <Play size={22} color="#fff" weight="fill" />)}
      </Pressable>
      {current ? (
        <>
          <Pressable onPress={next} hitSlop={8} disabled={index >= queue.length - 1} accessibilityRole="button" accessibilityLabel="다음 곡">
            <SkipForward size={22} color={index >= queue.length - 1 ? colors.textFaint : colors.text} weight="fill" />
          </Pressable>
          <Pressable onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기">
            <X size={20} color={colors.textFaint} />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8f8f6',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  progress: { position: 'absolute', top: 0, left: 0, height: 2, backgroundColor: colors.beta.text },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1 },
  label: { fontSize: 12, fontWeight: '700', color: colors.beta.text },
  title: { marginTop: 2, fontSize: 15, color: colors.text },
  play: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
});
