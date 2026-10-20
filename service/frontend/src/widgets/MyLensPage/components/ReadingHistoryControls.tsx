'use client';

import { useEffect, useRef, useState } from 'react';
import { clearAccountReadingHistory, ReadingHistoryError } from '@/entities/user';
import { DASHBOARD_AUTH_REQUIRED } from '../lib/dashboardApi';

export function ReadingHistoryControls({ owner }: { owner: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => () => request.current?.abort(), []);

  const open = () => {
    setError('');
    setMessage('');
    dialog.current?.showModal();
  };
  const clear = async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    try {
      await clearAccountReadingHistory(owner, controller.signal);
      dialog.current?.close();
      setMessage('열람 기록을 모두 삭제했어요. 새로 읽는 글부터 다시 기록해요.');
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof ReadingHistoryError && cause.status === 401 || cause instanceof Error && cause.name === 'NotSignedInError') {
        window.dispatchEvent(new Event(DASHBOARD_AUTH_REQUIRED));
      }
      setError(cause instanceof ReadingHistoryError ? cause.message : '삭제 결과를 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setPending(false);
      }
    }
  };

  return <div className="ml-history-controls">
    <p className="ml-history-note">화면에 10초 이상 보인 글을 기록해요. 같은 글은 한 편으로 세요.</p>
    <button type="button" className="ml-history-clear" onClick={open} disabled={pending}>열람 기록 전체 삭제</button>
    {message && <p className="ml-history-message" role="status">{message}</p>}
    <dialog ref={dialog} className="ml-history-dialog" aria-labelledby="ml-history-dialog-title" aria-describedby="ml-history-dialog-description" onCancel={event => { if (pending) event.preventDefault(); }}>
      <h2 id="ml-history-dialog-title">열람 기록을 모두 삭제할까요?</h2>
      <p id="ml-history-dialog-description">이 계정에 저장된 모든 기간의 뉴스·레터 열람 기록을 삭제해요. 최근 90일의 분야 집계와 추천도 초기화되며, 삭제한 기록은 복구할 수 없어요.</p>
      <p>저장한 기사·레터·문장과 에디터 팔로우는 유지돼요. 이후 읽는 글부터 다시 기록해요.</p>
      {error && <p className="ml-history-error" role="alert">{error}</p>}
      {pending && <p role="status">열람 기록을 삭제하고 있어요.</p>}
      <div className="ml-history-dialog-actions">
        <button type="button" className="ml-button ml-button-quiet" autoFocus disabled={pending} onClick={() => dialog.current?.close()}>취소</button>
        <button type="button" className="ml-button ml-history-confirm" disabled={pending} onClick={() => void clear()}>{pending ? '삭제 중…' : '전체 삭제'}</button>
      </div>
    </dialog>
  </div>;
}
