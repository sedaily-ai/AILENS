import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/auth/AuthContext';
import { colors } from '../src/theme';

const SITE = 'https://ailens.sedaily.ai';

// 계정 — 프로필 아이콘의 진입점(햄버거 메뉴를 대신한다): 로그인/로그아웃, 약관·정책, 앱 정보.
// 약관·개인정보 페이지는 웹 경로를 연다(경로는 웹 라우트 확인 후 조정 필요, 미확인).
export default function AccountScreen() {
  const { state, signOut } = useAuth();
  const router = useRouter();
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: '내 계정' }} />
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={26} color="#fff" />
        </View>
        {state.status === 'signedIn' ? (
          <>
            <Text style={styles.name}>{state.email ?? '로그인됨'}</Text>
            <Pressable style={styles.btnGhost} onPress={() => void signOut()} accessibilityRole="button">
              <Text style={styles.btnGhostText}>로그아웃</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.name}>로그인이 필요해요</Text>
            <Pressable style={styles.btn} onPress={() => router.push('/login')} accessibilityRole="button" disabled={state.status === 'loading'}>
              <Text style={styles.btnText}>로그인 · 회원가입</Text>
            </Pressable>
          </>
        )}
      </View>
      <Row label="이용약관" onPress={() => Linking.openURL(`${SITE}/terms`)} />
      <Row label="개인정보처리방침" onPress={() => Linking.openURL(`${SITE}/privacy`)} />
      <Row label="AI LENS 웹사이트" onPress={() => Linking.openURL(SITE)} />
      <Text style={styles.version}>AI LENS BETA</Text>
    </View>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="link">
      <Text style={styles.rowText}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  card: { alignItems: 'center', paddingVertical: 28, gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  btn: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.brand },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnGhost: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10, backgroundColor: '#f3f4f6' },
  btnGhostText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rowText: { fontSize: 15.5, color: colors.text },
  version: { marginTop: 24, textAlign: 'center', fontSize: 12, color: colors.textFaint },
});
