'use client';

import { useEffect, useState } from 'react';
import { PollOptions } from '@/shared/ui/form/PollOptions';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import type { LetterVote as Vote } from '../data/letterTypes';
import { fetchMyVote, postVote, type VoteState } from '../data/letterApi';
import { getDeviceId } from '../lib/deviceId';

export function LetterVote({ slug, vote }: { slug: string; vote: Vote }) {
  // 서버 HTML과 첫 클라이언트 렌더를 같게 두려고 비어 있는 상태로 시작하고, 마운트 뒤에 서버에서 내 투표 여부를 읽는다.
  const [state, setState] = useState<VoteState>({ my_choice: null, counts: null });
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const id = getDeviceId();
    if (!id) return;
    let alive = true;
    fetchMyVote(slug, id).then((s) => {
      if (alive && s) setState(s);
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  async function pick(key: string) {
    if (state.my_choice || pending) return;
    const id = getDeviceId();
    if (!id) return setFailed(true);
    setFailed(false);
    setPending(key);
    const next = await postVote(slug, id, key);
    setPending(null);
    if (!next) return setFailed(true);
    setState(next);
    trackEvent('letter_vote', { letter: slug, option: next.my_choice ?? key });
  }

  // 보기 색 구분: 우려·걱정류는 앰버, "잘 모르겠어요"는 회색, 나머지는 파랑. 데이터 필드 없이 key 로만 정한다.
  const toneOf = (key: string): 'b' | 'w' | 'n' => (key === 'unsure' ? 'n' : /worr|concern|anx|uneasy|afraid/.test(key) ? 'w' : 'b');
  const total = state.counts ? Object.values(state.counts).reduce((a, b) => a + b, 0) : 0;
  const note = failed ? '지금은 투표를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요' : state.my_choice ? `${total}명이 참여했어요` : '하나를 고르면 다른 독자들의 선택을 볼 수 있어요';

  return (
    <section className="ld-vote" aria-label="투표">
      <h2>{vote.question}</h2>
      <PollOptions
        options={vote.options.map((o) => ({ key: o.key, label: o.label, hint: o.hint, tone: toneOf(o.key) }))}
        myChoice={state.my_choice}
        counts={state.counts}
        pending={pending}
        onPick={pick}
        note={note}
      />
    </section>
  );
}
