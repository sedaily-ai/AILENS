import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../src/ui/Text';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/auth/AuthContext';
import { bookmarks, history } from '../src/features/mylens/stores';
import { useListStore } from '../src/features/mylens/listStore';
import { colors } from '../src/theme';

const SITE = 'https://ailens.sedaily.ai';
const PAGE_BG = '#f4f6fa';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
// 항목마다 옅은 색 면 + 진한 아이콘(에듀테크 앱의 설정 목록 톤).
const TONE = {
  blue: { bg: '#e8f0ff', fg: '#2563eb' },
  amber: { bg: '#fff3dc', fg: '#d97706' },
  green: { bg: '#e2f6ec', fg: '#059669' },
  rose: { bg: '#ffe8ea', fg: '#e11d48' },
  violet: { bg: '#efe9ff', fg: '#7c3aed' },
  slate: { bg: '#eceff4', fg: '#475569' },
} as const;
type Tone = keyof typeof TONE;

// 계정 — 프로필 아이콘의 진입점(햄버거 메뉴를 대신한다): 로그인/로그아웃, 약관·정책, 앱 정보.
// 약관·개인정보·소개·문의는 웹 (company) 페이지를 앱 안 WebView 로 연다(/info/[page]).
export default function AccountScreen() {
  const { state, signOut } = useAuth();
  const router = useRouter();
  const saved = useListStore(bookmarks);
  const read = useListStore(history);
  const signedIn = state.status === 'signedIn';
  const email = state.status === 'signedIn' ? state.email : undefined;
  const name = email ? email.split('@')[0] : '회원님';
  const initial = (email ?? '?').charAt(0).toUpperCase();

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: '내 계정', headerShadowVisible: false, headerStyle: { backgroundColor: PAGE_BG } }} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroBand} />
          <View style={styles.avatar}>
            {signedIn && email ? <Text style={styles.avatarText}>{initial}</Text> : <Ionicons name="person" size={30} color="#fff" />}
          </View>
          {signedIn ? (
            <>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              {email ? <Text style={styles.email} numberOfLines={1}>{email}</Text> : null}
            </>
          ) : (
            <>
              <Text style={styles.name}>나만의 LENS를 만들어 보세요</Text>
              <Text style={styles.email}>로그인하면 저장한 글과 관심 분야를 이어서 볼 수 있어요</Text>
              <Pressable
                style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
                onPress={() => router.push('/login')}
                accessibilityRole="button"
                disabled={state.status === 'loading'}
              >
                <Text style={styles.ctaText}>로그인 · 회원가입</Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.tiles}>
          <Tile icon="bookmark" tone="blue" label="저장한 글" count={saved.items.length} onPress={() => router.navigate('/me')} />
          <Tile icon="time" tone="amber" label="읽은 글" count={read.items.length} onPress={() => router.navigate('/me')} />
        </View>

        <Text style={styles.groupTitle}>설정</Text>
        <View style={styles.group}>
          {signedIn ? <Row icon="lock-closed" tone="violet" label="비밀번호 변경" onPress={() => router.push('/settings/password')} /> : null}
          <Row icon="notifications" tone="rose" label="알림 설정" onPress={() => router.push('/settings/notifications')} last />
        </View>

        <Text style={styles.groupTitle}>더 보기</Text>
        <View style={styles.group}>
          <Row icon="game-controller" tone="green" label="게임" onPress={() => router.push('/games')} />
          <Row icon="sparkles" tone="blue" label="서비스 소개" onPress={() => router.push({ pathname: '/info/[page]', params: { page: 'about' } })} />
          <Row icon="chatbubble-ellipses" tone="amber" label="문의하기" onPress={() => router.push({ pathname: '/info/[page]', params: { page: 'contact' } })} />
          <Row icon="document-text" tone="slate" label="이용약관" onPress={() => router.push({ pathname: '/info/[page]', params: { page: 'terms' } })} />
          <Row icon="shield-checkmark" tone="slate" label="개인정보처리방침" onPress={() => router.push({ pathname: '/info/[page]', params: { page: 'privacy' } })} />
          <Row icon="globe" tone="violet" label="AI LENS 웹사이트" onPress={() => Linking.openURL(SITE)} last />
        </View>

        {signedIn ? (
          <Pressable style={({ pressed }) => [styles.signOut, pressed && styles.pressed]} onPress={() => void signOut()} accessibilityRole="button">
            <Text style={styles.signOutText}>로그아웃</Text>
          </Pressable>
        ) : null}
        <Text style={styles.version}>AI LENS BETA</Text>
      </ScrollView>
    </View>
  );
}

function Tile({ icon, tone, label, count, onPress }: { icon: IconName; tone: Tone; label: string; count: number; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.tile, pressed && styles.pressed]} onPress={onPress} accessibilityRole="button">
      <View style={[styles.tileIcon, { backgroundColor: TONE[tone].bg }]}>
        <Ionicons name={icon} size={20} color={TONE[tone].fg} />
      </View>
      <Text style={styles.tileCount}>{count}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

function Row({ icon, tone, label, onPress, last }: { icon: IconName; tone: Tone; label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.rowPressed]} onPress={onPress} accessibilityRole="link">
      <View style={[styles.rowIcon, { backgroundColor: TONE[tone].bg }]}>
        <Ionicons name={icon} size={18} color={TONE[tone].fg} />
      </View>
      <Text style={styles.rowText}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#b4bcc9" />
    </Pressable>
  );
}

const CARD = { backgroundColor: '#fff', borderRadius: 20 } as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { padding: 16, paddingBottom: 40 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },

  hero: { ...CARD, alignItems: 'center', paddingTop: 44, paddingBottom: 24, paddingHorizontal: 20, overflow: 'hidden' },
  heroBand: { position: 'absolute', top: 0, left: 0, right: 0, height: 76, backgroundColor: '#e3ecff' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#fff', marginBottom: 12 },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  name: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3, color: colors.text, textAlign: 'center' },
  email: { marginTop: 4, fontSize: 13.5, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },
  cta: { marginTop: 18, alignSelf: 'stretch', height: 50, borderRadius: 14, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  tiles: { flexDirection: 'row', gap: 12, marginTop: 12 },
  tile: { ...CARD, flex: 1, padding: 16 },
  tileIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tileCount: { marginTop: 12, fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  tileLabel: { marginTop: 2, fontSize: 13, fontWeight: '600', color: colors.textMuted },

  groupTitle: { marginTop: 24, marginBottom: 8, marginLeft: 6, fontSize: 13, fontWeight: '800', color: colors.textMuted },
  group: { ...CARD, paddingLeft: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingRight: 14 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eceff4' },
  rowPressed: { backgroundColor: '#f7f9fc' },
  rowIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, fontSize: 15.5, fontWeight: '600', color: colors.text },

  signOut: { marginTop: 20, height: 48, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  signOutText: { fontSize: 15, fontWeight: '700', color: '#e11d48' },
  version: { marginTop: 20, textAlign: 'center', fontSize: 12, color: colors.textFaint },
});
