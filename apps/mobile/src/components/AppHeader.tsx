import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../ui/Text';
import { useRouter } from 'expo-router';
import { CaretLeft, GearSix, MagnifyingGlass, User } from '../ui/icons';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme';

/**
 * 상단바. 햄버거는 두지 않는다(뉴닉 방식): 주 이동은 하단 탭, 계정·설정·약관·로그인은 /account 가 맡는다.
 *  · 홈(기본): 좌 AI LENS + BETA, 우 검색 · 프로필 — 로고는 홈에만 둔다.
 *  · 그 밖의 탭(title 지정): 좌 화면 이름(큰 글씨), 우 검색. 로고와 화면 이름이 겹쳐 보이지 않게 한다.
 *  · 나의 LENS(settings): 우 검색 대신 계정·설정(/account) 진입 아이콘 — 프로필이 곧 나의 LENS 이므로.
 */
export function AppHeader({ title, settings, back }: { title?: string; settings?: boolean; back?: boolean }) {
  const router = useRouter();
  const { state } = useAuth();
  const signedIn = state.status === 'signedIn';
  return (
    <View style={styles.bar}>
      {title ? (
        <View style={styles.titleRow}>
          {back ? (
            <Pressable hitSlop={10} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="뒤로">
              <CaretLeft size={26} color={colors.text} weight="bold" />
            </Pressable>
          ) : null}
          <Text style={styles.title}>{title}</Text>
        </View>
      ) : (
        <View style={styles.brandRow}>
          <Text style={styles.brand}>AI LENS</Text>
          <View style={styles.beta}>
            <Text style={styles.betaText}>BETA</Text>
          </View>
        </View>
      )}
      <View style={styles.icons}>
        {settings ? (
          <Pressable hitSlop={10} onPress={() => router.push('/account')} accessibilityRole="button" accessibilityLabel="계정 · 설정">
            <GearSix size={26} color={colors.text} weight="regular" />
          </Pressable>
        ) : (
          <>
            <Pressable hitSlop={10} onPress={() => router.push('/search')} accessibilityRole="button" accessibilityLabel="검색">
              <MagnifyingGlass size={26} color={colors.text} weight="regular" />
            </Pressable>
            {title ? null : (
              <Pressable hitSlop={10} onPress={() => router.push('/account')} accessibilityRole="button" accessibilityLabel="내 계정">
                <View style={[styles.avatar, signedIn && styles.avatarOn]}>
                  <User size={18} color={signedIn ? '#fff' : colors.textFaint} weight="fill" />
                </View>
              </Pressable>
            )}
          </>
        )}
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
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6, color: colors.text },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: colors.brand },
  beta: { backgroundColor: colors.beta.bg, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  betaText: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.beta.text },
  icons: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  avatarOn: { backgroundColor: colors.brand },
});
