'use client';

import type { CSSProperties } from 'react';
import { EDITORS } from '../data/editors';
import { EditorAvatar } from './EditorAvatar';

/** 레터 탭의 에디터 선택줄. 만화 컷처럼 굵은 윤곽선 + 단단한 그림자의 캐릭터 카드이고, 선택하면 카드가 떠오르며 그림자가 에디터 색으로 바뀐다. */
export function EditorTabs({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  return (
    <div className="lt-etabs" role="group" aria-label="에디터">
      <button type="button" className="lt-etab lt-etab-all" aria-pressed={selected === null} onClick={() => onSelect(null)}>
        <span className="lt-etab-ring"><b>ALL</b></span>
        <span className="lt-etab-text"><strong>모든 에디터</strong><em>최신순</em></span>
      </button>
      {EDITORS.map((e) => (
        <button key={e.id} type="button" className="lt-etab" aria-pressed={selected === e.id} onClick={() => onSelect(e.id)} style={{ '--tone-bg': e.tone.bg, '--tone-fg': e.tone.fg } as CSSProperties}>
          <span className="lt-etab-ring"><EditorAvatar editor={e} size={108} fill /></span>
          <span className="lt-etab-text"><strong>{e.name}</strong><em>{e.role.replace(' 에디터', '')}</em></span>
        </button>
      ))}
    </div>
  );
}
