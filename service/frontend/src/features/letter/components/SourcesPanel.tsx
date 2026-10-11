'use client';

import { useState } from 'react';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import type { LetterSource } from '../data/letterTypes';
import { AxisBadge } from './AxisBadge';

/** "이 레터에 쓰인 기사" — 기본은 펼쳐 두고 접을 수 있다. 기사마다 어떤 축(소식·실체·다른 시각)으로 쓰였는지 배지로 보인다. */
export function SourcesPanel({ sources, letterSlug }: { sources: LetterSource[]; letterSlug: string }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="ld-panel" aria-label="이 레터에 쓰인 기사">
      <button type="button" className="ld-panel-h ld-panel-toggle" aria-expanded={open} onClick={() => { trackEvent('letter_sources_toggle', { letter: letterSlug, open: !open }); setOpen((v) => !v); }}>
        <span>이 레터에 쓰인 기사 <small>{sources.length}건</small></span>
        <span className="ld-panel-caret" aria-hidden>{open ? "접기" : "펼치기"}</span>
      </button>
      {open && sources.map((s, i) => {
        const body = (
          <>
            <span className="ld-src-n">{i + 1}</span>
            <span>
              <span className="ld-src-t">
                {s.title}
                {!s.internal && !s.placeholder && <span className="ld-ext" aria-label="외부 기사"> ↗</span>}
              </span>
              <span className="ld-src-o" style={{ display: 'block' }}>
                {s.placeholder ? '목업 자리표시 — 실제 기사 연결 전' : s.internal ? s.outlet : `${s.outlet} · 외부 기사`}
              </span>
            </span>
            <span className="ld-src-ax">
              {s.axes.map((a) => (
                <AxisBadge key={a} axis={a} />
              ))}
            </span>
          </>
        );
        if (s.placeholder) return <div key={i} className="ld-src ld-src-ph">{body}</div>;
        return (
          <a
            key={s.href + i}
            href={s.href}
            className="ld-src"
            onClick={() => trackEvent('letter_source_click', { letter: letterSlug, source_index: i + 1, place: 'panel', outbound: !s.internal })}
            {...(s.internal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          >
            {body}
          </a>
        );
      })}
    </section>
  );
}
