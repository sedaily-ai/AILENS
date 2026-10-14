import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listPosts, type LensPost } from '@ailens/api-client';
import { AsyncView } from '../../src/components/AsyncView';
import { clampDate, isValidDate, kstToday, longDate, shiftDate } from '../../src/features/timeline/dates';
import { PaperHero } from '../../src/features/home/sections/PaperHero';
import { useAsync } from '../../src/lib/useAsync';
import { colors } from '../../src/theme';

// 지난 지면 — 그날 발행된 LENS 글을 오늘의 지면과 같은 4탭(지면/증권/산업/시그널)으로 본다(웹 /paper/[date] 대응). ◀ ▶ 로 하루씩 이동.
export default function PaperDay() {
  const router = useRouter();
  const { date: raw } = useLocalSearchParams<{ date: string }>();
  const today = kstToday();
  const date = isValidDate(raw) ? clampDate(raw, today) : today;
  const { state, reload } = useAsync((signal) => listPosts<LensPost>('lens', { date, limit: 100, signal }), [date]);
  const move = (n: number) => {
    const next = shiftDate(date, n);
    if (next <= today) router.setParams({ date: next });
  };
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: '지난 지면' }} />
      <View style={styles.bar}>
        <Pressable onPress={() => move(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="하루 전"><Ionicons name="chevron-back" size={26} color={colors.text} /></Pressable>
        <Text style={styles.date}>{longDate(date)}</Text>
        <Pressable onPress={() => move(1)} hitSlop={10} disabled={date >= today} accessibilityRole="button" accessibilityLabel="하루 뒤"><Ionicons name="chevron-forward" size={26} color={date >= today ? colors.line : colors.text} /></Pressable>
      </View>
      <AsyncView state={state} onRetry={reload}>
        {(lens) => (
          <ScrollView contentContainerStyle={styles.body}>
            {lens.some((l) => l.paper_section) ? <PaperHero lens={lens} linkPast={false} /> : <Text style={styles.empty}>이 날 발행된 지면이 없어요.</Text>}
          </ScrollView>
        )}
      </AsyncView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  date: { fontSize: 17, fontWeight: '800', color: colors.text },
  body: { padding: 20, paddingBottom: 48 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
