import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import { CategoryChips } from '../../components/CategoryChips';
import { MiniPlayer } from '../../components/MiniPlayer';
import { colors } from '../../theme';
import { groupByCategory } from '../home/model';
import { CategorySection } from '../home/sections/CategorySection';
import { LettersSection } from '../home/sections/LettersSection';
import { VideoSection, WebtoonSection } from '../home/sections/MediaRails';
import { useHomeData, type HomeData } from '../home/useHomeData';

type Section = { key: string; render: () => React.ReactElement | null };

/**
 * 발견 — 카테고리 탐색의 출발점(뉴닉의 "발견" 탭에 해당). 상단 카테고리 칩 아래에
 * 카테고리 섹션(웹의 짝 배치 순서) 사이사이로 웹툰·영상 레일과 레터를 끼운다.
 */
function buildSections(data: HomeData): Section[] {
  const groups = groupByCategory(data.latest);
  const cat = (from: number, to: number): Section[] =>
    groups.slice(from, to).map((g) => ({ key: `cat-${g.category.slug}`, render: () => <CategorySection group={g} /> }));
  return [
    ...cat(0, 4),
    { key: 'webtoon', render: () => <WebtoonSection items={data.webtoons} /> },
    { key: 'video', render: () => <VideoSection items={data.videos} /> },
    ...cat(4, 6),
    { key: 'letters', render: () => <LettersSection items={data.letters} /> },
    ...cat(6, 9),
  ];
}

export function DiscoverScreen() {
  const { state, refreshing, reload, refresh } = useHomeData({ media: true });
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <AppHeader />
      <CategoryChips />
      <View style={styles.body}>
        {state.status === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color="#2563eb" />
          </View>
        ) : state.status === 'error' ? (
          <View style={styles.center}>
            <Text style={styles.msg}>불러오지 못했어요. {state.message}</Text>
            <Pressable style={styles.btn} onPress={reload} accessibilityRole="button">
              <Text style={styles.btnText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={buildSections(state.data)}
            keyExtractor={(s) => s.key}
            renderItem={({ item }) => item.render()}
            ItemSeparatorComponent={() => <View style={styles.divider} />}
            contentContainerStyle={styles.list}
            onRefresh={refresh}
            refreshing={refreshing}
            initialNumToRender={3}
            windowSize={7}
          />
        )}
      </View>
      <MiniPlayer />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  list: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  msg: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  btn: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f3f4f6' },
  btnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
