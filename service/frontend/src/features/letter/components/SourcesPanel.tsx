import { AxisBadge } from './AxisBadge';
import type { LetterSource } from '../data/letterTypes';

/** "이 레터에 쓰인 기사" 패널 — 본문 앞에 두어 기사들이 어떤 축으로 쓰였는지 읽기 전에 보이게 한다. */
export function SourcesPanel({ sources }: { sources: LetterSource[] }) {
  return (
    <section className="ld-panel" aria-label="이 레터에 쓰인 기사">
      <h2 className="ld-panel-h">
        이 레터에 쓰인 기사 <small>{sources.length}건</small>
      </h2>
      {sources.map((s, i) => (
        <a
          key={s.href + i}
          href={s.href}
          className="ld-src"
          {...(s.internal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
        >
          <span className="ld-src-n">{i + 1}</span>
          <span>
            <span className="ld-src-t">{s.title}</span>
            <span className="ld-src-o" style={{ display: 'block' }}>
              {s.outlet}
              {s.internal ? '' : ' · 외부 기사'}
            </span>
          </span>
          <span className="ld-src-ax">
            {s.axes.map((a) => (
              <AxisBadge key={a} axis={a} />
            ))}
          </span>
        </a>
      ))}
    </section>
  );
}
