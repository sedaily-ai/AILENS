'use client';

import { useEffect, useState } from 'react';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import type { LetterVote as Vote } from '../data/letterTypes';
import { fetchMyVote, postVote, type VoteState } from '../data/letterApi';

const VOTER_KEY = 'lens-voter-id';

/** 이 기기의 익명 투표자 식별자. 서버는 이 값을 솔트와 섞어 해시한 것만 저장한다. 저장소를 못 쓰면 null(투표는 이 방문에서만). */
function voterId(): string | null {
  try {
    let id = window.localStorage.getItem(VOTER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(VOTER_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function LetterVote({ slug, vote }: { slug: string; vote: Vote }) {
  // 서버 HTML과 첫 클라이언트 렌더를 같게 두려고 비어 있는 상태로 시작하고, 마운트 뒤에 서버에서 내 투표 여부를 읽는다.
  const [state, setState] = useState<VoteState>({ my_choice: null, counts: null });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const id = voterId();
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
    if (state.my_choice || busy) return;
    const id = voterId();
    if (!id) return setFailed(true);
    setBusy(true);
    setFailed(false);
    const next = await postVote(slug, id, key);
    setBusy(false);
    if (!next) return setFailed(true);
    setState(next);
    trackEvent('letter_vote', { letter: slug, option: next.my_choice ?? key });
  }

  const counts = state.counts;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <section className="ld-vote" aria-label="투표">
      <h2>{vote.question}</h2>
      <div className="ld-opts">
        {vote.options.map((o) => {
          const pct = counts && total > 0 ? Math.round(((counts[o.key] ?? 0) / total) * 100) : 0;
          return (
            <button key={o.key} type="button" className="ld-opt" aria-pressed={state.my_choice === o.key} disabled={!!state.my_choice || busy} onClick={() => pick(o.key)}>
              {state.my_choice && <span className="ld-opt-bar" style={{ width: `${pct}%` }} aria-hidden />}
              <span className="ld-opt-body">
                <span className="ld-opt-l">{o.label}</span>
                {o.hint && <span className="ld-opt-h">{o.hint}</span>}
              </span>
              {state.my_choice && <span className="ld-opt-p">{pct}%</span>}
            </button>
          );
        })}
      </div>
      <p className="ld-vote-note" role="status">
        {failed ? '지금은 투표를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요' : state.my_choice ? `${total}명이 참여했어요` : '하나를 고르면 다른 독자들의 선택을 볼 수 있어요'}
      </p>
    </section>
  );
}
