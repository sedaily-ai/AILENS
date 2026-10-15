import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../ui/Text';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

/** 게임 진입 카드 — 웹 홈의 마지막 "쉬어가기" 섹션 대응(웹과 같이 다크 아케이드 톤). */
export function GamesCard() {
  return (
    <Link href="/games" asChild>
      <Pressable style={styles.card} accessibilityRole="link">
        <Ionicons name="game-controller-outline" size={32} color="#f5a623" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>쉬어가기 · 게임</Text>
          <Text style={styles.sub}>신문 한 장으로 즐기는 가벼운 게임 2종</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#9ca3c8" />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 16, backgroundColor: '#17182c' },
  title: { fontSize: 16, fontWeight: '800', color: '#f5a623' },
  sub: { marginTop: 3, fontSize: 12.5, color: '#c7c9e0' },
});
