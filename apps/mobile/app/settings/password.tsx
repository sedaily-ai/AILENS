import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../src/ui/Text';
import { Stack, useRouter } from 'expo-router';
import { fetchAuthSession, updatePassword } from 'aws-amplify/auth';
import { Ionicons } from '@expo/vector-icons';
import { checkPassword, isPasswordValid, PASSWORD_REQUIREMENT_MESSAGE } from '@ailens/domain';
import { useAuth } from '../../src/auth/AuthContext';
import { accent, colors } from '../../src/theme';

// 비밀번호 변경(웹 /settings/password 대응) — 현재 비밀번호를 아는 로그인 사용자용. 메일 왕복이 없어 Cognito 하루 발송 한도를 쓰지 않는다.
// Google 등 소셜 로그인 계정은 Cognito 에 비밀번호가 없어 변경 화면 대신 안내를 보여 준다(ID 토큰의 `identities` 클레임 유무로 판별 — Amplify 문서의 공식 방법).
export default function PasswordScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const [federated, setFederated] = useState<boolean | null>(null);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void fetchAuthSession()
      .then((s) => setFederated(!!(s.tokens?.idToken?.payload as { identities?: unknown } | undefined)?.identities))
      .catch(() => setFederated(false));
  }, []);

  const submit = async () => {
    if (busy) return;
    if (!oldPw) return setError('현재 비밀번호를 입력해 주세요.');
    if (!isPasswordValid(newPw)) return setError(PASSWORD_REQUIREMENT_MESSAGE);
    if (newPw !== newPw2) return setError('새 비밀번호가 서로 달라요.');
    if (newPw === oldPw) return setError('현재와 다른 비밀번호를 입력해 주세요.');
    setBusy(true);
    setError(null);
    try {
      await updatePassword({ oldPassword: oldPw, newPassword: newPw });
      setDone(true);
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      setError(
        name === 'NotAuthorizedException'
          ? '현재 비밀번호가 올바르지 않아요.'
          : name === 'InvalidPasswordException'
            ? PASSWORD_REQUIREMENT_MESSAGE
            : name === 'LimitExceededException'
              ? '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'
              : '비밀번호를 바꾸지 못했어요.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ headerShown: true, title: '비밀번호 변경' }} />
      {state.status !== 'signedIn' ? (
        <View style={styles.block}>
          <Text style={styles.msg}>로그인이 필요해요.</Text>
          <Pressable style={styles.cta} onPress={() => router.replace('/login')} accessibilityRole="button"><Text style={styles.ctaText}>로그인</Text></Pressable>
        </View>
      ) : federated === null ? (
        <ActivityIndicator color="#2563eb" style={{ marginTop: 40 }} />
      ) : federated ? (
        <Text style={styles.msg}>Google 등 소셜 계정은 비밀번호가 없어서 이 화면에서 바꿀 수 없어요. 해당 서비스에서 계정 보안을 관리해 주세요.</Text>
      ) : done ? (
        <View style={styles.block}>
          <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
          <Text style={styles.msg}>비밀번호를 바꿨어요.</Text>
          <Pressable style={styles.cta} onPress={() => router.back()} accessibilityRole="button"><Text style={styles.ctaText}>확인</Text></Pressable>
        </View>
      ) : (
        <>
          <Field label="현재 비밀번호" value={oldPw} onChangeText={setOldPw} autoComplete="current-password" />
          <Field label="새 비밀번호" value={newPw} onChangeText={setNewPw} autoComplete="new-password" />
          {newPw ? (
            <View style={styles.rules}>
              {checkPassword(newPw).map(({ rule, passed }) => (
                <View key={rule.id} style={styles.rule}>
                  <Ionicons name={passed ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={passed ? '#16a34a' : colors.textFaint} />
                  <Text style={[styles.ruleText, passed && { color: '#16a34a' }]}>{rule.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Field label="새 비밀번호 확인" value={newPw2} onChangeText={setNewPw2} autoComplete="new-password" onSubmitEditing={() => void submit()} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.cta, busy && { opacity: 0.6 }]} onPress={() => void submit()} disabled={busy} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>비밀번호 변경</Text>}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function Field({ label, ...input }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...input} secureTextEntry style={styles.input} autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.textFaint} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 24, paddingBottom: 48 },
  block: { alignItems: 'center', gap: 12, marginTop: 40 },
  msg: { fontSize: 15, lineHeight: 23, color: colors.textMuted, textAlign: 'center' },
  label: { fontSize: 12.5, fontWeight: '700', color: colors.textSub, marginBottom: 8 },
  input: { height: 50, borderRadius: 10, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, fontSize: 16, color: colors.text, backgroundColor: '#fff' },
  rules: { marginTop: 10, gap: 6 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ruleText: { fontSize: 12.5, color: colors.textFaint },
  error: { marginTop: 14, fontSize: 13.5, lineHeight: 20, color: '#dc2626' },
  cta: { marginTop: 20, height: 52, borderRadius: 10, backgroundColor: accent.main, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
