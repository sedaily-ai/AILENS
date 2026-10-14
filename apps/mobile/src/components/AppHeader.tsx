import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme';

/**
 * 상단바 — 좌: AI LENS + BETA, 우: 검색 · 프로필. 햄버거는 두지 않는다(뉴닉 방식):
 * 주 이동은 하단 탭, 계정·설정·약관·로그인은 프로필 아이콘(/account)이 맡는다.
 */
export function AppHeader() {
  const router = useRouter();
  const { state } = useAuth();
  const signedIn = state.status === 'signedIn';
  return (
    <View style={styles.bar}>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>AI LENS</Text>
        <View style={styles.beta}>
          <Text style={styles.betaText}>BETA</Text>
        </View>
      </View>
      <View style={styles.icons}>
        <Pressable hitSlop={10} onPress={() => router.push('/search')} accessibilityRole="button" accessibilityLabel="검색">
          <Ionicons name="search-outline" size={24} color={colors.text} />
        </Pressable>
        <Pressable hitSlop={10} onPress={() => router.push('/account')} accessibilityRole="button" accessibilityLabel="내 계정">
          <View style={[styles.avatar, signedIn && styles.avatarOn]}>
            <Ionicons name="person" size={18} color={signedIn ? '#fff' : colors.textFaint} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: colors.brand },
  beta: { backgroundColor: colors.beta.bg, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  betaText: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.beta.text },
  icons: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  avatarOn: { backgroundColor: colors.brand },
});
