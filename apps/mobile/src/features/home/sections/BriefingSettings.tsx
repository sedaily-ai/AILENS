import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ECON_CATEGORIES } from '@ailens/domain';
import { Text } from '../../../ui/Text';
import { Bus, Coffee, ForkKnife, Moon, SlidersHorizontal, X } from '../../../ui/icons';
import { colors } from '../../../theme';
import { MINUTES, saveBriefingPrefs, type BriefingPrefs, type Minutes, type Situation } from '../briefingPrefs';
import { setInterests } from '../../mylens/stores';

/**
 * 오늘의 브리핑 설정 — 한 줄 요약 칩("5분 · 출근길 · 증권·산업")과 그 칩을 누르면 열리는 아래 시트.
 * 시간, 지금 상황, 관심 분야를 고르면 "오늘 챙길 N가지"의 개수와 추천 순서가 바로 바뀐다. 모두 이 기기에 저장된다.
 */
const SITUATIONS: { key: Situation; label: string; hint: string; Icon: typeof Bus }[] = [
  { key: 'commute', label: '출근길', hint: '귀로 듣기', Icon: Bus },
  { key: 'lunch', label: '점심시간', hint: '웹툰으로 가볍게', Icon: ForkKnife },
  { key: 'evening', label: '퇴근 후', hint: '차분히 읽기', Icon: Moon },
  { key: 'weekend', label: '주말', hint: '깊이 있는 레터', Icon: Coffee },
];

export function BriefingSettings({ prefs, interests, onInterests }: { prefs: BriefingPrefs; interests: string[]; onInterests: (slugs: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const situation = SITUATIONS.find((s) => s.key === prefs.situation);
  const labels = ECON_CATEGORIES.filter((c) => interests.includes(c.slug)).map((c) => c.label);
  const summary = [`${prefs.minutes}분`, situation?.label, labels.length ? labels.slice(0, 2).join('·') + (labels.length > 2 ? ` 외 ${labels.length - 2}` : '') : null].filter(Boolean);

  const toggleInterest = (slug: string) => {
    const next = interests.includes(slug) ? interests.filter((x) => x !== slug) : [...interests, slug];
    onInterests(next);
    void setInterests(next);
  };

  return (
    <>
      <Pressable style={({ pressed }) => [styles.summary, pressed && { opacity: 0.85 }]} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="오늘 브리핑 설정 열기">
        <SlidersHorizontal size={18} color={colors.textSub} />
        <Text style={styles.summaryLabel}>오늘 설정</Text>
        <View style={styles.chips}>
          {summary.map((s) => (
            <View key={s} style={styles.chip}><Text style={styles.chipText}>{s}</Text></View>
          ))}
        </View>
        <Text style={styles.edit}>바꾸기</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="닫기" />
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>오늘 브리핑 설정</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
              <X size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={styles.label}>시간</Text>
            <View style={styles.seg}>
              {MINUTES.map((m: Minutes) => (
                <Pressable key={m} style={[styles.segItem, prefs.minutes === m && styles.segOn]} onPress={() => void saveBriefingPrefs({ ...prefs, minutes: m })} accessibilityRole="button" accessibilityState={{ selected: prefs.minutes === m }}>
                  <Text style={[styles.segText, prefs.minutes === m && styles.segTextOn]}>{m}분</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>지금은 어떤 때예요?</Text>
            <View style={styles.grid}>
              {SITUATIONS.map(({ key, label, hint, Icon }) => {
                const on = prefs.situation === key;
                return (
                  <Pressable key={key} style={[styles.tile, on && styles.tileOn]} onPress={() => void saveBriefingPrefs({ ...prefs, situation: on ? null : key })} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <View style={[styles.tileIcon, on && styles.tileIconOn]}>
                      <Icon size={22} color={on ? '#fff' : colors.textSub} weight={on ? 'fill' : 'regular'} />
                    </View>
                    <Text style={styles.tileLabel}>{label}</Text>
                    <Text style={styles.tileHint}>{hint}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.label}>관심 분야 <Text style={styles.optional}>여러 개 골라도 돼요</Text></Text>
            <View style={styles.pills}>
              {ECON_CATEGORIES.map((c) => {
                const on = interests.includes(c.slug);
                return (
                  <Pressable key={c.slug} style={[styles.pill, on && styles.pillOn]} onPress={() => toggleInterest(c.slug)} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <Text style={[styles.pillText, on && styles.pillTextOn]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <Pressable style={({ pressed }) => [styles.done, pressed && { opacity: 0.88 }]} onPress={() => setOpen(false)} accessibilityRole="button">
            <Text style={styles.doneText}>이대로 시작</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  summary: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 48, borderRadius: 16, backgroundColor: '#f4f6fa' },
  summaryLabel: { fontSize: 13, fontWeight: '800', color: colors.textSub },
  chips: { flex: 1, flexDirection: 'row', gap: 6, overflow: 'hidden' },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: '#fff' },
  chipText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  edit: { fontSize: 13, fontWeight: '700', color: '#2563eb' },

  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)' },
  sheet: { maxHeight: '86%', backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sheetTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  label: { marginTop: 20, marginBottom: 10, fontSize: 14, fontWeight: '800', color: colors.text },
  optional: { fontSize: 12.5, fontWeight: '500', color: colors.textFaint },

  seg: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 16, backgroundColor: 'rgba(17,24,39,0.055)' },
  segItem: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  segOn: { backgroundColor: '#fff', elevation: 2, shadowColor: '#111827' },
  segText: { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  segTextOn: { fontWeight: '800', color: colors.text },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1, padding: 14, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e6e9f0' },
  tileOn: { borderColor: colors.brand, backgroundColor: '#f4f6fb' },
  tileIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#f1f3f6', alignItems: 'center', justifyContent: 'center' },
  tileIconOn: { backgroundColor: colors.brand },
  tileLabel: { marginTop: 10, fontSize: 15, fontWeight: '800', color: colors.text },
  tileHint: { marginTop: 2, fontSize: 12.5, color: colors.textMuted },

  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#f1f3f6' },
  pillOn: { backgroundColor: colors.brand },
  pillText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  pillTextOn: { color: '#fff', fontWeight: '700' },

  done: { marginTop: 16, height: 54, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
