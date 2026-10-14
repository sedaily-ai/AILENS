import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '../../src/ui/Text';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../src/auth/AuthContext';
import { colors } from '../../src/theme';

const GIVE_UP_MS = 10_000;

/**
 * 로그인 복귀 지점 — Cognito 가 `ailens://auth/callback?code=…&state=…` 로 앱을 열면 expo-router 도 이 주소를 라우트로 해석한다.
 * 코드 교환은 Amplify 가 같은 URL 이벤트로 처리하므로, 이 화면은 "처리 중"만 보여 주다가 로그인되면 홈으로 보낸다.
 * (이 라우트가 없으면 expo-router 가 Unmatched Route 를 띄운다.) 10초 안에 로그인이 확인되지 않으면 실패로 보고 홈으로 돌아간다.
 */
export default function AuthCallback() {
  const router = useRouter();
  const { state } = useAuth();

  useEffect(() => {
    if (state.status === 'signedIn') router.replace('/');
  }, [state.status, router]);

  useEffect(() => {
    const t = setTimeout(() => router.replace('/'), GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <ActivityIndicator color="#2563eb" />
      <Text style={styles.text}>로그인 중이에요…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 14 },
  text: { fontSize: 14, color: colors.textMuted },
});
