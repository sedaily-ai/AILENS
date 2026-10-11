'use client';

import type { CSSProperties } from 'react';
import { EDITORS } from '../data/editors';
import { EditorAvatar } from './EditorAvatar';

/** 레터 탭의 에디터 선택줄. 다른 탭의 알약형 카테고리와 구분되게 초상(일러스트) 아래 이름·역할을 두는 형태이고, 선택하면 에디터 색 테두리가 둘러진다. */
export function EditorTabs({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  return (
    <div className="lt-etabs" role="group" aria-label="에디터">
      <button type="button" className="lt-etab lt-etab-all" aria-pressed={selected === null} onClick={() => onSelect(null)}>
        <span className="lt-etab-ring">전체</span>
        <span className="lt-etab-text"><strong>모든 에디터</strong><em>최신순</em></span>
      </button>
      {EDITORS.map((e) => (
        <button key={e.id} type="button" className="lt-etab" aria-pressed={selected === e.id} onClick={() => onSelect(e.id)} style={{ '--tone-bg': e.tone.bg, '--tone-fg': e.tone.fg } as CSSProperties}>
          <span className="lt-etab-ring"><EditorAvatar editor={e} size={58} /></span>
          <span className="lt-etab-text"><strong>{e.name}</strong><em>{e.role.replace(' 에디터', '')}</em></span>
        </button>
      ))}
    </div>
  );
}
