import { Pressable, StyleSheet, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Text } from '../../../ui/Text';
import { Pause, Play } from '../../../ui/icons';
import { usePlayer } from '../../player/PlayerContext';
import { colors } from '../../../theme';

/**
 * 에디터 자기소개 음성(6~12초 mp3). 막대 전체가 재생·멈춤 버튼이고, 진행 막대와 시간은 보기용이다(웹 EditorVoiceBar 와 같은 구성).
 * 뉴스 오디오가 재생 중이면 소개를 시작하기 전에 멈춰 소리가 겹치지 않게 하고, 에디터를 바꾸거나 화면을 벗어나면 소개는 멈춘다.
 */
const clock = (s: number) => `0:${String(Math.max(0, Math.round(s))).padStart(2, '0')}`;

export function EditorVoice({ src, name, tint, compact }: { src: string; name: string; tint: { bg: string; fg: string }; compact?: boolean }) {
  const news = usePlayer();
  const player = useAudioPlayer({ uri: src });
  const status = useAudioPlayerStatus(player);
  // 화면을 벗어나거나 에디터가 바뀌면(key 변경으로 다시 만들어짐) 훅이 플레이어를 해제하면서 소리도 멈춘다.
  // 해제된 객체에 pause 를 부르면 오류가 나므로 정리 단계에서는 직접 멈추지 않는다.

  const toggle = () => {
    if (status.playing) return player.pause();
    if (news.playing) news.toggle();
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1)) void player.seekTo(0);
    player.play();
  };
  // 끝까지 들었으면 처음 상태(빈 막대 + 전체 길이)로 돌아간 것처럼 보여 다시 누르기 쉽게 한다.
  const finished = !status.playing && status.duration > 0 && status.currentTime >= status.duration - 0.1;
  const ratio = finished || status.duration <= 0 ? 0 : Math.min(1, status.currentTime / status.duration);
  const started = status.playing || (status.currentTime > 0 && !finished);

  if (compact) {
    // 말풍선 아래에 붙는 작은 알약: 재생 아이콘 + 라벨 + 시간.
    return (
      <Pressable style={({ pressed }) => [styles.mini, { backgroundColor: tint.bg }, pressed && { opacity: 0.85 }]} onPress={toggle} accessibilityRole="button" accessibilityLabel={`${name} 자기소개 ${status.playing ? '멈추기' : '듣기'}`}>
        {status.playing ? <Pause size={14} color={tint.fg} weight="fill" /> : <Play size={14} color={tint.fg} weight="fill" />}
        <Text style={[styles.miniText, { color: tint.fg }]}>{status.playing ? `듣는 중 ${clock(status.currentTime)}` : `자기소개 듣기 ${status.duration > 0 ? clock(status.duration) : ''}`.trim()}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable style={({ pressed }) => [styles.bar, { backgroundColor: tint.bg }, pressed && { opacity: 0.9 }]} onPress={toggle} accessibilityRole="button" accessibilityLabel={`${name} 자기소개 ${status.playing ? '멈추기' : '듣기'}`}>
      <View style={[styles.icon, { backgroundColor: tint.fg }]}>
        {status.playing ? <Pause size={16} color="#fff" weight="fill" /> : <Play size={16} color="#fff" weight="fill" />}
      </View>
      <View style={styles.mid}>
        <Text style={[styles.label, { color: tint.fg }]}>{status.playing ? '소개 듣는 중' : '자기소개 듣기'}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: tint.fg }]} />
        </View>
      </View>
      <Text style={styles.time}>{started ? clock(status.currentTime) : status.duration > 0 ? clock(status.duration) : ''}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mini: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 999 },
  miniText: { fontSize: 12.5, fontWeight: '800' },
  bar: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 10, paddingRight: 16, borderRadius: 999, },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  mid: { flex: 1, gap: 6 },
  label: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.75)', overflow: 'hidden' },
  fill: { height: '100%' },
  time: { minWidth: 30, textAlign: 'right', fontSize: 12.5, fontWeight: '600', color: colors.textMuted },
});
