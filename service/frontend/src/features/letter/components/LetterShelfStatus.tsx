'use client';
import type { useLetterShelf } from '../lib/useLetterShelf';
import { LoginPromptDialog } from './dialog/LoginPromptDialog';
import { LETTER_CSS } from './letterStyles';

export function LetterShelfStatus({ shelf }: { shelf: ReturnType<typeof useLetterShelf> }) {
  return <div className="lt-save-note" aria-live="polite">
    {shelf.loginPromptOpen && <><style>{LETTER_CSS}</style><LoginPromptDialog purpose="bookmark" open onClose={shelf.closeLoginPrompt} /></>}
    {shelf.pending && <p role="status">레터 저장 상태를 변경하고 있어요.</p>}
    {shelf.error && <p role="alert">{shelf.error} <button type="button" onClick={shelf.retry} disabled={shelf.pending}>다시 불러오기</button></p>}
    {shelf.unavailable.map(item => <p key={item.letter_id}>현재 공개되지 않은 저장 레터 <button type="button" disabled={shelf.pending} onClick={() => { void shelf.toggleSaved('', item.letter_id); }}>저장 해제</button></p>)}
  </div>;
}
