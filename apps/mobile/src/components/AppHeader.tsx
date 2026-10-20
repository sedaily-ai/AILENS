import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../ui/Text';
import { useRouter } from 'expo-router';
import { CaretLeft, GearSix, MagnifyingGlass, User } from '../ui/icons';
import { useAuth } from '../auth/AuthContext';
import { accent, colors } from '../theme';
import { BrandMark } from './BrandMark';

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
            <Pressable hitSlop={10} onPress={() => router.back()} style={styles.btn} accessibilityRole="button" accessibilityLabel="뒤로">
              <CaretLeft size={22} color={colors.text} weight="bold" />
            </Pressable>
          ) : null}
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
      ) : (
        <View style={styles.brandRow} accessibilityRole="header">
          <BrandMark size={26} />
          <Text style={styles.brand}>AI LENS</Text>
          <View style={styles.beta}>
            <Text style={styles.betaText}>BETA</Text>
          </View>
        </View>
      )}
      <View style={styles.icons}>
        {settings ? (
          <Pressable hitSlop={6} onPress={() => router.push('/account')} style={styles.btn} accessibilityRole="button" accessibilityLabel="계정 · 설정">
            <GearSix size={22} color={colors.text} weight="regular" />
          </Pressable>
        ) : (
          <>
            <Pressable hitSlop={6} onPress={() => router.push('/search')} style={styles.btn} accessibilityRole="button" accessibilityLabel="검색">
              <MagnifyingGlass size={22} color={colors.text} weight="regular" />
            </Pressable>
            {title ? null : (
              <Pressable hitSlop={6} onPress={() => router.push('/account')} style={[styles.btn, signedIn && styles.btnOn]} accessibilityRole="button" accessibilityLabel="내 계정">
                <User size={20} color={signedIn ? '#fff' : colors.text} weight={signedIn ? 'fill' : 'regular'} />
              </Pressable>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 배경은 투명 — 화면 바탕(홈은 연한 회색)과 이어져 상단바가 따로 떠 보이지 않는다. 구분선도 없다.
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 16, height: 60 },
  title: { flexShrink: 1, fontSize: 24, fontWeight: '800', letterSpacing: -0.6, color: colors.text },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, color: colors.brand },
  beta: { backgroundColor: accent.soft, borderRadius: 999, paddingHorizontal: 7, height: 18, alignItems: 'center', justifyContent: 'center' },
  betaText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, color: accent.ink },
  icons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // 아이콘 버튼은 모두 같은 40px 원(흰 면 + 얇은 선)이라 크기·위치가 맞는다. 로그인 상태의 프로필만 네이비로 채운다.
  btn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e6eaf1', alignItems: 'center', justifyContent: 'center' },
  btnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
});
