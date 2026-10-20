import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from '../ui/Text';
import { Link } from 'expo-router';
import { ECON_CATEGORIES } from '@ailens/domain';
import { accent, colors } from '../theme';

/** 상단 카테고리 줄 — 웹 헤더의 카테고리 탭에 해당. 홈이 "전체", 나머지는 카테고리 목록 화면으로 간다. */
export function CategoryChips({ active }: { active?: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.wrap}>
      <Link href="/" asChild>
        <Pressable style={styles.chip} accessibilityRole="link">
          <Text style={[styles.text, !active && styles.on]}>전체</Text>
        </Pressable>
      </Link>
      {ECON_CATEGORIES.map((c) => (
        <Link key={c.slug} href={{ pathname: '/category/[slug]', params: { slug: c.slug } }} asChild>
          <Pressable style={styles.chip} accessibilityRole="link">
            <Text style={[styles.text, active === c.slug && styles.on]}>{c.label}</Text>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 0, backgroundColor: colors.bg },
  row: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: {},
  text: { overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f1f3f6', fontSize: 14, fontWeight: '600', color: '#6b7280' },
  on: { backgroundColor: accent.main, color: '#fff', fontWeight: '700' },
});
