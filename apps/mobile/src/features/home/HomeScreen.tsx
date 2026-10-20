import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import { MiniPlayer } from '../../components/MiniPlayer';
import { colors } from '../../theme';
import { useHomeData, type HomeData } from './useHomeData';
import { LatestSection } from './sections/LatestSection';
import { PaperHero } from './sections/PaperHero';
import { TimeMachineCard } from './sections/TimeMachineCard';
import { BriefingTop } from './sections/BriefingTop';
import { PickCards } from './sections/PickCards';
import { pickBriefing } from './briefing';
import { PAPER_TABS, pickPaperSection } from './model';
import { useDailyProgress } from './dailyProgress';
import { PICK_COUNT, useBriefingPrefs } from './briefingPrefs';
import { getPreferredFormat } from '../onboarding/prefs';
import { bookmarks, getInterests, history } from '../mylens/stores';
import { useListStore } from '../mylens/listStore';

const LATEST_COUNT = 6;

/**
 * 홈은 "오늘 내 몫을 끝내는 곳"이다: 오늘의 브리핑(인사 · 진행 · 이번 주) → 오늘 챙길 3가지 → 오늘의 지면 → 최신 뉴스 → 그날로 떠나요.
 * 카테고리 섹션·웹툰·영상·레터는 "발견" 탭(src/features/discover)에 있다.
 */
type Section = { key: string; render: () => React.ReactElement | null };

function buildSections(data: HomeData, ctx: { progress: ReturnType<typeof useDailyProgress>; picks: ReturnType<typeof pickBriefing>; fmt: number | null; readToday: Set<string>; prefs: ReturnType<typeof useBriefingPrefs>; interests: string[]; setInterests: (s: string[]) => void }): Section[] {
  return [
    { key: 'briefing', render: () => <BriefingTop progress={ctx.progress} picks={ctx.picks} preferredFormat={ctx.fmt} prefs={ctx.prefs} interests={ctx.interests} onInterests={ctx.setInterests} /> },
    { key: 'picks', render: () => <PickCards picks={ctx.picks} readToday={ctx.readToday} /> },
    { key: 'paper', render: () => <PaperHero lens={data.lens} compact /> },
    { key: 'latest', render: () => <LatestSection items={data.latest.slice(0, LATEST_COUNT)} /> },
    { key: 'timemachine', render: () => <TimeMachineCard /> },
  ];
}

// 홈 화면. 로드 상태와 섹션 조립만 맡고, 데이터 규칙은 model.ts, 조회는 useHomeData.ts, 화면 조각은 sections/* 에 있다.
export function HomeScreen() {
  const { state, refreshing, reload, refresh } = useHomeData({ media: false });
  const progress = useDailyProgress();
  const prefs = useBriefingPrefs();
  const read = useListStore(history);
  useListStore(bookmarks);
  const [interests, setInterests] = useState<string[]>([]);
  const [fmt, setFmt] = useState<number | null>(null);
  useEffect(() => {
    void getInterests().then(setInterests);
    void getPreferredFormat().then(setFmt);
  }, []);
  // 오늘 읽은 글은 목록에서 빼지 않고 "읽었어요"로 남긴다(읽을수록 카드가 바뀌면 오늘 챙길 3가지가 흔들리므로). 어제까지 읽은 글만 후보에서 뺀다.
  const startOfToday = useMemo(() => new Date().setHours(0, 0, 0, 0), []);
  const readToday = useMemo(() => new Set(read.items.filter((r) => r.at >= startOfToday).map((r) => r.id)), [read.items, startOfToday]);
  const readBefore = useMemo(() => new Set(read.items.filter((r) => r.at < startOfToday).map((r) => r.id)), [read.items, startOfToday]);
  // 아래 "오늘의 지면" 카드가 첫 화면에 크게 보여 주는 지면 1면 기사는 3가지에서 뺀다(같은 기사가 두 번 나오지 않게).
  const picks = useMemo(() => {
    if (state.status !== 'ready') return [];
    const paperHero = pickPaperSection(state.data.lens, PAPER_TABS[0].paperSection)[0]?.id;
    return pickBriefing(state.data.lens, state.data.latest, interests, readBefore, new Set(paperHero ? [paperHero] : []), PICK_COUNT[prefs.minutes]);
  }, [state, interests, readBefore, prefs.minutes]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <AppHeader />
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
            data={buildSections(state.data, { progress, picks, fmt, readToday, prefs, interests, setInterests })}
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
