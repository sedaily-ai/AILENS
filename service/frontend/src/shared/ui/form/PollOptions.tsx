'use client';

import { useEffect, useRef, useState } from 'react';

/** 투표 보기 목록(모아쓰기 레터·1기사 레터 공용). 눌렀을 때 끊기지 않도록: 줄 높이를 고정해 레이아웃이 밀리지 않고,
 *  고른 보기는 즉시 반응하며, 집계가 오면 막대가 왼쪽에서 오른쪽으로 부드럽게 차오르고 숫자가 함께 올라간다. */

export interface PollOption {
  key: string;
  label: string;
  hint?: string;
  /** 색 구분: b 파랑(기본), w 앰버(우려류), n 회색(잘 모르겠어요) */
  tone?: 'b' | 'w' | 'n';
}

interface Props {
  options: PollOption[];
  myChoice: string | null;
  counts: Record<string, number> | null;
  /** 서버 응답을 기다리는 중인 보기(고른 직후) */
  pending: string | null;
  onPick: (key: string) => void;
  note: string;
  ariaLabel?: string;
}

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export const POLL_CSS = `
.pl { display: grid; gap: 8px; margin: 0; padding: 0; }
.pl-row { --c: #2f5fcf; --ct: #e3ebfb; position: relative; display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; padding: 0 16px; border: 1px solid #e5e7eb; border-radius: 14px; background: #fff; font: inherit; text-align: left; cursor: pointer; overflow: hidden; isolation: isolate; -webkit-tap-highlight-color: transparent; transition: border-color .18s, background-color .18s, transform .18s ${EASE}, opacity .3s; }
.pl-row[data-tone='w'] { --c: #b7791f; --ct: #fbebcd; }
.pl-row[data-tone='n'] { --c: #6b7280; --ct: #e5e7eb; }
.pl-row:hover:not(:disabled) { border-color: #cfd4dc; background: #fafbfc; }
.pl-row:active:not(:disabled) { transform: scale(0.985); }
.pl-row:focus-visible { outline: 2px solid var(--c); outline-offset: 2px; }
.pl-row:disabled { cursor: default; }
.pl[data-wait='true'] .pl-row { cursor: progress; }
.pl-fill { position: absolute; inset: 0; z-index: -1; background: #eef0f3; transform: scaleX(0); transform-origin: left center; transition: transform .8s ${EASE}, background-color .35s; }
.pl[data-done='true'] .pl-fill { transform: scaleX(var(--s, 0)); transition-delay: var(--d, 0ms), 0ms; }
.pl-row[data-mine='true'] .pl-fill { background: var(--ct); }
.pl-row[data-mine='true'] { cursor: default; }
.pl-mark { flex: none; width: 20px; height: 20px; border-radius: 999px; border: 1.5px solid #cdd2da; display: grid; place-items: center; transition: background-color .25s, border-color .25s, transform .35s ${EASE}; }
.pl-mark svg { width: 12px; height: 12px; stroke: #fff; fill: none; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 16; stroke-dashoffset: 16; transition: stroke-dashoffset .4s ${EASE} .08s; }
.pl-row[data-mine='true'] .pl-mark, .pl-row[data-pending='true'] .pl-mark { background: var(--c); border-color: var(--c); transform: scale(1.06); }
.pl-row[data-mine='true'] .pl-mark svg, .pl-row[data-pending='true'] .pl-mark svg { stroke-dashoffset: 0; }
.pl-body { flex: 1; min-width: 0; display: grid; gap: 2px; padding: 14px 0; }
.pl-l { font-size: 15px; font-weight: 600; line-height: 1.45; color: #111827; transition: color .25s, opacity .3s; }
.pl-row[data-mine='true'] .pl-l { font-weight: 700; }
.pl-h { font-size: 12.5px; color: #6b7280; }
.pl-p { flex: none; min-width: 44px; text-align: right; font-size: 15px; font-weight: 700; color: #9ca3af; font-variant-numeric: tabular-nums; opacity: 0; transform: translateX(6px); transition: opacity .35s, transform .5s ${EASE}, color .25s; transition-delay: var(--d, 0ms); }
.pl[data-done='true'] .pl-p { opacity: 1; transform: none; }
.pl-row[data-mine='true'] .pl-p { color: var(--c); }
.pl[data-wait='true'] .pl-row:not([data-pending='true']) { opacity: 0.62; }
.pl[data-done='true'] .pl-row:not([data-mine='true']) .pl-l { color: #4b5563; font-weight: 500; }
.pl-note { margin: 10px 0 0; min-height: 18px; font-size: 12.5px; color: #9ca3af; transition: opacity .25s; }
@media (prefers-reduced-motion: reduce) { .pl-row, .pl-fill, .pl-mark, .pl-mark svg, .pl-p, .pl-l, .pl-note { transition: none !important; } }
`;

/** 숫자를 직전 값에서 target 까지 부드럽게 올리거나 내린다(막대와 같은 길이·곡선). 움직임 줄이기 설정이면 한 프레임에 바로 target. setState 는 rAF 콜백에서만 부른다. */
function useCountUp(target: number, run: boolean, delay: number): number {
  const [v, setV] = useState(0);
  const last = useRef(0);
  useEffect(() => {
    if (!run) {
      last.current = 0;
      return;
    }
    const from = last.current;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 1 : 800;
    const begin = performance.now() + (reduce ? 0 : delay);
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - begin) / dur));
      const val = Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3)));
      last.current = val;
      setV(val);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, delay]);
  return run ? v : 0;
}

function Row({ opt, i, pct, done, mine, pending, disabled, onPick }: { opt: PollOption; i: number; pct: number; done: boolean; mine: boolean; pending: boolean; disabled: boolean; onPick: () => void }) {
  const delay = i * 70;
  const shown = useCountUp(pct, done, delay);
  return (
    <button type="button" className="pl-row" data-tone={opt.tone ?? 'b'} data-mine={mine} data-pending={pending} aria-pressed={mine} disabled={disabled} onClick={onPick} style={{ ['--d' as string]: `${delay}ms` } as React.CSSProperties}>
      <span className="pl-fill" style={{ ['--s' as string]: pct / 100 } as React.CSSProperties} aria-hidden />
      <span className="pl-mark" aria-hidden>
        <svg viewBox="0 0 12 12"><path d="M2.5 6.4 5 8.8 9.6 3.4" /></svg>
      </span>
      <span className="pl-body">
        <span className="pl-l">{opt.label}</span>
        {opt.hint && <span className="pl-h">{opt.hint}</span>}
      </span>
      <span className="pl-p" aria-hidden={!done}>{shown}%</span>
    </button>
  );
}

export function PollOptions({ options, myChoice, counts, pending, onPick, note, ariaLabel }: Props) {
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const done = !!myChoice && !!counts; // 집계가 도착하면 CSS 애니메이션이 0%에서 시작해 차오른다
  const locked = !!pending; // 투표한 뒤에도 다른 보기를 눌러 바꿀 수 있다(응답을 기다리는 동안만 잠근다)
  return (
    <>
      <style href="poll-options" precedence="default">{POLL_CSS}</style>
      <div className="pl" role="group" aria-label={ariaLabel ?? '투표'} data-done={done} data-wait={!!pending && !myChoice}>
        {options.map((o, i) => (
          <Row key={o.key} opt={o} i={i} pct={total > 0 ? Math.round(((counts?.[o.key] ?? 0) / total) * 100) : 0} done={done} mine={myChoice === o.key} pending={pending === o.key && !myChoice} disabled={locked || myChoice === o.key} onPick={() => onPick(o.key)} />
        ))}
      </div>
      <p className="pl-note" role="status" aria-live="polite">{note}</p>
    </>
  );
}
