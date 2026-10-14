'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { rememberReturnTo } from '@/shared/lib/auth/returnTo';

function trapDialogTab(e: React.KeyboardEvent<HTMLDialogElement>) {
  if (e.key !== 'Tab') return;
  const dialog = e.currentTarget;
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'))
    .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  const first = controls[0];
  const last = controls.at(-1);
  const active = document.activeElement;
  if (!first) { e.preventDefault(); dialog.focus(); return; }
  if (active === dialog || !dialog.contains(active) || (e.shiftKey ? active === first : active === last)) {
    e.preventDefault();
    (e.shiftKey ? last : first)?.focus();
  }
}

type LoginPromptProps = { open: boolean; onClose: () => void } & (
  { purpose: 'bookmark'; editorName?: never } | { purpose?: 'follow'; editorName: string }
);

/** 로그인 없이 계정 저장·팔로우를 시도했을 때 안내하고 현재 화면의 복귀 주소를 남긴다. */
export function LoginPromptDialog({ open, onClose, editorName, purpose = 'follow' }: LoginPromptProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={dialogRef} tabIndex={-1} onKeyDown={trapDialogTab} className="lt-dlg-back" aria-modal="true" aria-labelledby="lt-login-title" style={{ width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', margin: 0, border: 0, color: 'inherit' }} onCancel={(e) => { e.preventDefault(); onClose(); }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lt-dlg lt-dlg-sm">
        <button type="button" className="lt-dlg-x" onClick={onClose} aria-label="닫기">×</button>
        <h2 id="lt-login-title" className="lt-dlg-h">로그인이 필요해요</h2>
        <p className="lt-dlg-lead">{purpose === 'bookmark' ? '레터를 저장하려면 로그인해 주세요. 계정에 저장한 레터는 나의 LENS에서 다시 볼 수 있어요.' : `${editorName} 에디터를 팔로우하려면 로그인해 주세요. 팔로우하면 담당 분야와 겹치는 레터를 목록에서 먼저 확인할 수 있어요.`}</p>
        <Link href="/login" className="lt-dlg-primary lt-dlg-link" onClick={() => rememberReturnTo(window.location.pathname + window.location.search + window.location.hash)}>로그인하기</Link>
        <p className="lt-dlg-foot">{purpose === 'bookmark' ? '로그인 후 저장 버튼을 다시 눌러 주세요. 기존 브라우저 저장은 그대로 보존돼요.' : '로그인 없이도 이메일로 새 레터를 받을 수 있어요.'}</p>
      </div>
    </dialog>
  );
}
