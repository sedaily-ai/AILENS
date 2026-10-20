import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../ui/Text';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { accent, colors } from '../../theme';
import { clampDate, isValidDate, kstToday, longDate, shiftDate } from './dates';
import { DECADES, eventsInDecade } from './events';

/**
 * 그날로 떠나요 — 날짜를 직접 고르거나, 사건(역사 속 그날)을 눌러 그날의 신문으로 간다. 웹 홈 "타임머신"·/timeline 대응.
 * 날짜 입력은 달력 대신 숫자 입력 + 하루씩 이동 + 오늘 버튼(네이티브 달력 모듈은 앱 재빌드가 필요해 쓰지 않았다).
 */
export function TimelineHome() {
  const router = useRouter();
  const today = kstToday();
  const [text, setText] = useState(today);
  const [decade, setDecade] = useState<(typeof DECADES)[number]['key']>('2020s');
  const valid = isValidDate(text) && text >= '1990-01-01' && text <= today;
  const events = eventsInDecade(DECADES.find((d) => d.key === decade)!.from);
  const go = (date: string) => router.push({ pathname: '/timeline/[date]', params: { date: clampDate(date) } });
  const step = (n: number) => {
    const base = isValidDate(text) ? text : today;
    setText(clampDate(shiftDate(base, n)));
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: true, title: '그날로 떠나요' }} />
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <Text style={styles.lead}>궁금한 날짜의 신문을 열어 보세요.{'\n'}1990년 1월 1일부터 오늘까지 볼 수 있어요.</Text>
            <View style={styles.picker}>
              <Pressable onPress={() => step(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="하루 전"><Ionicons name="chevron-back" size={26} color={colors.text} /></Pressable>
              <TextInput
                value={text}
                onChangeText={(t) => setText(t.replace(/[^0-9-]/g, '').slice(0, 10))}
                keyboardType="numbers-and-punctuation"
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                accessibilityLabel="날짜"
                onSubmitEditing={() => valid && go(text)}
              />
              <Pressable onPress={() => step(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="하루 뒤"><Ionicons name="chevron-forward" size={26} color={colors.text} /></Pressable>
            </View>
            <Text style={styles.preview}>{valid ? longDate(text) : '날짜를 YYYY-MM-DD 형식으로 입력해 주세요(1990-01-01 ~ 오늘).'}</Text>
            <View style={styles.btnRow}>
              <Pressable style={[styles.go, !valid && { opacity: 0.4 }]} disabled={!valid} onPress={() => go(text)} accessibilityRole="button">
                <Text style={styles.goText}>그날로 떠나기</Text>
              </Pressable>
              <Pressable style={styles.today} onPress={() => setText(today)} accessibilityRole="button"><Text style={styles.todayText}>오늘</Text></Pressable>
            </View>

            <Text style={styles.sec}>역사 속 그날</Text>
            <View style={styles.decades}>
              {DECADES.map((d) => (
                <Pressable key={d.key} onPress={() => setDecade(d.key)} style={[styles.dec, decade === d.key && styles.decOn]} accessibilityRole="button" accessibilityState={{ selected: decade === d.key }}>
                  <Text style={[styles.decText, decade === d.key && styles.decTextOn]}>{d.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>이 연대의 사건이 아직 없어요.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.event} onPress={() => go(item.paperDate!)} accessibilityRole="button">
            <Text style={styles.evDate}>{item.date.replace(/-/g, '.')}</Text>
            <Text style={styles.evTitle}>{item.title}</Text>
            <Text style={styles.evGo}>{item.paperDate!.replace(/-/g, '.')} 신문 보기 →</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 20, paddingBottom: 48 },
  lead: { fontSize: 15, lineHeight: 23, color: colors.textMuted },
  picker: { marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: { flex: 1, height: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.line, textAlign: 'center', fontSize: 20, fontWeight: '700', color: colors.text, letterSpacing: 1 },
  preview: { marginTop: 10, textAlign: 'center', fontSize: 14, color: colors.textMuted },
  btnRow: { marginTop: 16, flexDirection: 'row', gap: 10 },
  go: { flex: 1, height: 50, borderRadius: 10, backgroundColor: accent.main, alignItems: 'center', justifyContent: 'center' },
  goText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  today: { width: 72, height: 50, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  todayText: { fontSize: 15, fontWeight: '700', color: colors.text },
  sec: { marginTop: 32, fontSize: 17, fontWeight: '800', color: colors.text },
  decades: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 6 },
  dec: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
  decOn: { backgroundColor: accent.main, borderColor: accent.main },
  decText: { fontSize: 13.5, fontWeight: '600', color: colors.textSub },
  decTextOn: { color: '#fff', fontWeight: '700' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 30 },
  event: { paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  evDate: { fontSize: 12.5, fontWeight: '700', color: '#2563eb' },
  evTitle: { marginTop: 4, fontSize: 16, lineHeight: 23, fontWeight: '700', color: colors.text },
  evGo: { marginTop: 6, fontSize: 12.5, color: colors.textFaint },
});
