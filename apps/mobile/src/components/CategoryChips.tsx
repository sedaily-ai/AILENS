import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from '../ui/Text';
import { Link } from 'expo-router';
import { ECON_CATEGORIES } from '@ailens/domain';
import { colors } from '../theme';

/** 상단 카테고리 줄 — 웹 헤더의 카테고리 탭에 해당. 홈이 "전체", 나머지는 카테고리 목록 화면으로 간다. */
export function CategoryChips({ active }: { active?: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.wrap}>
      <Link href="/" asChild>
        <Pressable style={styles.chip} accessibilityRole="link">
          <Text style={[styles.text, !active && styles.on]}>전체</Text>
          <Underline on={!active} />
        </Pressable>
      </Link>
      {ECON_CATEGORIES.map((c) => (
        <Link key={c.slug} href={{ pathname: '/category/[slug]', params: { slug: c.slug } }} asChild>
          <Pressable style={styles.chip} accessibilityRole="link">
            <Text style={[styles.text, active === c.slug && styles.on]}>{c.label}</Text>
            <Underline on={active === c.slug} />
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}

function Underline({ on }: { on: boolean }) {
  return <Text style={[styles.bar, on && styles.barOn]}>{' '}</Text>;
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 0, backgroundColor: colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  row: { paddingHorizontal: 12, gap: 4 },
  chip: { paddingHorizontal: 10, paddingTop: 12, alignItems: 'center' },
  text: { fontSize: 15, fontWeight: '600', color: colors.textFaint },
  on: { color: colors.text, fontWeight: '800' },
  bar: { height: 2, marginTop: 8, alignSelf: 'stretch', backgroundColor: 'transparent' },
  barOn: { backgroundColor: colors.text },
});
