'use client';

import { useEffect, useState } from 'react';
import type { LetterVote as Vote } from '../data/letterTypes';

// 목업 집계 — 실제 투표 API가 붙기 전까지 슬러그에서 만든 고정 기준값 위에 내 선택 1표를 더해 보여 준다. 저장은 이 기기(localStorage)뿐이다.
function baseCounts(slug: string, n: number): number[] {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: n }, (_, i) => 20 + ((h >> (i * 5)) % 60));
}

function readChoice(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function LetterVote({ slug, vote }: { slug: string; vote: Vote }) {
  const storageKey = `letter-vote:${slug}`;
  // 서버 HTML과 첫 클라이언트 렌더를 같게 두려고 null로 시작하고, 마운트 뒤에 이 기기에 저장된 선택을 읽는다(하이드레이션 불일치 방지).
  const [choice, setChoice] = useState<string | null>(null);
  useEffect(() => {
    const saved = readChoice(storageKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setChoice(saved);
  }, [storageKey]);
  const base = baseCounts(slug, vote.options.length);
  const counts = base.map((c, i) => c + (choice === vote.options[i].key ? 1 : 0));
  const total = counts.reduce((a, b) => a + b, 0);

  function pick(key: string) {
    if (choice) return;
    setChoice(key);
    try {
      window.localStorage.setItem(storageKey, key);
    } catch {
      /* 저장 실패해도 화면에는 반영 */
    }
  }

  return (
    <section className="ld-vote" aria-label="투표">
      <h2>{vote.question}</h2>
      <div className="ld-opts">
        {vote.options.map((o, i) => {
          const pct = Math.round((counts[i] / total) * 100);
          return (
            <button key={o.key} type="button" className="ld-opt" aria-pressed={choice === o.key} disabled={!!choice} onClick={() => pick(o.key)}>
              {choice && <span className="ld-opt-bar" style={{ width: `${pct}%` }} aria-hidden />}
              <span className="ld-opt-body">
                <span className="ld-opt-l">{o.label}</span>
                {o.hint && <span className="ld-opt-h">{o.hint}</span>}
              </span>
              {choice && <span className="ld-opt-p">{pct}%</span>}
            </button>
          );
        })}
      </div>
      <p className="ld-vote-note">{choice ? `${total}명이 참여했어요 (목업 집계)` : '하나를 고르면 다른 독자들의 선택을 볼 수 있어요'}</p>
    </section>
  );
}
