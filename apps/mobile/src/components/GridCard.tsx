import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../ui/Text';
import { Link } from 'expo-router';
import type { FeedItem } from '../features/home/model';
import { kstDateTime } from '../lib/format';
import { colors, radius } from '../theme';

/** 웹 ArticleGridCard: 16:9 썸네일 + 제목 2줄 + 요약 2줄 + 카테고리·날짜. 2열 그리드의 한 칸. */
export function GridCard({ item }: { item: FeedItem }) {
  return (
    <Link href={{ pathname: '/article/[slug]', params: { slug: item.id } }} asChild>
      <Pressable style={styles.card} accessibilityRole="link">
        <View style={styles.thumb}>
          {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.img} resizeMode="cover" /> : null}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {item.excerpt ? (
          <Text style={styles.excerpt} numberOfLines={2}>
            {item.excerpt}
          </Text>
        ) : null}
        <View style={styles.meta}>
          {item.category ? <Text style={styles.cat}>{item.category}</Text> : null}
          <Text style={styles.date}>{kstDateTime(item.publishedAt, item.date)}</Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1 },
  thumb: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.imagePlaceholder,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,24,39,0.06)',
  },
  img: { width: '100%', height: '100%' },
  title: { marginTop: 10, fontSize: 15, lineHeight: 21, fontWeight: '700', letterSpacing: -0.15, color: colors.text },
  excerpt: { marginTop: 5, fontSize: 12.5, lineHeight: 19, color: colors.textMuted },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  cat: { fontSize: 12, fontWeight: '800', color: '#2563eb' },
  date: { fontSize: 12, color: colors.textFaint },
});
