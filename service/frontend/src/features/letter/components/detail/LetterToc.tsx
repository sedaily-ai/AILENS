'use client';

import { useEffect, useState } from 'react';
import type { LetterSection } from '../../data/letterTypes';

/** 오른쪽(넓은 화면)에 떠 있는 섹션 목차. 지금 읽는 섹션이 굵게 표시되고, 누르면 그 섹션으로 이동한다. */
export function LetterToc({ sections }: { sections: LetterSection[] }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const els = sections.map((_, i) => document.getElementById(`ld-sec-${i}`)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(Number(vis.target.id.replace('ld-sec-', '')));
      },
      { rootMargin: '-20% 0px -65% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [sections]);
  return (
    <aside className="ld-toc-rail"><nav className="ld-toc" aria-label="목차">
      <ol>
        {sections.map((s, i) => (
          <li key={i} className={i === active ? 'on' : ''}>
            <a href={`#ld-sec-${i}`} onClick={(e) => { e.preventDefault(); document.getElementById(`ld-sec-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              <b>{String(i + 1).padStart(2, '0')}</b>{s.heading}
            </a>
          </li>
        ))}
      </ol>
    </nav></aside>
  );
}
