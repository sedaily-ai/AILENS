'use client';

import { createPortal } from 'react-dom';

/**
 * 화면 아래 가운데 짧은 안내. 기사 '공유'·'저장' 결과에 쓴다.
 * 성공은 status, 실패는 alert로 읽히고, 375px에서도 줄바꿈되어 화면 밖으로 넘치지 않는다.
 */
export function BottomToast({ message, alert = false }: { message: string | null; alert?: boolean }) {
  if (!message || typeof document === 'undefined') return null;
  return createPortal(
    <div
      role={alert ? 'alert' : 'status'}
      className="pointer-events-none fixed bottom-6 left-1/2 z-[300] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white shadow-lg"
      style={{ maxWidth: 'calc(100vw - 32px)', width: 'max-content', wordBreak: 'keep-all', textAlign: 'center' }}
    >
      {message}
    </div>,
    document.body,
  );
}
