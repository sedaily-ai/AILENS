import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { Link, Stack } from 'expo-router';
import { listIssueLetters, type IssueLetterCard } from '@ailens/api-client';
import { AsyncView } from '../../components/AsyncView';
import { kstDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { colors } from '../../theme';
import { AXIS_META, orderedAxes } from './axis';

/** 이슈 레터 목록 — 한 이슈를 소식·실체·다른 시각 3축으로 정리한 레터(웹 /letter 대응). 에디터 소개·구독은 이후 단계. */
export function LetterList() {
  const { state, reload } = useAsync((signal) => listIssueLetters(50, signal), []);
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: '이슈 레터' }} />
      <AsyncView state={state} onRetry={reload}>
        {(items: IssueLetterCard[]) => (
          <FlatList
            data={items}
            keyExtractor={(l) => l.slug}
            contentContainerStyle={styles.list}
            ListHeaderComponent={<Text style={styles.lead}>하나의 이슈를 소식 · 실체 · 다른 시각으로 나눠 정리해요.</Text>}
            ListEmptyComponent={<Text style={styles.empty}>아직 발행된 레터가 없어요.</Text>}
            renderItem={({ item }) => (
              <Link href={{ pathname: '/letter/[slug]', params: { slug: item.slug } }} asChild>
                <Pressable style={styles.card} accessibilityRole="link">
                  <View style={styles.axes}>
                    {orderedAxes(item.axes).map((a) => (
                      <View key={a} style={[styles.axis, { backgroundColor: AXIS_META[a].soft }]}>
                        <Text style={[styles.axisText, { color: AXIS_META[a].tone }]}>{AXIS_META[a].label}</Text>
                      </View>
                    ))}
                    <Text style={styles.no}>No.{item.issue_no}</Text>
                  </View>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.deck} numberOfLines={2}>{item.deck}</Text>
                  <Text style={styles.meta}>{[item.categories?.[0], `기사 ${item.source_count}건`, kstDateTime(item.published_at)].filter(Boolean).join('  ·  ')}</Text>
                </Pressable>
              </Link>
            )}
          />
        )}
      </AsyncView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 20, paddingBottom: 40 },
  lead: { fontSize: 14, lineHeight: 21, color: colors.textMuted, marginBottom: 16 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', marginBottom: 12 },
  axes: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  axis: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  axisText: { fontSize: 11.5, fontWeight: '800' },
  no: { marginLeft: 'auto', fontSize: 12, fontWeight: '700', color: colors.textFaint },
  title: { marginTop: 10, fontSize: 18, lineHeight: 26, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  deck: { marginTop: 6, fontSize: 14, lineHeight: 21, color: colors.textMuted },
  meta: { marginTop: 10, fontSize: 12, color: colors.textFaint },
});
