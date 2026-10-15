import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { applyChoice } from '@ailens/domain';
import { castPostVote, fetchPostVote, type PostVoteState } from '@ailens/api-client';
import { Text } from '../../ui/Text';
import { PollOptions } from './PollOptions';
import { getVoterId } from './voterId';

/** 본문 속 투표 칸 — 웹 PostVote 와 같은 카드(흰 면 + 얇은 테두리) 안에 애니메이션 투표 보기를 둔다. 선택은 낙관적으로 반영하고 실패하면 되돌린다. */
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
      <PollOptions
        options={choices.map((label, i) => ({ key: `o${i + 1}`, label }))}
        myChoice={state.my_choice}
        counts={state.counts}
        pending={pending}
        onPick={(k) => void pick(k)}
        note={note}
        noteError={failed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // 웹 .lread-box-vote: 흰 면 + 안쪽 1px #e5e7eb 테두리, radius 14, padding 16/18(v2).
  box: { marginTop: 26, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  title: { marginBottom: 12, fontSize: 13, fontWeight: '700', color: '#374151' },
});
