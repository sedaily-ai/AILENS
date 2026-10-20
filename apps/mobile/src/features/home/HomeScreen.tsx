import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../components/AppHeader';
import { MiniPlayer } from '../../components/MiniPlayer';
import { colors, surface } from '../../theme';
import { useHomeData, type HomeData } from './useHomeData';
import { LatestSection } from './sections/LatestSection';
import { PaperHero } from './sections/PaperHero';
import { TimeMachineCard } from './sections/TimeMachineCard';
import { EditorChat } from './sections/EditorChat';
import { EditorPicker } from './sections/EditorPicker';
import { FormatCarousel } from './sections/FormatCarousel';
import { BriefingSettings } from './sections/BriefingSettings';
import { useMyEditor } from './myEditor';
import { useDailyProgress } from './dailyProgress';
import { useBriefingPrefs } from './briefingPrefs';
import { bookmarks, getInterests, history } from '../mylens/stores';
import { useListStore } from '../mylens/listStore';

const LATEST_COUNT = 3;

/**
 * 홈은 "오늘 내 몫을 끝내는 곳"이다: 오늘의 브리핑(인사 · 진행 · 이번 주) → 오늘 챙길 3가지 → 오늘의 지면 → 최신 뉴스 → 그날로 떠나요.
 * 카테고리 섹션·웹툰·영상·레터는 "발견" 탭(src/features/discover)에 있다.
 */
type Section = { key: string; render: () => React.ReactElement | null };

interface Ctx {
  progress: ReturnType<typeof useDailyProgress>;
  prefs: ReturnType<typeof useBriefingPrefs>;
  interests: string[];
  myEditor: ReturnType<typeof useMyEditor>;
  readIds: Set<string>;
  openPicker: () => void;
  openSettings: () => void;
  scrollToChat: (yInCard: number) => void;
}

function buildSections(data: HomeData, c: Ctx): Section[] {
  return [
    {
      key: 'chat',
      render: () => (
        <EditorChat
          editor={c.myEditor.editor}
          picked={c.myEditor.picked}
          lens={data.lens}
          interests={c.interests}
          readIds={c.readIds}
          situation={c.prefs.situation}
          streak={c.progress.streak}
          onChangeEditor={c.openPicker}
          onOpenSettings={c.openSettings}
          onOpened={c.scrollToChat}
        />
      ),
    },
    { key: 'formats', render: () => <FormatCarousel situation={c.prefs.situation} /> },
    { key: 'paper', render: () => <PaperHero lens={data.lens} compact /> },
    { key: 'latest', render: () => <LatestSection items={data.latest.slice(0, LATEST_COUNT)} moreHref="/discover" /> },
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
  const myEditor = useMyEditor(interests);
  const listRef = useRef<FlatList<{ key: string; render: () => React.ReactElement | null }>>(null);
  // 질문을 열면 그 질문이 상단바 바로 아래에 오도록 스크롤한다(풀이가 길어도 맨 위부터 읽게). 목록 위 여백(16) + 카드 안 위치.
  const scrollToChat = (yInCard: number) => listRef.current?.scrollToOffset({ offset: Math.max(0, 16 + yInCard - 8), animated: true });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    void getInterests().then(setInterests);
  }, []);
  // 이미 읽은 기사는 질문 후보에서 뒤로 밀린다(읽을수록 질문이 새로워진다).
  const readIds = useMemo(() => new Set(read.items.map((r) => r.id)), [read.items]);

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
            ref={listRef}
            data={buildSections(state.data, { progress, prefs, interests, myEditor, readIds, openPicker: () => setPickerOpen(true), openSettings: () => setSettingsOpen(true), scrollToChat })}
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
      <EditorPicker open={pickerOpen} onClose={() => setPickerOpen(false)} editor={myEditor.editor} />
      <BriefingSettings hideTrigger open={settingsOpen} onClose={() => setSettingsOpen(false)} prefs={prefs} interests={interests} onInterests={setInterests} />
      <MiniPlayer />
    </SafeAreaView>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: surface.page },
  body: { flex: 1 },
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  divider: { height: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  msg: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  btn: { marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f3f4f6' },
  btnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
