import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '../../src/components/AppHeader';
import { useAuth } from '../../src/auth/AuthContext';
import { colors } from '../../src/theme';

// 나의 LENS — 저장·구독한 글(웹 나의 LENS 대응). 목록 자체는 백엔드 연동 후(M4)이고, 지금은 로그인 상태에 따른 안내만 보여 준다.
export default function MeScreen() {
  const { state, signIn } = useAuth();
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <AppHeader />
      <View style={styles.body}>
        <Ionicons name="bookmark-outline" size={44} color={colors.textFaint} />
        <Text style={styles.title}>나의 LENS</Text>
        {state.status === 'signedIn' ? (
          <Text style={styles.note}>저장한 글과 구독 목록이 여기에 모여요.{'\n'}곧 제공됩니다.</Text>
        ) : (
          <>
            <Text style={styles.note}>로그인하면 저장한 글과 구독을{'\n'}한곳에서 볼 수 있어요.</Text>
            {state.status === 'signedOut' ? (
              <Pressable style={styles.btn} onPress={() => void signIn()} accessibilityRole="button">
                <Text style={styles.btnText}>Google로 로그인</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 6 },
  note: { fontSize: 14, lineHeight: 22, color: colors.textMuted, textAlign: 'center' },
  btn: { marginTop: 14, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 10, backgroundColor: colors.brand },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
