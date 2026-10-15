import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../ui/Text';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme';

/** 첫 방문자에게 "내게 맞는 읽기 방식 찾기"(질문 2개)를 권한다. 온보딩을 마치거나 건너뛰면 사라진다. */
export function StartCard() {
  return (
    <Link href="/start" asChild>
      <Pressable style={styles.card} accessibilityRole="link">
        <Ionicons name="sparkles-outline" size={30} color="#5b8def" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>내게 맞는 읽기 방식 찾기</Text>
          <Text style={styles.sub}>질문 2개로 읽기·웹툰·듣기·영상 중 편한 방식을 골라 드려요.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#bfdbfe' },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  sub: { marginTop: 3, fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
});
