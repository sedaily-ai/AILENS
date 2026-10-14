import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import { CategoryChips } from '../../components/CategoryChips';
import { MiniPlayer } from '../../components/MiniPlayer';
import { colors } from '../../theme';
import { groupByCategory } from './model';
import { useHomeData, type HomeData } from './useHomeData';
import { CategorySection } from './sections/CategorySection';
import { LatestSection } from './sections/LatestSection';
import { AudioSection, VideoSection, WebtoonSection } from './sections/MediaRails';
import { PaperHero } from './sections/PaperHero';

const LATEST_COUNT = 8;

/** 홈 섹션 순서 — 웹 NewsFeedTab 과 같다. (뉴스 타임머신·게임은 미이행) 카테고리 섹션은 웹의 짝 배치 순서(시그널·부동산·경제·금융·산업·정치·사회·국제·문화)를 따른다. */
type Section = { key: string; render: () => React.ReactElement | null };

function buildSections(data: HomeData): Section[] {
  const groups = groupByCategory(data.latest);
  const cat = (from: number, to: number): Section[] =>
    groups.slice(from, to).map((g) => ({ key: `cat-${g.category.slug}`, render: () => <CategorySection group={g} /> }));
  return [
    { key: 'paper', render: () => <PaperHero lens={data.lens} /> },
    { key: 'latest', render: () => <LatestSection items={data.latest.slice(0, LATEST_COUNT)} /> },
    ...cat(0, 2),
    ...cat(2, 4),
    { key: 'webtoon', render: () => <WebtoonSection items={data.webtoons} /> },
    { key: 'video', render: () => <VideoSection items={data.videos} /> },
    ...cat(4, 6),
    { key: 'audio', render: () => <AudioSection items={data.audio} /> },
    ...cat(6, 9),
  ];
}

// 홈 화면. 로드 상태와 섹션 조립만 맡고, 데이터 규칙은 model.ts, 조회는 useHomeData.ts, 화면 조각은 sections/* 에 있다.
export function HomeScreen() {
  const { state, refreshing, reload, refresh } = useHomeData();

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
            ItemSeparatorComponent={Divider}
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

function Divider() {
  return <View style={styles.divider} />;
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
