import { Pressable, StyleSheet, View } from 'react-native';
import { Link, type Href } from 'expo-router';
import { Text } from '../../../ui/Text';
import { CaretRight } from '../../../ui/icons';
import { NewsRow } from '../../../components/NewsRow';
import { colors } from '../../../theme';
import type { FeedItem } from '../model';
import { SectionHeader } from './SectionHeader';

/**
 * 최신 기사 목록. 홈("최신 기사")에는 3건 + "새 소식 더 보러 가기"로 발견 탭에 연결하고,
 * 발견 탭에는 맨 위에 "최신 기사" 섹션(더 보기 없음)으로 둔다. 카테고리 필터는 발견 탭의 칩이 맡는다.
 */
export function LatestSection({ items, title = '방금 올라온 소식', moreHref }: { items: FeedItem[]; title?: string; moreHref?: Href }) {
  if (items.length === 0) return null;
  return (
    <View>
      <SectionHeader title={title} right={moreHref ? '더 보기' : undefined} href={moreHref} />
      {items.map((item, i) => (
        <NewsRow key={item.id} item={item} divider={i > 0} />
      ))}
      {moreHref ? (
        <Link href={moreHref} asChild>
          <Pressable style={styles.more} accessibilityRole="link">
            <Text style={styles.moreText}>새 소식 더 보러 가기</Text>
            <CaretRight size={14} color={colors.textSub} weight="bold" />
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  more: { marginTop: 6, height: 46, borderRadius: 14, backgroundColor: '#f4f6fa', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  moreText: { fontSize: 14, fontWeight: '700', color: colors.textSub },
});
