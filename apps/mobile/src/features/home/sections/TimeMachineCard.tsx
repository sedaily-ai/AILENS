import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../ui/Text';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme';

/** 홈의 "그날로 떠나요" 진입 카드 — 웹 홈의 메인 훅(타임머신 섹션)을 앱에서는 전용 화면(/timeline)으로 연결한다. */
export function TimeMachineCard() {
  return (
    <Link href="/timeline" asChild>
      <Pressable style={styles.card} accessibilityRole="link">
        <Ionicons name="time-outline" size={34} color={colors.brand} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>그날로 떠나요</Text>
          <Text style={styles.sub}>궁금한 날짜의 신문을 열어 보세요. 1990년부터 오늘까지 볼 수 있어요.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 16, backgroundColor: '#f0f6ff', borderWidth: 1, borderColor: '#dbeafe' },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  sub: { marginTop: 4, fontSize: 13, lineHeight: 19, color: colors.textMuted },
});
