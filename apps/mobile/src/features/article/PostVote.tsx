import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { applyChoice } from '@ailens/domain';
import { castPostVote, fetchPostVote, type PostVoteState } from '@ailens/api-client';
import { colors } from '../../theme';
import { getVoterId } from './voterId';

/** 본문 속 투표 칸 — 하나를 고르면 다른 독자들의 선택 비율을 보여 준다(웹 PostVote 대응). 선택은 낙관적으로 반영하고 실패하면 되돌린다. */
export function PostVote({ slug, title, choices }: { slug: string; title: string; choices: string[] }) {
  const [state, setState] = useState<PostVoteState>({ my_choice: null, counts: null });
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void getVoterId().then(async (id) => {
      if (!id) return;
      const s = await fetchPostVote(slug, id);
      if (alive && s) setState(s);
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  async function pick(key: string) {
    if (state.my_choice === key || pending) return;
    const id = await getVoterId();
    if (!id) return setFailed(true);
    const prev = state;
    setFailed(false);
    setPending(key);
    setState(applyChoice(state, key));
    const next = await castPostVote(slug, id, key);
    setPending(null);
    if (!next) {
      setState(prev);
      return setFailed(true);
    }
    setState(next);
  }

  const total = state.counts ? Object.values(state.counts).reduce((a, b) => a + b, 0) : 0;
  const note = failed
    ? '지금은 투표를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요'
    : state.my_choice
      ? `${total}명이 참여했어요 · 다른 보기를 눌러 바꿀 수 있어요`
      : '하나를 고르면 다른 독자들의 선택을 볼 수 있어요';

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{title}</Text>
      {choices.map((label, i) => {
        const key = `o${i + 1}`;
        const count = state.counts?.[key] ?? 0;
        const pct = state.counts && total > 0 ? Math.round((count / total) * 100) : 0;
        const mine = state.my_choice === key;
        return (
          <Pressable key={key} onPress={() => void pick(key)} style={[styles.opt, mine && styles.optOn]} accessibilityRole="button" accessibilityState={{ selected: mine }}>
            {state.counts ? <View style={[styles.bar, { width: `${pct}%` }, mine && styles.barOn]} /> : null}
            <Text style={[styles.optText, mine && styles.optTextOn]}>{label}</Text>
            {state.counts ? <Text style={styles.pct}>{pct}%</Text> : null}
          </Pressable>
        );
      })}
      <Text style={[styles.note, failed && { color: '#dc2626' }]}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 20, padding: 16, borderRadius: 14, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  title: { fontSize: 16, lineHeight: 24, fontWeight: '800', color: colors.text, marginBottom: 10 },
  opt: { marginTop: 8, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  optOn: { borderColor: colors.brand },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#eef2ff' },
  barOn: { backgroundColor: '#dbe4ff' },
  optText: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.text },
  optTextOn: { fontWeight: '800' },
  pct: { marginLeft: 10, fontSize: 13, fontWeight: '700', color: colors.textMuted },
  note: { marginTop: 10, fontSize: 12.5, color: colors.textFaint },
});
