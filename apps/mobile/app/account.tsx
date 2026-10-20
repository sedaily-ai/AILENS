import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../src/ui/Text';
import { Stack, useRouter } from 'expo-router';
import { BookOpenText, Headphones, ImageSquare, VideoCamera, BookmarkSimple, Bell, CaretRight, ChatCircleDots, ClockCounterClockwise, FileText, GameController, Globe, LockKey, ShieldCheck, Sparkle, User } from '../src/ui/icons';
import { useAuth } from '../src/auth/AuthContext';
import { bookmarks, history } from '../src/features/mylens/stores';
import { useListStore } from '../src/features/mylens/listStore';
import { getPreferredFormat } from '../src/features/onboarding/prefs';
import { colors, formatColors } from '../src/theme';

const SITE = 'https://ailens.sedaily.ai';

// 온보딩에서 고른 선호 형식(레터 0·웹툰 1·팟캐스트 2·영상 3). 형식마다 앱 전체에서 같은 색을 쓴다(theme.formatColors).
const FORMATS = [
  { label: '읽기', desc: '글로 차분히 읽는 걸 좋아해요', icon: BookOpenText, tone: formatColors.letter },
  { label: '웹툰', desc: '만화로 쉽게 이해하는 걸 좋아해요', icon: ImageSquare, tone: formatColors.webtoon },
  { label: '듣기', desc: '이동 중에 귀로 듣는 걸 좋아해요', icon: Headphones, tone: formatColors.podcast },
  { label: '영상', desc: '영상으로 한눈에 보는 걸 좋아해요', icon: VideoCamera, tone: formatColors.video },
];
const PAGE_BG = '#f4f6fa';

type IconName = typeof Bell;
// 아이콘은 한 가지 잉크 톤으로 통일한다(색을 늘어놓지 않고 웹의 차분한 에디토리얼 톤을 따른다).
const TONE = {
  ink: { bg: '#f1f3f6', fg: '#374151' },
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
  const [fmt, setFmt] = useState<number | null>(null);
  useEffect(() => {
    void getPreferredFormat().then(setFmt);
  }, []);
  const pref = fmt === null ? null : FORMATS[fmt];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: '내 계정', headerShadowVisible: false, headerStyle: { backgroundColor: PAGE_BG } }} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.greet}>
          <View style={{ flex: 1 }}>
            {signedIn ? (
              <>
                <Text style={styles.hello} numberOfLines={1}>{name}님,</Text>
                <Text style={styles.helloSub}>오늘도 내 방식대로 챙겨봐요</Text>
              </>
            ) : (
              <>
                <Text style={styles.hello}>나만의 LENS를{'\n'}만들어 보세요</Text>
                <Text style={styles.helloSub}>로그인하면 저장한 글과 관심 분야를 이어서 볼 수 있어요</Text>
              </>
            )}
          </View>
          <View style={styles.avatar}>
            {signedIn && email ? <Text style={styles.avatarText}>{initial}</Text> : <User size={26} color="#fff" weight="fill" />}
          </View>
        </View>
        {!signedIn ? (
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
            onPress={() => router.push('/login')}
            accessibilityRole="button"
            disabled={state.status === 'loading'}
          >
            <Text style={styles.ctaText}>로그인 · 회원가입</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.way, { backgroundColor: pref ? pref.tone.tint : '#fff' }, pressed && styles.pressed]}
          onPress={() => router.push('/start')}
          accessibilityRole="button"
        >
          <View style={[styles.wayIcon, { backgroundColor: pref ? pref.tone.accent : colors.brand }]}>
            {pref ? <pref.icon size={24} color="#fff" weight="fill" /> : <Sparkle size={24} color="#fff" weight="fill" />}
          </View>
          <View style={styles.wayText}>
            <Text style={styles.wayLabel}>내 읽기 방식</Text>
            <Text style={styles.wayTitle}>{pref ? pref.label : '나에게 맞는 방식 찾기'}</Text>
            <Text style={styles.wayDesc}>{pref ? pref.desc : '질문 2개로 읽기·웹툰·듣기·영상 중 골라 드려요'}</Text>
          </View>
          <CaretRight size={18} color="#9aa3b2" weight="bold" />
        </Pressable>

        <View style={styles.tiles}>
          <Tile icon={BookmarkSimple} tone="ink" label="저장한 글" count={saved.items.length} onPress={() => router.navigate('/me')} />
          <Tile icon={ClockCounterClockwise} tone="ink" label="읽은 글" count={read.items.length} onPress={() => router.navigate('/me')} />
        </View>

        <Text style={styles.groupTitle}>설정</Text>
        <View style={styles.group}>
          {signedIn ? <Row icon={LockKey} tone="ink" label="비밀번호 변경" onPress={() => router.push('/settings/password')} /> : null}
          <Row icon={Bell} tone="ink" label="알림 설정" onPress={() => router.push('/settings/notifications')} last />
        </View>

        <Text style={styles.groupTitle}>더 보기</Text>
        <View style={styles.group}>
          <Row icon={GameController} tone="ink" label="게임" onPress={() => router.push('/games')} />
          <Row icon={Sparkle} tone="ink" label="서비스 소개" onPress={() => router.push({ pathname: '/info/[page]', params: { page: 'about' } })} />
          <Row icon={ChatCircleDots} tone="ink" label="문의하기" onPress={() => router.push({ pathname: '/info/[page]', params: { page: 'contact' } })} />
          <Row icon={FileText} tone="ink" label="이용약관" onPress={() => router.push({ pathname: '/info/[page]', params: { page: 'terms' } })} />
          <Row icon={ShieldCheck} tone="ink" label="개인정보처리방침" onPress={() => router.push({ pathname: '/info/[page]', params: { page: 'privacy' } })} />
          <Row icon={Globe} tone="ink" label="AI LENS 웹사이트" onPress={() => Linking.openURL(SITE)} last />
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
        {(() => { const I = icon; return <I size={22} color={TONE[tone].fg} weight="duotone" />; })()}
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
        {(() => { const I = icon; return <I size={20} color={TONE[tone].fg} weight="duotone" />; })()}
      </View>
      <Text style={styles.rowText}>{label}</Text>
      <CaretRight size={16} color="#b4bcc9" weight="bold" />
    </Pressable>
  );
}

const CARD = { backgroundColor: '#fff', borderRadius: 20 } as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { padding: 16, paddingBottom: 40 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },

  greet: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 8, paddingBottom: 20 },
  hello: { fontSize: 26, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8, color: colors.text },
  helloSub: { marginTop: 6, fontSize: 15, lineHeight: 22, color: colors.textMuted },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  avatarText: { fontSize: 22, fontWeight: '800', color: '#fff' },
  cta: { marginBottom: 12, height: 52, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  way: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 22 },
  wayIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  wayText: { flex: 1 },
  wayLabel: { fontSize: 12.5, fontWeight: '700', color: colors.textMuted },
  wayTitle: { marginTop: 2, fontSize: 19, fontWeight: '800', letterSpacing: -0.4, color: colors.text },
  wayDesc: { marginTop: 3, fontSize: 13.5, lineHeight: 19, color: colors.textMuted },

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
  rowText: { flex: 1, fontSize: 15.5, fontWeight: '500', color: colors.text },

  signOut: { marginTop: 20, height: 48, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  signOutText: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
  version: { marginTop: 20, textAlign: 'center', fontSize: 12, color: colors.textFaint },
});
