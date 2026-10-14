import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

/** 웹 상단바: AI LENS + BETA 배지, 검색·메뉴 아이콘. 검색·메뉴 동작은 아직 연결 전(UI만). */
export function AppHeader() {
  return (
    <View style={styles.bar}>
      <View style={styles.brandRow}>
        <Text style={styles.brand}>AI LENS</Text>
        <View style={styles.beta}>
          <Text style={styles.betaText}>BETA</Text>
        </View>
      </View>
      <View style={styles.icons}>
        <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel="검색">
          <Ionicons name="search-outline" size={24} color={colors.text} />
        </Pressable>
        <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel="메뉴">
          <Ionicons name="menu" size={28} color={colors.text} />
        </Pressable>
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
    paddingVertical: 14,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, color: colors.brand },
  beta: { backgroundColor: colors.beta.bg, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  betaText: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.beta.text },
  icons: { flexDirection: 'row', alignItems: 'center', gap: 22 },
});
