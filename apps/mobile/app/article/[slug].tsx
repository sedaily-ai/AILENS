import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

// 기사 상세. 웹 /{cat}/{y}/{m}/{d}/{slug} 대응(M1 은 slug 단일). 딥링크 ailens://article/<slug>.
export default function ArticleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return (
    <View style={styles.root}>
      <Text style={styles.title}>기사 상세</Text>
      <Text style={styles.slug}>slug: {slug}</Text>
      <Text style={styles.note}>본문 연동 예정. 딥링크 진입점.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0c', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#f5f5f5', fontSize: 20, fontWeight: '700' },
  slug: { color: '#8ab4ff', fontSize: 13, marginTop: 8 },
  note: { color: '#9aa0a6', fontSize: 13, marginTop: 8 },
});
