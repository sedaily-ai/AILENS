import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

/**
 * 웹 하단 "오늘의 뉴스를 귀로" 미니 플레이어. 지금은 레이아웃만 맞춘 자리표시(UI only)이며 재생은 연결 전이다.
 * 실제 재생은 home_player 채널 + expo-audio 백그라운드 재생(M4)으로 붙인다.
 */
export function MiniPlayer() {
  return (
    <View style={styles.bar}>
      <Ionicons name="headset-outline" size={30} color={colors.brand} />
      <View style={styles.text}>
        <Text style={styles.label}>오늘의 뉴스를 귀로 · 1/50</Text>
        <Text style={styles.title} numberOfLines={1}>
          곧 제공됩니다
        </Text>
      </View>
      <Pressable style={styles.play} accessibilityRole="button" accessibilityLabel="재생">
        <Ionicons name="play" size={22} color="#fff" style={{ marginLeft: 2 }} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f8f8f6',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  text: { flex: 1 },
  label: { fontSize: 12, fontWeight: '700', color: colors.beta.text },
  title: { marginTop: 2, fontSize: 16, color: colors.text },
  play: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
});
