import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import { MiniPlayer } from '../../components/MiniPlayer';
import { colors } from '../../theme';
import { useHomeData, type HomeData } from './useHomeData';
import { LatestSection } from './sections/LatestSection';
import { PaperHero } from './sections/PaperHero';
import { TimeMachineCard } from './sections/TimeMachineCard';
import { StartCard } from './sections/StartCard';
import { useOnboardingCompleted } from '../onboarding/prefs';

const LATEST_COUNT = 8;

/**
 * 홈은 "오늘의 핵심"에 집중한다(뉴닉 구조): 오늘의 지면 → 최신 뉴스 → 그날로 떠나요.
 * 카테고리 섹션·웹툰·영상·레터는 "발견" 탭(src/features/discover)으로 옮겼다.
 */
type Section = { key: string; render: () => React.ReactElement | null };

function buildSections(data: HomeData, showStart: boolean): Section[] {
  return [
    ...(showStart ? [{ key: 'start', render: () => <StartCard /> }] : []),
    { key: 'paper', render: () => <PaperHero lens={data.lens} /> },
    { key: 'latest', render: () => <LatestSection items={data.latest.slice(0, LATEST_COUNT)} /> },
    { key: 'timemachine', render: () => <TimeMachineCard /> },
  ];
}

// 홈 화면. 로드 상태와 섹션 조립만 맡고, 데이터 규칙은 model.ts, 조회는 useHomeData.ts, 화면 조각은 sections/* 에 있다.
export function HomeScreen() {
  const { state, refreshing, reload, refresh } = useHomeData({ media: false });
  const onboarded = useOnboardingCompleted();

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
            data={buildSections(state.data, onboarded === false)}
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
