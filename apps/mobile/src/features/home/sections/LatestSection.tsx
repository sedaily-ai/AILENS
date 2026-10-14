import { StyleSheet, View } from 'react-native';
import { GridCard } from '../../../components/GridCard';
import type { FeedItem } from '../model';
import { SectionHeader } from './SectionHeader';

/** "최신 뉴스" 2열 그리드. 홀수 개면 마지막 칸을 비워 폭을 맞춘다. */
export function LatestSection({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return null;
  const rows: FeedItem[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View>
      <SectionHeader title="최신 뉴스" right="전체 보기 →" />
      {rows.map((row, idx) => (
        <View key={idx} style={styles.row}>
          {row.map((item) => (
            <GridCard key={item.id} item={item} />
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 16, marginBottom: 28 },
});
