import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// 공유 패키지 실사용 — 웹과 같은 도메인 로직을 앱에서 그대로 쓴다(모노레포 공유 증명).
import { displayHeadline } from '@ailens/domain';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  // displayHeadline: 부서명 접두어 제거(웹과 동일 로직). 앱에서 @ailens/domain 이 동작함을 보인다.
  const sample = displayHeadline('산업 | 반도체 수출 3개월 연속 증가');

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16 }}>
      <Text style={styles.badge}>AI LENS · BETA</Text>
      <Text style={styles.h1}>오늘의 한 통</Text>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>@ailens/domain 공유 로직 데모</Text>
        <Text style={styles.cardTitle}>{sample}</Text>
        <Text style={styles.cardMeta}>원본: &quot;산업 | 반도체…&quot; → 접두어 제거됨</Text>
      </View>
      <Text style={styles.note}>M1 셸: 콘텐츠 연동(createApiClient)·인증·푸시는 다음 단계.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0c' },
  badge: { color: '#8ab4ff', fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  h1: { color: '#f5f5f5', fontSize: 28, fontWeight: '700', marginTop: 8, marginBottom: 20 },
  card: { backgroundColor: '#17181b', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#26272b' },
  cardLabel: { color: '#9aa0a6', fontSize: 11, marginBottom: 8 },
  cardTitle: { color: '#f5f5f5', fontSize: 18, fontWeight: '600' },
  cardMeta: { color: '#9aa0a6', fontSize: 12, marginTop: 8 },
  note: { color: '#6b7076', fontSize: 13, marginTop: 24, lineHeight: 20 },
});
