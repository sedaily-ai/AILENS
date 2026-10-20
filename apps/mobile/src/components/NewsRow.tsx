import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import { Text } from '../ui/Text';
import { relativeTime } from '../lib/format';
import { colors } from '../theme';
import type { FeedItem } from '../features/home/model';

/** 뉴스 한 줄 — 분야 · 몇 분 전 / 제목 2줄 / 오른쪽 작은 썸네일. 홈·발견의 "방금 올라온 소식"이 함께 쓴다. */
export function NewsRow({ item, divider }: { item: FeedItem; divider?: boolean }) {
  return (
    <Link href={{ pathname: '/article/[slug]', params: { slug: item.id } }} asChild>
      <Pressable style={StyleSheet.flatten([styles.row, divider && styles.divider])} accessibilityRole="link">
        <View style={styles.text}>
          <View style={styles.metaRow}>
            {item.category ? <Text style={styles.cat}>{item.category}</Text> : null}
            <Text style={styles.time}>{relativeTime(item.publishedAt, item.date)}</Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        </View>
        {item.imageUrl ? (
          <View style={styles.thumb}>
            <Image source={{ uri: item.imageUrl }} style={styles.img} resizeMode="cover" />
          </View>
        ) : null}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  text: { flex: 1, minWidth: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  cat: { fontSize: 12, fontWeight: '800', color: '#2563eb' },
  time: { fontSize: 12, fontWeight: '600', color: colors.textFaint },
  title: { fontSize: 15.5, lineHeight: 22, fontWeight: '700', letterSpacing: -0.25, color: colors.text },
  thumb: { width: 76, height: 76, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.imagePlaceholder },
  img: { width: '100%', height: '100%' },
});
