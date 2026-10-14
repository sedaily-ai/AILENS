import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth/AuthContext';

// 내 서랍 진입점. M1 은 로그인/로그아웃과 계정 표시까지. 구독·서랍 목록은 M4.
export default function MeScreen() {
  const insets = useSafeAreaInsets();
  const { state, signIn, signOut } = useAuth();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.h1}>내 서랍</Text>
      {state.status === 'loading' ? <Text style={styles.note}>확인 중…</Text> : null}
      {state.status === 'signedOut' ? (
        <>
          <Text style={styles.note}>로그인하면 구독과 저장한 글을 볼 수 있어요.</Text>
          <Pressable style={styles.btn} onPress={() => void signIn()} accessibilityRole="button">
            <Text style={styles.btnText}>Google로 로그인</Text>
          </Pressable>
        </>
      ) : null}
      {state.status === 'signedIn' ? (
        <>
          <Text style={styles.note}>{state.email ?? '로그인됨'}</Text>
          <Pressable style={styles.btn} onPress={() => void signOut()} accessibilityRole="button">
            <Text style={styles.btnText}>로그아웃</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0c', paddingHorizontal: 16 },
  h1: { color: '#f5f5f5', fontSize: 28, fontWeight: '700' },
  note: { color: '#9aa0a6', fontSize: 14, marginTop: 12, lineHeight: 21 },
  btn: { marginTop: 20, alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 8, backgroundColor: '#26272b' },
  btnText: { color: '#f5f5f5', fontSize: 15, fontWeight: '600' },
});
