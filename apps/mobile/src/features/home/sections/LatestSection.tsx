import { Pressable, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import { Text } from '../../../ui/Text';
import { CaretRight } from '../../../ui/icons';
import { NewsRow } from '../../../components/NewsRow';
import { colors } from '../../../theme';
import type { FeedItem } from '../model';
import { SectionHeader } from './SectionHeader';

/**
 * "방금 올라온 소식" — 홈에는 2~3건만 깔끔하게 보여 주고, 더 보려면 전체 목록(/latest)으로 이동한다.
 * 머리의 "더 보기"와 맨 아래 큰 버튼이 같은 곳으로 간다.
 */
export function LatestSection({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return null;
  return (
    <View>
      <SectionHeader title="방금 올라온 소식" right="더 보기" href="/latest" />
      {items.map((item, i) => (
        <NewsRow key={item.id} item={item} divider={i > 0} />
      ))}
      <Link href="/latest" asChild>
        <Pressable style={styles.more} accessibilityRole="link">
          <Text style={styles.moreText}>최신 소식 더 보기</Text>
          <CaretRight size={14} color={colors.textSub} weight="bold" />
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  more: { marginTop: 6, height: 46, borderRadius: 14, backgroundColor: '#f4f6fa', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  moreText: { fontSize: 14, fontWeight: '700', color: colors.textSub },
});
