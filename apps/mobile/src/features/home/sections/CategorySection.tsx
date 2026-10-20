import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../ui/Text';
import { Link } from 'expo-router';
import { colors, radius } from '../../../theme';
import { CaretRight } from '../../../ui/icons';
import { kstDateTime } from '../../../lib/format';
import type { CategoryGroup } from '../model';

/** 카테고리 섹션 — 대표 기사 1건(이미지·제목·요약) + 목록 3건. 웹 CategoryFeatureSection 의 모바일 단일 칼럼 배치. */
export function CategorySection({ group }: { group: CategoryGroup }) {
  const [hero, ...rest] = group.items;
  const list = rest.slice(0, 3);
  const { category } = group;
  return (
    <View>
      <Link href={{ pathname: '/category/[slug]', params: { slug: category.slug } }} asChild>
        <Pressable style={styles.head} accessibilityRole="link">
          <Text style={[styles.title, { color: category.accent }]}>{category.label}</Text>
          <View style={styles.moreRow}>
            <Text style={styles.more}>더 보기</Text>
            <CaretRight size={13} color={colors.textFaint} weight="bold" />
          </View>
        </Pressable>
      </Link>
      <Link href={{ pathname: '/article/[slug]', params: { slug: hero.id } }} asChild>
        <Pressable accessibilityRole="link">
          {hero.imageUrl ? (
            <View style={styles.thumb}>
              <Image source={{ uri: hero.imageUrl }} style={styles.img} resizeMode="cover" />
            </View>
          ) : null}
          <Text style={styles.heroTitle} numberOfLines={3}>
            {hero.title}
          </Text>
          {hero.excerpt ? (
            <Text style={styles.excerpt} numberOfLines={2}>
              {hero.excerpt}
            </Text>
          ) : null}
          <Text style={styles.meta}>{kstDateTime(hero.publishedAt, hero.date)}</Text>
        </Pressable>
      </Link>
      {list.map((it) => (
        <Link key={it.id} href={{ pathname: '/article/[slug]', params: { slug: it.id } }} asChild>
          <Pressable style={styles.listRow} accessibilityRole="link">
            <Text style={styles.listTitle} numberOfLines={2}>
              {it.title}
            </Text>
            <Text style={styles.meta}>{kstDateTime(it.publishedAt, it.date)}</Text>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  more: { fontSize: 13.5, fontWeight: '600', color: colors.textFaint },
  thumb: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: colors.imagePlaceholder, marginBottom: 10 },
  img: { width: '100%', height: '100%' },
  heroTitle: { fontSize: 18, lineHeight: 26, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  excerpt: { marginTop: 6, fontSize: 13.5, lineHeight: 20, color: colors.textMuted },
  meta: { marginTop: 6, fontSize: 12, color: colors.textFaint },
  listRow: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, marginTop: 12 },
  listTitle: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: colors.text },
});
