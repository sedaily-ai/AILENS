import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { LetterEditor } from '@ailens/domain';
import { Text } from '../../../ui/Text';
import { Bus, Check, Coffee, ForkKnife, Moon, X } from '../../../ui/icons';
import { accent, colors } from '../../../theme';
import { MINUTES, PICK_COUNT, saveBriefingPrefs, type BriefingPrefs, type Minutes, type Situation } from '../briefingPrefs';
import { formatCards, momentOf, openingLine, voiceOf } from '../editorVoice';

/**
 * 오늘 설정 — 두 가지만 묻는다. "지금 어떤 때예요?"(상황)와 "얼마나 볼까요?"(시간).
 *  · 상황은 인사 말투와 "지금은 이렇게 볼까요?"의 첫 형식을 바꾼다. 고르지 않으면 시각에 맞춰 자동으로 정한다.
 *  · 시간은 홈에 보여 줄 질문 개수(3분 2개 · 5분 3개 · 10분 5개)를 바꾼다.
 * 고르는 즉시 적용되고(저장 버튼 없음), 아래 미리 보기에서 바뀐 결과를 바로 확인할 수 있다.
 */
const SITUATIONS: { key: Situation | null; label: string; hint: string; Icon: typeof Bus | null }[] = [
  { key: null, label: '지금 시각에 맞춰요', hint: '자동', Icon: null },
  { key: 'commute', label: '출근길', hint: '귀로 듣기', Icon: Bus },
  { key: 'lunch', label: '점심시간', hint: '웹툰으로 가볍게', Icon: ForkKnife },
  { key: 'evening', label: '퇴근 후', hint: '차분히 읽기', Icon: Coffee },
  { key: 'night', label: '잠들기 전', hint: '소리로 정리', Icon: Moon },
];
const TIME_HINT: Record<Minutes, string> = { 3: '가볍게 훑어요', 5: '핵심만 챙겨요', 10: '깊이 있게 봐요' };

export function BriefingSettings({ prefs, editor, open, onClose }: { prefs: BriefingPrefs; editor: LetterEditor; open: boolean; onClose: () => void }) {
  const moment = momentOf(new Date(), prefs.situation);
  const first = formatCards(moment)[0];

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
      <View style={styles.sheet}>
        <View style={styles.grab} />
        <View style={styles.head}>
          <Text style={styles.title}>오늘은 어떻게 볼까요?</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="닫기">
            <X size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
          <Text style={styles.label}>지금 어떤 때예요?</Text>
          <View style={styles.list}>
            {SITUATIONS.map((s, i) => {
              const on = prefs.situation === s.key;
              return (
                <Pressable
                  key={s.key ?? 'auto'}
                  onPress={() => void saveBriefingPrefs({ ...prefs, situation: s.key })}
                  style={({ pressed }) => [styles.row, i > 0 && styles.rule, pressed && { backgroundColor: '#f7f9fc' }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <View style={[styles.iconBox, on && styles.iconBoxOn]}>
                    {s.Icon ? <s.Icon size={20} color={on ? '#fff' : colors.textSub} weight={on ? 'fill' : 'regular'} /> : <Text style={[styles.auto, on && { color: '#fff' }]}>A</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{s.label}</Text>
                    <Text style={styles.rowHint}>{s.hint}</Text>
                  </View>
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <Check size={13} color="#fff" weight="bold" /> : null}</View>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>얼마나 볼까요?</Text>
          <View style={styles.seg}>
            {MINUTES.map((m: Minutes) => {
              const on = prefs.minutes === m;
              return (
                <Pressable key={m} style={[styles.segItem, on && styles.segOn]} onPress={() => void saveBriefingPrefs({ ...prefs, minutes: m })} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <Text style={[styles.segText, on && styles.segTextOn]}>{m}분</Text>
                  <Text style={[styles.segSub, on && { color: accent.ink }]}>질문 {PICK_COUNT[m]}개</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.timeHint}>{TIME_HINT[prefs.minutes]}</Text>

          <View style={styles.preview}>
            <Text style={styles.previewLabel}>이렇게 바뀌어요</Text>
            <Text style={styles.previewLine}>“{openingLine(voiceOf(editor.group), moment)}”</Text>
            <Text style={styles.previewSub}>첫 형식은 <Text style={styles.previewStrong}>{first.label}</Text> · 질문 {PICK_COUNT[prefs.minutes]}개</Text>
          </View>
        </ScrollView>

        <Pressable style={({ pressed }) => [styles.done, pressed && { opacity: 0.9 }]} onPress={onClose} accessibilityRole="button">
          <Text style={styles.doneText}>완료</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)' },
  sheet: { maxHeight: '90%', backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 22 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#dfe3ea', marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6, color: colors.text },
  label: { marginTop: 22, marginBottom: 10, fontSize: 14, fontWeight: '800', color: colors.textSub },
  list: { borderRadius: 20, borderWidth: 1, borderColor: '#e6eaf1', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff' },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e6eaf1' },
  iconBox: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#f1f3f6', alignItems: 'center', justifyContent: 'center' },
  iconBoxOn: { backgroundColor: accent.main },
  auto: { fontSize: 15, fontWeight: '800', color: colors.textSub },
  rowTitle: { fontSize: 15.5, fontWeight: '800', color: colors.text },
  rowHint: { marginTop: 2, fontSize: 12.5, color: colors.textMuted },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#d3d9e3', alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: accent.main, borderColor: accent.main },
  seg: { flexDirection: 'row', gap: 8 },
  segItem: { flex: 1, paddingVertical: 12, borderRadius: 16, borderWidth: 1.5, borderColor: '#e6eaf1', alignItems: 'center', backgroundColor: '#fff' },
  segOn: { borderColor: accent.main, backgroundColor: accent.soft },
  segText: { fontSize: 17, fontWeight: '800', color: colors.textSub },
  segTextOn: { color: accent.ink },
  segSub: { marginTop: 2, fontSize: 12.5, fontWeight: '600', color: colors.textMuted },
  timeHint: { marginTop: 8, fontSize: 13, color: colors.textMuted },
  preview: { marginTop: 22, padding: 16, borderRadius: 18, backgroundColor: '#f6f8fb' },
  previewLabel: { fontSize: 12.5, fontWeight: '800', color: accent.ink },
  previewLine: { marginTop: 6, fontSize: 15, lineHeight: 22, fontWeight: '600', color: colors.text },
  previewSub: { marginTop: 8, fontSize: 13, color: colors.textMuted },
  previewStrong: { fontWeight: '800', color: colors.text },
  done: { marginTop: 14, height: 54, borderRadius: 16, backgroundColor: accent.main, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
