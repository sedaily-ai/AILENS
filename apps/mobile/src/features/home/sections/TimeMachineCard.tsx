import { Pressable, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import { Text } from '../../../ui/Text';
import { CaretRight, ClockCounterClockwise } from '../../../ui/icons';
import { colors, surface } from '../../../theme';

/** 홈의 "그날로 떠나요" 진입 줄 — 웹 홈의 타임머신 섹션을 앱에서는 전용 화면(/timeline)으로 연결한다. 한 줄로 가볍게 둔다. */
export function TimeMachineCard() {
  return (
    <Link href="/timeline" asChild>
      <Pressable style={styles.row} accessibilityRole="link">
        <View style={styles.icon}>
          <ClockCounterClockwise size={20} color={colors.textSub} weight="bold" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>그날로 떠나요</Text>
          <Text style={styles.sub}>궁금한 그날의 신문, 지금 열어 볼까요?</Text>
        </View>
        <CaretRight size={16} color={colors.textFaint} weight="bold" />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: { ...surface.card, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, height: 68, borderRadius: 20 },
  icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#f1f3f6', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2, color: colors.text },
  sub: { marginTop: 2, fontSize: 12.5, color: colors.textMuted },
});
