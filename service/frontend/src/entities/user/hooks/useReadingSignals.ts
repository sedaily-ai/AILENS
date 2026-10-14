'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { parseReadingSignals, readingSignalKey, READING_SIGNAL_EVENT, saveReadingSignal, type ReadingSignal } from '../lib/readingSignals';

export function useReadingSignalScope() {
  const { user, isLoading, isAuthenticated } = useAuth();
  return isLoading ? null : isAuthenticated ? user?.userId ? `account:${user.userId}` : null : 'browser';
}

/** 열기만 한 뉴스와 구분할 약한 관심 신호. 완독·보상·서버 읽음 기록을 만들지 않는다. */
export function useNewsReadingSignal(article: Omit<ReadingSignal, 'seenAt'> | null) {
  const scope = useReadingSignalScope();
  const key = article ? JSON.stringify(article) : '';
  useEffect(() => {
    if (!scope || !key) return;
    let visibleSeconds = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      visibleSeconds++;
      if (visibleSeconds < 10) return;
      window.clearInterval(timer);
      const signal = JSON.parse(key) as Omit<ReadingSignal, 'seenAt'>;
      saveReadingSignal(scope, { ...signal, seenAt: new Date().toISOString() });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [key, scope]);
}

export function useReadingSignals() {
  const scope = useReadingSignalScope();
  const [state, setState] = useState<{ scope: string; records: ReadingSignal[]; available: boolean } | null>(null);
  useEffect(() => {
    if (!scope) return;
    const sync = () => {
      try { setState({ scope, records: parseReadingSignals(localStorage.getItem(readingSignalKey(scope))), available: true }); }
      catch { setState({ scope, records: [], available: false }); }
    };
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    window.addEventListener(READING_SIGNAL_EVENT, sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('focus', sync); window.removeEventListener(READING_SIGNAL_EVENT, sync); };
  }, [scope]);
  const mine = state?.scope === scope ? state : null;
  return { records: mine?.records ?? [], ready: !!mine, available: mine?.available ?? true, scope };
}
