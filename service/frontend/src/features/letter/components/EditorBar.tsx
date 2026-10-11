'use client';

import { useState } from 'react';
import type { LetterEditor } from '../data/editors';
import { unionInterests } from '../data/editors';
import { SubscribeDialog } from './SubscribeDialog';

/**
 * 내 에디터 바: 팔로우한 에디터를 한 줄로 보여 주고, 같은 목록에서 겹치는 레터만 모아 보거나 메일로 받게 한다.
 * 추천 순서를 따로 만들지 않는다 — 목록은 늘 최신순이고, 겹치는 레터에는 "왜 맞는지"만 덧붙는다.
 */
export function EditorBar({ followed, onlyMine, onToggleOnlyMine, matchCount, onSelect }: { followed: LetterEditor[]; onlyMine: boolean; onToggleOnlyMine: () => void; matchCount: number; onSelect: (id: string) => void }) {
  const [mailOpen, setMailOpen] = useState(false);
  if (followed.length === 0) {
    return (
      <div className="lt-ibar">
        <div className="lt-ibar-row">
          <p className="lt-ibar-msg"><strong>에디터를 골라 팔로우하면</strong> 겹치는 레터에 이유와 함께 표시해 드려요. 계정 없이 이 기기에만 저장돼요.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="lt-ibar">
      <div className="lt-ibar-row">
        <div className="lt-ibar-mine">
          <span className="lt-ibar-label">내 에디터</span>
          <ul className="lt-ibar-chips" aria-label="팔로우한 에디터">
            {followed.map((e) => <li key={e.id}><button type="button" className="lt-topic lt-topic-btn" onClick={() => onSelect(e.id)}>{e.name} · {e.role.replace(' 에디터', '')}</button></li>)}
          </ul>
        </div>
        <div className="lt-ibar-actions">
          <button type="button" className="lt-ibar-toggle" aria-pressed={onlyMine} onClick={onToggleOnlyMine}>겹치는 레터만 {matchCount}</button>
          <button type="button" className="lt-ibar-mail" aria-expanded={mailOpen} onClick={() => setMailOpen((v) => !v)}>메일로 받기</button>
        </div>
      </div>
      <SubscribeDialog open={mailOpen} onClose={() => setMailOpen(false)} interests={unionInterests(followed)} source="bar" title="팔로우한 에디터의 새 레터를 메일로 받기"
        lead={<>{followed.map((e) => e.name).join(' · ')} 에디터의 담당 분야와 겹치는 레터를 보내요.</>} />
    </div>
  );
}
