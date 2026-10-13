'use client';

import { useEffect, useRef } from 'react';
import { EDITORS } from '../../data/editors';
import { EditorAvatar } from '../EditorAvatar';

/** 작은 프로필·이름 선택줄. 주소 진입과 폭 변경에서도 선택된 에디터가 보이게 한다. */
export function EditorTabs({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const reveal = () => {
      const item = el.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (!item) return;
      const left = item.offsetLeft;
      if (left < el.scrollLeft || left + item.offsetWidth > el.scrollLeft + el.clientWidth) {
        el.scrollTo({ left: Math.max(0, left - (el.clientWidth - item.offsetWidth) / 2), behavior: 'instant' });
      }
    };
    const frame = requestAnimationFrame(reveal);
    const observer = new ResizeObserver(reveal);
    observer.observe(el);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [selected]);

  return (
    <div ref={container} className="lt-etabs" role="group" aria-label="에디터">
      <button type="button" className="lt-etab lt-etab-all" aria-pressed={selected === null} onClick={() => onSelect(null)}>전체</button>
      {EDITORS.map((e) => (
        <button key={e.id} type="button" className="lt-etab" aria-pressed={selected === e.id} aria-label={`${e.name} · ${e.short ?? e.role}`} title={e.short ?? e.role} onClick={() => onSelect(e.id)}>
          <span className="lt-etab-ring"><EditorAvatar editor={e} size={28} fill /></span>
          <span className="lt-etab-text"><strong>{e.name}</strong></span>
        </button>
      ))}
    </div>
  );
}
