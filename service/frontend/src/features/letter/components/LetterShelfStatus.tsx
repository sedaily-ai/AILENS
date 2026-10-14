'use client';
import type { useLetterShelf } from '../lib/useLetterShelf';
import { LoginPromptDialog } from './dialog/LoginPromptDialog';
import { LETTER_CSS } from './letterStyles';

export function LetterShelfStatus({ shelf }: { shelf: ReturnType<typeof useLetterShelf> }) {
  return <div className="lt-save-note">
    {shelf.loginPromptOpen && <><style>{LETTER_CSS}</style><LoginPromptDialog purpose="bookmark" open onClose={shelf.closeLoginPrompt} /></>}
    <style>{`.lt-bookmark-toast{position:fixed;bottom:max(24px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:90;background:#17243d;color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;line-height:1.6;box-shadow:0 4px 20px #17243d22;max-width:calc(100vw - 32px);width:max-content;pointer-events:none;margin:0}@media(max-width:760px){.lt-bookmark-toast{bottom:max(16px,env(safe-area-inset-bottom));font-size:12px}}`}</style>
    {shelf.feedback && <p className="lt-bookmark-toast" role="status" aria-live="polite">{shelf.feedback}</p>}
    {shelf.pending && <p role="status">레터 저장 상태를 변경하고 있어요.</p>}
    {shelf.error && <p role="alert">{shelf.error} <button type="button" onClick={shelf.retry} disabled={shelf.pending}>다시 불러오기</button></p>}
    {shelf.unavailable.map(item => <p key={item.letter_id}>현재 공개되지 않은 저장 레터 <button type="button" disabled={shelf.pending} onClick={() => { void shelf.toggleSaved('', item.letter_id); }}>저장 해제</button></p>)}
  </div>;
}
