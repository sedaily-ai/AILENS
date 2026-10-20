import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import { Text } from '../../../ui/Text';
import { relativeTime } from '../../../lib/format';
import { colors } from '../../../theme';
import type { FeedItem } from '../model';
import { SectionHeader } from './SectionHeader';

/**
 * "최신 뉴스" 목록. 큰 2열 카드 대신 한 줄에 한 건(분야 · 몇 분 전 / 제목 / 작은 썸네일)으로 줄여 한 화면에 여러 건이 보이게 한다.
 * 카테고리와 사진이 더 필요하면 발견 탭에서 본다.
 */
export function LatestSection({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return null;
  return (
    <View>
      <SectionHeader title="방금 올라온 소식" right="더 보기" href="/discover" />
      {items.map((item, i) => (
        <Link key={item.id} href={{ pathname: '/article/[slug]', params: { slug: item.id } }} asChild>
          <Pressable style={StyleSheet.flatten([styles.row, i > 0 && styles.divider])} accessibilityRole="link">
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
      ))}
    </View>
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
