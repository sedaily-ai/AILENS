'use client';

import { useEffect, useState } from 'react';
import { castPostVote, fetchPostVote, type PostVoteState } from '@/shared/lib/api/postVoteApi';
import { getVoterId } from '@/shared/lib/device/voterId';
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
  const [busy, setBusy] = useState(false);
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
    if (state.my_choice || busy) return;
    const id = getVoterId();
    if (!id) return setFailed(true);
    setBusy(true);
    setFailed(false);
    const next = await castPostVote(slug, id, key);
    setBusy(false);
    if (!next) return setFailed(true);
    setState(next);
    trackEvent('post_vote', { post: slug, option: next.my_choice ?? key });
  }

  const counts = state.counts;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="lread-box lread-box-vote" role="group" aria-label="투표">
      <div className="lread-box-title">{title}</div>
      <div className="lvote-opts">
        {choices.map((label, i) => {
          const key = `o${i + 1}`;
          const pct = counts && total > 0 ? Math.round(((counts[key] ?? 0) / total) * 100) : 0;
          return (
            <button key={key} type="button" className="lvote-opt" aria-pressed={state.my_choice === key} disabled={!!state.my_choice || busy} onClick={() => pick(key)}>
              <span className="lvote-l">{label}</span>
              {state.my_choice && (
                <span className="lvote-res">
                  <span className="lvote-p">{pct}%</span>
                  <span className="lvote-track" aria-hidden>
                    <span className="lvote-fill" style={{ width: `${pct}%` }} />
                  </span>
                  {state.my_choice === key && <span className="lvote-mine">내 선택</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="lvote-note" role="status">
        {failed ? '지금은 투표를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요' : state.my_choice ? `${total}명이 참여했어요` : '하나를 고르면 다른 독자들의 선택을 볼 수 있어요'}
      </p>
    </div>
  );
}
