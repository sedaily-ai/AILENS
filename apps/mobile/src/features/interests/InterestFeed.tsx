import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text } from '../../ui/Text';
import { AppHeader } from '../../components/AppHeader';
import { MiniPlayer } from '../../components/MiniPlayer';
import { NewsRow } from '../../components/NewsRow';
import { colors, accent } from '../../theme';
import type { FeedItem } from '../home/model';
import { loadSearchIndex } from '../search/searchData';
import { slugOfCategory } from './dictionary';
import { feedFor, keyOf, type Interest, type InterestType, type RecLike } from './match';
import { removeInterest, toggleInterest, useInterestItems } from './store';

const toFeed = (r: RecLike): FeedItem => ({ id: r.i, title: r.h, excerpt: r.s ?? '', category: r.c, publishedAt: r.t || null, date: r.d, imageUrl: r.p || null });

/** 한 관심(분야·섹터·화두)의 소식 목록 — 최신순 40건. 상단에서 이 관심을 빼거나 다시 담을 수 있다. */
export function InterestFeed() {
  const p = useLocalSearchParams<{ type: string; id: string; label: string }>();
  const it: Interest = { type: (p.type as InterestType) ?? 'topic', key: String(p.id ?? ''), label: String(p.label ?? '') };
  const { items } = useInterestItems();
  const saved = items.some((x) => keyOf(x) === keyOf(it));
  const [recs, setRecs] = useState<RecLike[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    loadSearchIndex().then((r) => setRecs(r as unknown as RecLike[]), () => setFailed(true));
  }, []);
  const feed = useMemo(() => (recs ? feedFor(it, recs, (c) => slugOfCategory(c), 40) : []), [recs, it.type, it.key, it.label]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader title={it.label || '내 관심'} back />
      <View style={styles.bar}>
        <Text style={styles.sub}>{recs ? `${feed.length}건의 소식` : ' '}</Text>
        <Pressable
          onPress={() => (saved ? void removeInterest(it) : void toggleInterest(it))}
          style={[styles.pill, saved && styles.pillOn]}
          accessibilityRole="button"
          accessibilityState={{ selected: saved }}
        >
          <Text style={[styles.pillText, saved && { color: '#fff' }]}>{saved ? '내 관심에서 빼기' : '내 관심에 담기'}</Text>
        </Pressable>
      </View>
      {failed ? (
        <View style={styles.center}><Text style={styles.msg}>소식을 불러오지 못했어요.</Text></View>
      ) : recs === null ? (
        <View style={styles.center}><ActivityIndicator color="#2563eb" /></View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={(r) => r.i}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.msg}>아직 이 관심의 소식이 없어요.</Text>}
          renderItem={({ item, index }) => <NewsRow item={toFeed(item)} divider={index > 0} />}
        />
      )}
      <MiniPlayer />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  sub: { fontSize: 13.5, fontWeight: '700', color: colors.textMuted },
  pill: { height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: accent.soft, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: accent.main },
  pillText: { fontSize: 13.5, fontWeight: '800', color: accent.ink },
  list: { paddingHorizontal: 20, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  msg: { textAlign: 'center', color: colors.textMuted, fontSize: 14, marginTop: 24 },
});
