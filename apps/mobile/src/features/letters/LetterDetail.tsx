import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Text } from '../../ui/Text';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { castIssueVote, fetchIssueVote, getIssueLetter, type IssueLetterDetail, type LetterVoteState } from '@ailens/api-client';
import { applyChoice } from '@ailens/domain';
import { AsyncView } from '../../components/AsyncView';
import { kstDateTime } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { colors } from '../../theme';
import { FONT_SCALES, useFontScale } from '../article/FontScale';
import { getVoterId } from '../article/voterId';
import { AXIS_META, orderedAxes } from './axis';
import { Paragraph } from './Blocks';
import { PollOptions } from '../article/PollOptions';

const SITE = 'https://ailens.sedaily.ai';

/** 이슈 레터 상세 — 1분 요약, 3축 섹션(소식·실체·다른 시각), 에디터 노트, 출처, 독자 투표(웹 /letter/[slug] 대응). */
export function LetterDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { state, reload } = useAsync((signal) => getIssueLetter(slug, signal), [slug]);
  const { scale, idx, cycle } = useFontScale();
  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerRight: () => (
            <View style={styles.tools}>
              <Pressable onPress={cycle} hitSlop={10} accessibilityRole="button" accessibilityLabel={`글자 크기 ${Math.round(FONT_SCALES[idx] * 100)}%`}>
                <Text style={styles.aa}>가<Text style={styles.aaBig}>가</Text></Text>
              </Pressable>
              {state.status === 'ready' ? (
                <Pressable onPress={() => void Share.share({ title: state.data.title, message: `${state.data.title}\n${SITE}/letter/${encodeURIComponent(state.data.slug)}` })} hitSlop={10} accessibilityRole="button" accessibilityLabel="공유">
                  <Ionicons name="share-outline" size={24} color={colors.text} />
                </Pressable>
              ) : null}
            </View>
          ),
        }}
      />
      <AsyncView state={state} onRetry={reload}>
        {(l) => (
          <ScrollView contentContainerStyle={styles.body}>
            <Body letter={l} scale={scale} />
          </ScrollView>
        )}
      </AsyncView>
    </View>
  );
}

function Body({ letter: l, scale }: { letter: IssueLetterDetail; scale: number }) {
  const [sumOpen, setSumOpen] = useState(true);
  const axes = orderedAxes(l.sections.map((s) => s.axis));
  return (
    <View>
      <Text style={styles.meta}>No.{l.issue_no}  ·  {[l.category_names?.[0], `${l.read_minutes}분`, kstDateTime(l.published_at)].filter(Boolean).join('  ·  ')}</Text>
      <Text style={styles.title}>{l.title}</Text>
      <Text style={[styles.deck, { fontSize: 16 * scale, lineHeight: 25 * scale }]}>{l.deck}</Text>
      <View style={styles.axes}>
        {axes.map((a) => (
          <View key={a} style={[styles.axis, { backgroundColor: AXIS_META[a].soft }]}>
            <Text style={[styles.axisText, { color: AXIS_META[a].tone }]}>{AXIS_META[a].label}</Text>
          </View>
        ))}
      </View>

      {l.summary.length > 0 ? (
        <View style={styles.summary}>
          <Pressable onPress={() => setSumOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: sumOpen }}>
            <Text style={styles.sumHead}>{sumOpen ? '▾' : '▸'} 1분 요약</Text>
          </Pressable>
          {sumOpen ? l.summary.map((s, i) => <Text key={i} style={[styles.sumItem, { fontSize: 15 * scale, lineHeight: 23 * scale }]}>• {s}</Text>) : null}
        </View>
      ) : null}

      {l.sections.map((s, i) => (
        <View key={i} style={styles.section}>
          <View style={[styles.axis, { backgroundColor: AXIS_META[s.axis].soft, alignSelf: 'flex-start' }]}>
            <Text style={[styles.axisText, { color: AXIS_META[s.axis].tone }]}>{s.axis_label || AXIS_META[s.axis].label}</Text>
          </View>
          <Text style={[styles.h2, { fontSize: 21 * scale, lineHeight: 29 * scale }]}>{s.heading}</Text>
          {s.key_line ? <Text style={[styles.key, { fontSize: 15 * scale, lineHeight: 23 * scale, borderLeftColor: AXIS_META[s.axis].tone }]}>핵심: {s.key_line}</Text> : null}
          {s.paragraphs.map((p, pi) => <Paragraph key={pi} para={p} scale={scale} />)}
        </View>
      ))}

      {l.editor_note ? (
        <View style={styles.note}>
          <Text style={styles.noteHead}>에디터 노트</Text>
          <Text style={[styles.noteBody, { fontSize: 15 * scale, lineHeight: 23 * scale }]}>{l.editor_note}</Text>
        </View>
      ) : null}

      {l.poll ? <Poll slug={l.slug} poll={l.poll} /> : null}

      {l.sources.length > 0 ? (
        <View style={styles.sources}>
          <Text style={styles.noteHead}>출처 {l.sources.length}건</Text>
          {l.sources.map((s, i) => (
            <Pressable key={i} style={styles.src} onPress={() => void Linking.openURL(s.url)} accessibilityRole="link">
              <Text style={styles.srcTitle} numberOfLines={2}>{s.title}</Text>
              <Text style={styles.srcOutlet}>{s.external ? s.outlet : '서울경제'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={styles.disclaimer}>AI가 기사들을 바탕으로 정리한 레터예요. 중요한 판단 전에는 출처의 원문을 확인해 주세요.</Text>
    </View>
  );
}

function Poll({ slug, poll }: { slug: string; poll: NonNullable<IssueLetterDetail['poll']> }) {
  const [vote, setVote] = useState<LetterVoteState>({ my_choice: null, counts: null });
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void getVoterId().then(async (id) => {
      if (!id) return;
      const s = await fetchIssueVote(slug, id);
      if (alive && s) setVote(s);
    });
    return () => {
      alive = false;
    };
  }, [slug]);
  const pick = async (key: string) => {
    if (vote.my_choice === key || pending) return;
    const id = await getVoterId();
    if (!id) return setFailed(true);
    const prev = vote;
    setFailed(false);
    setPending(key);
    setVote(applyChoice(vote, key));
    const next = await castIssueVote(slug, id, key);
    setPending(null);
    if (!next) {
      setVote(prev);
      return setFailed(true);
    }
    setVote(next);
  };
  const total = vote.counts ? Object.values(vote.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <View style={styles.poll}>
      <Text style={styles.noteHead}>독자 의견</Text>
      <Text style={styles.pollQ}>{poll.question}</Text>
      <PollOptions
        options={poll.options.map((o) => ({ key: o.key, label: o.label, hint: o.hint, tone: o.key === 'unsure' ? 'n' : /skeptic|worr|concern|doubt/.test(o.key) ? 'w' : 'b' }))}
        myChoice={vote.my_choice}
        counts={vote.counts}
        pending={pending}
        onPick={(k) => void pick(k)}
        note={failed ? '지금은 투표를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요' : vote.my_choice ? `${total}명이 참여했어요 · 다른 보기를 눌러 바꿀 수 있어요` : '하나를 고르면 다른 독자들의 선택을 볼 수 있어요'}
        noteError={failed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  aa: { fontSize: 14, fontWeight: '700', color: colors.text },
  aaBig: { fontSize: 19 },
  body: { padding: 20, paddingBottom: 56 },
  meta: { fontSize: 12.5, fontWeight: '700', color: '#2563eb' },
  title: { marginTop: 8, fontSize: 25, lineHeight: 35, fontWeight: '800', letterSpacing: -0.5, color: colors.text },
  deck: { marginTop: 10, color: '#4b5563' },
  axes: { flexDirection: 'row', gap: 6, marginTop: 14 },
  axis: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
  axisText: { fontSize: 12, fontWeight: '800' },
  summary: { marginTop: 20, padding: 16, borderRadius: 14, backgroundColor: '#f0f6ff', borderWidth: 1, borderColor: '#dbeafe' },
  sumHead: { fontSize: 14, fontWeight: '800', color: colors.text },
  sumItem: { marginTop: 8, color: '#1f2937' },
  section: { marginTop: 36 },
  h2: { marginTop: 10, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  key: { marginTop: 10, paddingLeft: 12, borderLeftWidth: 3, color: '#374151', fontWeight: '600' },
  note: { marginTop: 36, padding: 16, borderRadius: 14, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  noteHead: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, color: colors.text },
  noteBody: { marginTop: 8, color: '#374151' },
  poll: { marginTop: 36 },
  pollQ: { marginTop: 8, fontSize: 17, lineHeight: 25, fontWeight: '700', color: colors.text },
  opt: { marginTop: 8, minHeight: 50, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  optOn: { borderColor: colors.brand },
  optBar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#eef2ff' },
  optText: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.text },
  pct: { marginLeft: 10, fontSize: 13, fontWeight: '700', color: colors.textMuted },
  hint: { marginTop: 10, fontSize: 12.5, color: colors.textFaint },
  sources: { marginTop: 36 },
  src: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, marginTop: 4 },
  srcTitle: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: '#2563eb' },
  srcOutlet: { marginTop: 3, fontSize: 12, color: colors.textFaint },
  disclaimer: { marginTop: 28, fontSize: 12.5, lineHeight: 19, color: colors.textFaint },
});
