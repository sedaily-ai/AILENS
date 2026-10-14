import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchBigkindsDay, fetchDayArticles, isArchiveDate, type BigKindsArticle, type DayArticle, type InvestmentScenario } from '@ailens/api-client';
import { AsyncView } from '../../components/AsyncView';
import { kstDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { colors } from '../../theme';
import { clampDate, isValidDate, kstToday, longDate, shiftDate } from './dates';

type Day = { kind: 'archive'; articles: DayArticle[] } | { kind: 'bigkinds'; articles: BigKindsArticle[]; investments: InvestmentScenario[] };

const SOURCE = {
  archive: '서울경제 기사',
  bigkinds: '빅카인즈 뉴스빅데이터 제공 · 발행 시각 정보 없음',
} as const;

/** 그날의 신문 — 날짜 구간에 따라 서울경제 S3 아카이브 또는 빅카인즈를 보여 준다(웹 /timeline/[date] 대응). 기사 원문은 서울경제 사이트로 연결한다. */
export function TimelineDay() {
  const router = useRouter();
  const { date: raw } = useLocalSearchParams<{ date: string }>();
  const today = kstToday();
  const date = isValidDate(raw) ? clampDate(raw, today) : today;
  const { state, reload } = useAsync<Day>(async (signal) => {
    if (isArchiveDate(date)) return { kind: 'archive', articles: await fetchDayArticles(date, signal) };
    const d = await fetchBigkindsDay(date, signal);
    return { kind: 'bigkinds', ...d };
  }, [date]);

  const move = (n: number) => {
    const next = shiftDate(date, n);
    if (next >= '1990-01-01' && next <= today) router.setParams({ date: next });
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: '그날의 신문' }} />
      <View style={styles.bar}>
        <Pressable onPress={() => move(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="하루 전"><Ionicons name="chevron-back" size={26} color={colors.text} /></Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.date}>{longDate(date)}</Text>
          <Text style={styles.src}>{SOURCE[isArchiveDate(date) ? 'archive' : 'bigkinds']}</Text>
        </View>
        <Pressable onPress={() => move(1)} hitSlop={10} disabled={date >= today} accessibilityRole="button" accessibilityLabel="하루 뒤"><Ionicons name="chevron-forward" size={26} color={date >= today ? colors.line : colors.text} /></Pressable>
      </View>
      <AsyncView state={state} onRetry={reload}>
        {(day) => (
          <FlatList
            data={day.articles as Array<DayArticle | BigKindsArticle>}
            keyExtractor={(a, i) => a.news_id || String(i)}
            contentContainerStyle={styles.list}
            ListHeaderComponent={day.kind === 'bigkinds' && day.investments.length > 0 ? <Investments items={day.investments} /> : null}
            ListEmptyComponent={<Text style={styles.empty}>이 날의 기사를 찾지 못했어요.</Text>}
            renderItem={({ item }) => {
              const link = item.original_link;
              const when = 'published_at' in item && item.published_at ? kstDateTime(item.published_at) : '';
              return (
                <Pressable style={styles.row} onPress={() => link && void Linking.openURL(link)} disabled={!link} accessibilityRole="link">
                  <Text style={styles.cat}>{[item.category, when].filter(Boolean).join('  ')}</Text>
                  <Text style={styles.title}>{item.title}</Text>
                  {item.byline ? <Text style={styles.by}>{item.byline.endsWith('기자') ? item.byline : `${item.byline} 기자`}</Text> : null}
                </Pressable>
              );
            }}
          />
        )}
      </AsyncView>
    </View>
  );
}

function Investments({ items }: { items: InvestmentScenario[] }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.invHead}>그날 이걸 샀다면</Text>
      {items.map((i) => (
        <View key={i.id} style={styles.inv}>
          <Text style={styles.invLabel}>{i.emoji} {i.label}</Text>
          <Text style={styles.invDesc}>{i.description}</Text>
          <Text style={styles.invHl}>{i.highlight}</Text>
          <Text style={styles.invRes}>{i.result}</Text>
          {i.story ? <Text style={styles.invStory}>{i.story}</Text> : null}
          <Text style={styles.invSrc}>{i.source_label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  date: { fontSize: 17, fontWeight: '800', color: colors.text },
  src: { marginTop: 3, fontSize: 11.5, color: colors.textFaint },
  list: { padding: 20, paddingBottom: 48 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  row: { paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  cat: { fontSize: 12, fontWeight: '700', color: '#2563eb' },
  title: { marginTop: 4, fontSize: 16, lineHeight: 23, fontWeight: '700', color: colors.text },
  by: { marginTop: 4, fontSize: 12, color: colors.textFaint },
  invHead: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 10 },
  inv: { padding: 16, borderRadius: 14, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 10 },
  invLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  invDesc: { marginTop: 6, fontSize: 13.5, lineHeight: 20, color: colors.textMuted },
  invHl: { marginTop: 8, fontSize: 24, fontWeight: '800', color: '#2563eb' },
  invRes: { marginTop: 4, fontSize: 13.5, lineHeight: 20, color: colors.text },
  invStory: { marginTop: 8, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  invSrc: { marginTop: 8, fontSize: 11.5, color: colors.textFaint },
});
