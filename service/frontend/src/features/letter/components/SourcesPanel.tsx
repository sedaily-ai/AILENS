'use client';

import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { AxisBadge } from './AxisBadge';
import type { LetterSource } from '../data/letterTypes';

/** "이 레터에 쓰인 기사" 패널 — 본문 앞에 두어 기사들이 어떤 축으로 쓰였는지 읽기 전에 보이게 한다. */
export function SourcesPanel({ sources, letterSlug }: { sources: LetterSource[]; letterSlug: string }) {
  return (
    <section className="ld-panel" aria-label="이 레터에 쓰인 기사">
      <h2 className="ld-panel-h">
        이 레터에 쓰인 기사 <small>{sources.length}건</small>
      </h2>
      {sources.map((s, i) => {
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
        if (s.placeholder) {
          return (
            <div key={i} className="ld-src ld-src-ph">
              {body}
            </div>
          );
        }
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
