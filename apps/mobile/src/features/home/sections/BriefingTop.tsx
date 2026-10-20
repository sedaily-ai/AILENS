import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text } from '../../../ui/Text';
import { ArrowRight, Check, Fire } from '../../../ui/icons';
import { colors } from '../../../theme';
import { greeting, type BriefingPick } from '../briefing';
import type { DailyProgress, StepKey } from '../dailyProgress';
import { SITUATION_ROUTE, type BriefingPrefs } from '../briefingPrefs';
import { BriefingSettings } from './BriefingSettings';

/**
 * 홈 맨 위 — 오늘의 브리핑.
 *  인사(시간대별) → 오늘 진행 카드(세 단계 + 진행 막대 + 다음 할 일 버튼) → 이번 주 7일.
 * 단계 정의와 기록은 dailyProgress.ts, 오늘 챙길 글은 briefing.ts. 한 화자의 말투로 통일해 두었다(나중에 캐릭터가 이 자리를 맡는다).
 */
const STEPS: { key: StepKey; label: string; hint: string; cta: string }[] = [
  { key: 'read', label: '핵심 읽기', hint: '오늘 가장 중요한 글 하나', cta: '오늘 브리핑, 시작해 볼까요?' },
  { key: 'format', label: '내 방식으로', hint: '웹툰·듣기·영상 중에 골라서', cta: '이번엔 내 방식으로 볼까요?' },
  { key: 'save', label: '남기기', hint: '마음에 든 문장 담기 · 투표', cta: '마음에 든 문장을 남겨 볼까요?' },
];

// 온보딩에서 고른 방식(레터 0·웹툰 1·팟캐스트 2·영상 3)이 가리키는 화면. 아직 안 골랐으면 고르는 화면으로 보낸다.
const FORMAT_ROUTE: Href[] = ['/letter', '/webtoon', '/listen', '/video'];

export function BriefingTop({ progress, picks, preferredFormat, prefs, interests, onInterests }: { progress: DailyProgress; picks: BriefingPick[]; preferredFormat: number | null; prefs: BriefingPrefs; interests: string[]; onInterests: (slugs: string[]) => void }) {
  const router = useRouter();
  const all = progress.doneCount === STEPS.length;
  const next = STEPS.find((s) => !progress.today[s.key]);

  const open = (key: StepKey) => {
    const first = picks[0];
    // 지금 상황(출근길 등)을 골랐다면 그 상황에 어울리는 형식으로, 아니면 온보딩에서 고른 방식으로 보낸다.
    if (key === 'format') return router.push(prefs.situation ? SITUATION_ROUTE[prefs.situation] : preferredFormat === null ? '/start' : FORMAT_ROUTE[preferredFormat]);
    if (first) return router.push({ pathname: '/article/[slug]', params: { slug: first.id } });
    return router.push('/discover');
  };

  const cta = all ? '오늘 챙길 건 다 챙겼어요' : (next?.cta ?? '오늘 브리핑, 시작해 볼까요?');

  return (
    <View>
      <View style={styles.greetRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>{greeting()}</Text>
          <Text style={styles.sub}>{all ? '내일 아침에 또 만나요' : `오늘 챙길 ${Math.max(picks.length, 1)}가지, ${prefs.minutes}분이면 돼요`}</Text>
        </View>
        {progress.streak > 0 ? (
          <View style={styles.streak}>
            <Fire size={16} color="#ea580c" weight="fill" />
            <Text style={styles.streakText}>{progress.streak}일 연속</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.stepsRow}>
          {STEPS.map((s, i) => {
            const done = !!progress.today[s.key];
            const current = !done && next?.key === s.key;
            return (
              <Pressable key={s.key} style={styles.step} onPress={() => open(s.key)} accessibilityRole="button" accessibilityLabel={`${s.label}, ${done ? '완료' : s.hint}`}>
                <View style={[styles.circle, done && styles.circleDone, current && styles.circleCurrent]}>
                  {done ? <Check size={16} color="#fff" weight="bold" /> : <Text style={[styles.circleNum, current && { color: colors.brand }]}>{i + 1}</Text>}
                </View>
                <Text style={[styles.stepLabel, done && styles.stepLabelDone]} numberOfLines={1}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${(progress.doneCount / STEPS.length) * 100}%` }]} />
        </View>
        <Pressable
          style={({ pressed }) => [styles.cta, all && styles.ctaDone, pressed && !all && styles.pressed]}
          onPress={() => (all ? undefined : next && open(next.key))}
          disabled={all}
          accessibilityRole="button"
        >
          <Text style={[styles.ctaText, all && styles.ctaTextDone]}>{cta}</Text>
          {all ? <Check size={18} color={colors.textMuted} weight="bold" /> : <ArrowRight size={18} color="#fff" weight="bold" />}
        </Pressable>
        {progress.doneCount < STEPS.length && next ? <Text style={styles.hint}>{next.hint}</Text> : null}

        <View style={styles.sep} />
        <View style={styles.weekIn}>
          {progress.week.map((d) => (
            <View key={d.key} style={styles.day}>
              <Text style={[styles.dayLabel, d.isToday && styles.dayLabelToday]}>{d.label}</Text>
              <View style={[styles.dot, d.complete && styles.dotComplete, !d.complete && d.active && styles.dotActive, d.isToday && !d.complete && styles.dotToday, d.isFuture && styles.dotFuture]}>
                {d.complete ? <Check size={13} color="#fff" weight="bold" /> : d.active ? <View style={styles.dotInner} /> : null}
              </View>
            </View>
          ))}
        </View>
      </View>

      <BriefingSettings prefs={prefs} interests={interests} onInterests={onInterests} />

    </View>
  );
}

const styles = StyleSheet.create({
  greetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  hello: { fontSize: 24, lineHeight: 32, fontWeight: '800', letterSpacing: -0.7, color: colors.text },
  sub: { marginTop: 4, fontSize: 15, lineHeight: 22, color: colors.textMuted },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 30, borderRadius: 999, backgroundColor: '#fff3e8', marginTop: 2 },
  streakText: { fontSize: 12.5, fontWeight: '800', color: '#c2410c' },

  card: { marginTop: 18, padding: 18, borderRadius: 22, backgroundColor: '#f4f6fa' },
  stepsRow: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: 8 },
  circle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#d9dee8' },
  circleCurrent: { borderColor: colors.brand },
  circleDone: { backgroundColor: colors.brand, borderColor: colors.brand },
  circleNum: { fontSize: 14, fontWeight: '800', color: '#9aa3b2' },
  stepLabel: { fontSize: 12.5, fontWeight: '700', color: colors.textSub },
  stepLabelDone: { color: colors.textFaint },
  bar: { marginTop: 16, height: 6, borderRadius: 3, backgroundColor: '#dfe4ee', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: colors.brand },
  cta: { marginTop: 16, height: 52, borderRadius: 16, backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaDone: { backgroundColor: '#e8ebf2' },
  ctaText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  ctaTextDone: { color: colors.textMuted },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  hint: { marginTop: 10, textAlign: 'center', fontSize: 12.5, color: colors.textFaint },

  sep: { marginTop: 16, height: StyleSheet.hairlineWidth, backgroundColor: '#dfe4ee' },
  weekIn: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  day: { alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 12, fontWeight: '600', color: colors.textFaint },
  dayLabelToday: { color: colors.text, fontWeight: '800' },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef1f6' },
  dotComplete: { backgroundColor: colors.brand },
  dotActive: { backgroundColor: '#dbe3f5' },
  dotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  dotToday: { borderWidth: 1.5, borderColor: colors.brand, backgroundColor: '#fff' },
  dotFuture: { opacity: 0.45 },
});
