'use client';

import { useEffect, useState } from 'react';
import { castPostVote, fetchPostVote, type PostVoteState } from '@/shared/lib/api/postVoteApi';
import { getVoterId } from '@/shared/lib/device/voterId';
import { applyChoice } from '@/shared/lib/poll/optimisticVote';
import { PollOptions } from '@/shared/ui/form/PollOptions';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';

/** 본문 투표 칸의 보기 문구를 뽑는다: "① 문구 ② 문구" 한 문단 또는 줄 단위. 끝에 붙은 출처 줄("-- 자료: …")과 번호 기호를 뗀다. */
export function parseVoteChoices(texts: string[]): string[] {
  return texts
    .flatMap((t) => t.split(/\n|\s+(?=[①-⑨])/))
    .map((t) => t.replace(/\s*[-–—]{1,3}\s*자료\s*[:：][\s\S]*$/, '').replace(/^[①-⑨]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 9);
}

export function PostVote({ slug, title, choices }: { slug: string; title: string; choices: string[] }) {
  // 서버 HTML과 첫 클라이언트 렌더를 같게 두려고 투표 전 상태로 시작하고, 마운트 뒤에 내 투표 여부를 읽는다.
  const [state, setState] = useState<PostVoteState>({ my_choice: null, counts: null });
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const id = getVoterId();
    if (!id) return;
    let alive = true;
    fetchPostVote(slug, id).then((s) => {
      if (alive && s) setState(s);
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  async function pick(key: string) {
    if (state.my_choice === key || pending) return;
    const id = getVoterId();
    if (!id) return setFailed(true);
    setFailed(false);
    const prev = state;
    if (prev.my_choice) setState(applyChoice(prev, key)); // 이미 투표했으면 화면을 먼저 옮기고
    else setPending(key); // 첫 투표는 고른 즉시 체크를 보여 주고, 집계가 오면 막대가 차오른다
    const next = await castPostVote(slug, id, key);
    setPending(null);
    if (!next) {
      setState(prev);
      return setFailed(true);
    }
    setState(next);
    trackEvent('post_vote', { post: slug, option: next.my_choice ?? key });
  }

  const total = state.counts ? Object.values(state.counts).reduce((a, b) => a + b, 0) : 0;
  const note = failed ? '지금은 투표를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요' : state.my_choice ? `${total}명이 참여했어요 · 다른 보기를 눌러 바꿀 수 있어요` : '하나를 고르면 다른 독자들의 선택을 볼 수 있어요';
  return (
    <div className="lread-box lread-box-vote">
      <div className="lread-box-title">{title}</div>
      <PollOptions
        options={choices.map((label, i) => ({ key: `o${i + 1}`, label }))}
        myChoice={state.my_choice}
        counts={state.counts}
        pending={pending}
        onPick={pick}
        note={note}
      />
    </div>
  );
}
