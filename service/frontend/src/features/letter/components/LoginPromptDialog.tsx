'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { rememberReturnTo } from '@/shared/lib/auth/returnTo';

/** 로그인하지 않고 팔로우를 눌렀을 때 뜨는 안내. 로그인 화면으로 보낸다(메일 구독은 로그인 없이 가능). */
export function LoginPromptDialog({ open, onClose, editorName }: { open: boolean; onClose: () => void; editorName: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="lt-dlg-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lt-dlg lt-dlg-sm" role="dialog" aria-modal="true" aria-labelledby="lt-login-title">
        <button type="button" className="lt-dlg-x" onClick={onClose} aria-label="닫기">×</button>
        <h2 id="lt-login-title" className="lt-dlg-h">로그인이 필요해요</h2>
        <p className="lt-dlg-lead">{editorName} 에디터를 팔로우하려면 로그인해 주세요. 팔로우하면 담당 분야와 겹치는 레터를 목록에서 먼저 확인할 수 있어요.</p>
        <Link href="/login" className="lt-dlg-primary lt-dlg-link" onClick={() => rememberReturnTo(window.location.pathname + window.location.search)}>로그인하기</Link>
        <p className="lt-dlg-foot">로그인 없이도 이메일로 새 레터를 받을 수 있어요.</p>
      </div>
    </div>
  );
}
