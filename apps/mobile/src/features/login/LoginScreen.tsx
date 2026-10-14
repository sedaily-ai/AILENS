import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { checkPassword, isPasswordValid, PASSWORD_REQUIREMENT_MESSAGE } from '@ailens/domain';
import { useAuth } from '../../auth/AuthContext';
import {
  confirmForgotPassword,
  confirmSignUpCode,
  forgotPassword,
  resendConfirmationCode,
  signInWithEmail,
  signUpWithEmail,
  type AuthResult,
} from '../../auth/emailAuth';
import { colors } from '../../theme';

type Mode = 'login' | 'signup' | 'confirm' | 'forgot' | 'reset';

const CODE_LENGTH = 6; // Cognito 확인 코드는 항상 6자리 숫자
const RESEND_COOLDOWN_S = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TITLES: Record<Mode, string> = {
  login: '로그인',
  signup: '회원가입',
  confirm: '이메일 인증',
  forgot: '비밀번호 찾기',
  reset: '새 비밀번호 설정',
};

/**
 * 로그인 — 웹 /login 과 같은 흐름(이메일 로그인·가입·이메일 인증·비밀번호 찾기·Google)을 앱 화면으로 옮겼다.
 * 가입·로그인 규칙과 오류 문구는 src/auth/emailAuth.ts 에 있고, 비밀번호 정책은 웹과 공용(@ailens/domain)이다.
 */
export function LoginScreen() {
  const router = useRouter();
  const { signIn: signInWithGoogle, refresh } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const go = (next: Mode, opts: { keepPassword?: boolean } = {}) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setCode('');
    if (!opts.keepPassword) {
      setPassword('');
      setPassword2('');
    }
  };

  const finish = async () => {
    await refresh();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  /** 공통 제출 래퍼: 중복 제출 방지 + 오류 문구 표시. 성공 시 onOk. */
  const run = async (fn: () => Promise<AuthResult>, onOk: (r: AuthResult) => void | Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      if (r.success) await onOk(r);
      else {
        setError(r.error ?? '요청에 실패했습니다.');
        if (r.unconfirmedAccount) setMode('signup');
        if (r.codeInvalid) setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  const trimmed = email.trim();
  const emailOk = EMAIL_RE.test(trimmed);
  const pwChecks = checkPassword(mode === 'reset' ? password : password);
  const pwOk = isPasswordValid(password);

  const submit = () => {
    if (mode === 'login') {
      if (!emailOk || !password) return setError('이메일과 비밀번호를 입력해 주세요.');
      void run(() => signInWithEmail(trimmed, password), finish);
    } else if (mode === 'signup') {
      if (!name.trim()) return setError('이름을 입력해 주세요.');
      if (!emailOk) return setError('올바른 이메일을 입력해 주세요.');
      if (!pwOk) return setError(PASSWORD_REQUIREMENT_MESSAGE);
      if (password !== password2) return setError('비밀번호가 서로 달라요.');
      void run(() => signUpWithEmail(trimmed, password, name.trim()), (r) => {
        if (r.needsConfirmation) {
          go('confirm');
          setNotice('인증 코드를 이메일로 보냈어요.');
          setCooldown(RESEND_COOLDOWN_S);
        } else go('login');
      });
    } else if (mode === 'confirm') {
      if (code.length !== CODE_LENGTH) return setError(`${CODE_LENGTH}자리 인증 코드를 입력해 주세요.`);
      void run(() => confirmSignUpCode(trimmed, code), async (r) => {
        if (r.signedIn) await finish();
        else {
          go('login');
          setNotice('이메일 인증이 끝났어요. 로그인해 주세요.');
        }
      });
    } else if (mode === 'forgot') {
      if (!emailOk) return setError('올바른 이메일을 입력해 주세요.');
      void run(() => forgotPassword(trimmed), () => {
        go('reset');
        setNotice('인증 코드를 이메일로 보냈어요.');
        setCooldown(RESEND_COOLDOWN_S);
      });
    } else {
      if (code.length !== CODE_LENGTH) return setError(`${CODE_LENGTH}자리 인증 코드를 입력해 주세요.`);
      if (!pwOk) return setError(PASSWORD_REQUIREMENT_MESSAGE);
      if (password !== password2) return setError('비밀번호가 서로 달라요.');
      void run(() => confirmForgotPassword(trimmed, code, password), () => {
        go('login');
        setNotice('비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.');
      });
    }
  };

  const resend = () => {
    if (cooldown > 0) return;
    const action = mode === 'reset' ? () => forgotPassword(trimmed) : () => resendConfirmationCode(trimmed);
    void run(action, () => {
      setNotice('인증 코드를 다시 보냈어요.');
      setCooldown(RESEND_COOLDOWN_S);
    });
  };

  const showPasswordRules = (mode === 'signup' || mode === 'reset') && password.length > 0;
  const cta = { login: '로그인', signup: '가입하기', confirm: '인증하기', forgot: '인증 코드 받기', reset: '비밀번호 변경' }[mode];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.top}>
        <Pressable
          onPress={() => (mode === 'login' || mode === 'confirm' ? (router.canGoBack() ? router.back() : router.replace('/')) : go('login'))}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="뒤로"
        >
          <Ionicons name={mode === 'login' ? 'close' : 'chevron-back'} size={26} color={colors.text} />
        </Pressable>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>AI LENS</Text>
          <Text style={styles.title}>{TITLES[mode]}</Text>
          {mode === 'confirm' || mode === 'reset' ? (
            <Text style={styles.sub}>{trimmed}로 보낸 {CODE_LENGTH}자리 코드를 입력해 주세요.</Text>
          ) : null}
          {mode === 'forgot' ? <Text style={styles.sub}>가입한 이메일로 인증 코드를 보내드려요.</Text> : null}

          {mode === 'login' || mode === 'signup' ? (
            <>
              <Pressable style={styles.google} onPress={() => void signInWithGoogle()} accessibilityRole="button">
                <Ionicons name="logo-google" size={18} color={colors.text} />
                <Text style={styles.googleText}>Google로 계속하기</Text>
              </Pressable>
              <View style={styles.or}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>또는 이메일로</Text>
                <View style={styles.orLine} />
              </View>
            </>
          ) : null}

          {mode === 'signup' ? (
            <Field label="이름" value={name} onChangeText={setName} placeholder="홍길동" autoComplete="name" textContentType="name" autoCapitalize="words" />
          ) : null}
          {mode !== 'confirm' && mode !== 'reset' ? (
            <Field label="이메일" value={email} onChangeText={setEmail} placeholder="email@example.com" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
          ) : null}
          {mode === 'login' || mode === 'signup' ? (
            <Field
              label="비밀번호"
              value={password}
              onChangeText={setPassword}
              placeholder={mode === 'signup' ? '8자 이상' : '비밀번호'}
              secure
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              onSubmitEditing={mode === 'login' ? submit : undefined}
            />
          ) : null}
          {mode === 'confirm' || mode === 'reset' ? (
            <Field label="인증 코드" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, CODE_LENGTH))} placeholder="000000" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={CODE_LENGTH} />
          ) : null}
          {mode === 'reset' ? (
            <Field label="새 비밀번호" value={password} onChangeText={setPassword} placeholder="8자 이상" secure autoComplete="new-password" textContentType="newPassword" />
          ) : null}
          {showPasswordRules ? (
            <View style={styles.rules}>
              {pwChecks.map(({ rule, passed }) => (
                <View key={rule.id} style={styles.rule}>
                  <Ionicons name={passed ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={passed ? '#16a34a' : colors.textFaint} />
                  <Text style={[styles.ruleText, passed && { color: '#16a34a' }]}>{rule.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {mode === 'signup' || mode === 'reset' ? (
            <Field label="비밀번호 확인" value={password2} onChangeText={setPassword2} placeholder="비밀번호 한 번 더" secure autoComplete="new-password" textContentType="newPassword" onSubmitEditing={submit} />
          ) : null}

          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          {notice ? <Text style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text> : null}

          <Pressable style={[styles.cta, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>{cta}</Text>}
          </Pressable>

          {mode === 'confirm' || mode === 'reset' ? (
            <Pressable onPress={resend} disabled={cooldown > 0 || busy} style={styles.linkWrap} accessibilityRole="button">
              <Text style={[styles.link, cooldown > 0 && { color: colors.textFaint }]}>{cooldown > 0 ? `코드 다시 받기 (${cooldown}초)` : '코드 다시 받기'}</Text>
            </Pressable>
          ) : null}

          {mode === 'login' ? (
            <View style={styles.links}>
              <Pressable onPress={() => go('forgot')} accessibilityRole="button">
                <Text style={styles.link}>비밀번호를 잊으셨나요?</Text>
              </Pressable>
              <Pressable onPress={() => go('signup')} accessibilityRole="button">
                <Text style={styles.linkStrong}>회원가입</Text>
              </Pressable>
            </View>
          ) : null}
          {mode === 'signup' ? (
            <View style={styles.links}>
              <Text style={styles.link}>이미 계정이 있나요?</Text>
              <Pressable onPress={() => go('login')} accessibilityRole="button">
                <Text style={styles.linkStrong}>로그인</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  secure,
  ...input
}: { label: string; secure?: boolean } & React.ComponentProps<typeof TextInput>) {
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          {...input}
          style={styles.input}
          placeholderTextColor={colors.textFaint}
          secureTextEntry={secure && !shown}
          autoCapitalize={input.autoCapitalize ?? 'none'}
          autoCorrect={false}
          accessibilityLabel={label}
        />
        {secure ? (
          <Pressable onPress={() => setShown((s) => !s)} hitSlop={8} accessibilityRole="button" accessibilityLabel={shown ? '비밀번호 숨기기' : '비밀번호 보기'}>
            <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { paddingHorizontal: 16, paddingVertical: 10 },
  body: { paddingHorizontal: 24, paddingBottom: 40 },
  brand: { fontSize: 13, fontWeight: '800', letterSpacing: 2, color: colors.beta.text },
  title: { marginTop: 8, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  sub: { marginTop: 8, fontSize: 14, lineHeight: 21, color: colors.textMuted },
  google: { marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 50, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
  googleText: { fontSize: 15, fontWeight: '700', color: colors.text },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  orText: { fontSize: 12.5, color: colors.textFaint },
  field: { marginTop: 14 },
  label: { fontSize: 12.5, fontWeight: '700', color: colors.textSub, marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, borderRadius: 10, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, backgroundColor: '#fff' },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 },
  rules: { marginTop: 10, gap: 6 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ruleText: { fontSize: 12.5, color: colors.textFaint },
  error: { marginTop: 14, fontSize: 13.5, lineHeight: 20, color: '#dc2626' },
  notice: { marginTop: 14, fontSize: 13.5, lineHeight: 20, color: '#2563eb' },
  cta: { marginTop: 20, height: 52, borderRadius: 10, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkWrap: { marginTop: 16, alignItems: 'center' },
  links: { marginTop: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontSize: 13.5, color: colors.textMuted },
  linkStrong: { fontSize: 14, fontWeight: '800', color: colors.text },
});
