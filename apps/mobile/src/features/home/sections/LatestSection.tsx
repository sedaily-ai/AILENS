import { StyleSheet, View } from 'react-native';
import type { Href } from 'expo-router';
import { NewsRow } from '../../../components/NewsRow';
import { colors, surface } from '../../../theme';
import type { FeedItem } from '../model';
import { SectionHeader } from './SectionHeader';

/**
 * 최신 소식 목록. 홈("방금 올라온 소식")에는 3건 + 머리의 "더 보기 >"로 발견 탭에 연결하고,
 * 발견 탭에는 맨 위에 같은 섹션(더 보기 없음)으로 둔다. 아래에 따로 버튼을 두지 않는다(링크가 한 곳이어야 헷갈리지 않는다). 카테고리 필터는 발견 탭의 칩이 맡는다.
 */
export function LatestSection({ items, title = '방금 올라온 소식', moreHref }: { items: FeedItem[]; title?: string; moreHref?: Href }) {
  if (items.length === 0) return null;
  return (
    <View>
      <View>
        {items.map((item, i) => (
          <NewsRow key={item.id} item={item} divider={i > 0} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
});
