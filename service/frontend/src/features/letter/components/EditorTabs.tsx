'use client';

import { EDITORS } from '../data/editors';
import { EditorAvatar } from './EditorAvatar';

/** 카테고리 탭처럼 쓰는 에디터 선택줄. 하나를 고르면 아래에 그 에디터의 소개와 레터 목록이 나온다. */
export function EditorTabs({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  return (
    <div className="lt-etabs" role="group" aria-label="에디터">
      <button type="button" className="lt-etab lt-etab-all" aria-pressed={selected === null} onClick={() => onSelect(null)}>전체</button>
      {EDITORS.map((e) => (
        <button key={e.id} type="button" className="lt-etab" aria-pressed={selected === e.id} onClick={() => onSelect(e.id)}>
          <EditorAvatar editor={e} size={28} />
          <span className="lt-etab-text"><strong>{e.name}</strong><em>{e.role.replace(' 에디터', '')}</em></span>
        </button>
      ))}
    </div>
  );
}
