import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import type { SearchRecord } from '@ailens/domain';
import { Text } from '../../ui/Text';
import { AppHeader } from '../../components/AppHeader';
import { MiniPlayer } from '../../components/MiniPlayer';
import { NewsRow } from '../../components/NewsRow';
import { colors } from '../../theme';
import type { FeedItem } from '../home/model';
import { loadSearchIndex } from '../search/searchData';

const PAGE = 20;
const toFeed = (r: SearchRecord): FeedItem => ({ id: r.i, title: r.h, excerpt: r.s, category: r.c, publishedAt: r.t || null, date: r.d, imageUrl: r.p || null });

/** 최신 소식 전체 — 검색과 같은 가벼운 전체 목록(/api/search-index)을 최신순으로 20건씩 이어 붙인다. 홈 "방금 올라온 소식"의 더 보기가 이리로 온다. */
export function LatestScreen() {
  const [all, setAll] = useState<SearchRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const load = () => {
    setFailed(false);
    setAll(null);
    loadSearchIndex().then(setAll, () => setFailed(true));
  };
  useEffect(load, []);

  const sorted = useMemo(() => (all ? all.slice().sort((a, b) => (b.t || b.d).localeCompare(a.t || a.d)) : []), [all]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader title="최신 소식" back />
      {failed ? (
        <View style={styles.center}>
          <Text style={styles.msg}>목록을 불러오지 못했어요.</Text>
          <Pressable style={styles.btn} onPress={load} accessibilityRole="button">
            <Text style={styles.btnText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : all === null ? (
        <View style={styles.center}><ActivityIndicator color="#2563eb" /></View>
      ) : (
        <FlatList
          data={sorted.slice(0, limit)}
          keyExtractor={(r) => r.i}
          contentContainerStyle={styles.list}
          onEndReachedThreshold={0.5}
          onEndReached={() => setLimit((n) => (n < sorted.length ? n + PAGE : n))}
          renderItem={({ item, index }) => <NewsRow item={toFeed(item)} divider={index > 0} />}
        />
      )}
      <MiniPlayer />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  msg: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  btn: { marginTop: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: '#f1f3f6' },
  btnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
