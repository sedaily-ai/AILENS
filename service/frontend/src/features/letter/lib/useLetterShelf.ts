'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/entities/user';
import { getAccountBookmarks, isAccountAuthError, setAccountBookmark, type AccountBookmark } from '../data/accountApi';
import type { IssueLetter } from '../data/letterTypes';

export const LETTER_SHELF_NOTICE = { guest: '레터를 저장하려면 로그인해 주세요.' } as const;
const SAVED_KEY = 'lens-letter-saved';
const CHANGED = 'lens-account-bookmarks-changed';
function readList(key: string): string[] {
  try { const raw = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
}
function bookmarkLetter(bookmark: AccountBookmark): IssueLetter[] {
  const c = bookmark.content;
  if (!c.available || !c.slug) return [];
  return [{ slug: c.slug, title: c.title ?? '', deck: c.summary ?? '', categories: c.categories ?? [], publishedAt: c.published_at ?? '',
    axisLabels: [], issueNumber: 0, summary: [], sections: [], editorNote: '', vote: null, sources: [] }];
}

export function useLetterShelf(enabled = true) {
  const { user, isLoading } = useAuth();
  const owner = user?.userId ?? 'browser';
  const currentOwner = useRef(owner); currentOwner.current = owner;
  const controllerRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ owner: string; saved: string[]; bookmarks: AccountBookmark[]; ready: boolean; available: boolean; error: string; authRequired?: boolean; loginRequested?: boolean }>({ owner, saved: [], bookmarks: [], ready: false, available: false, error: '' });
  const stateRef = useRef(state); stateRef.current = state;
  const pending = useRef(new Set<string>());
  const [pendingCount, setPendingCount] = useState(0);
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] = useState<{ owner: string; text: string } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current); }, []);
  const clearFeedback = useCallback(() => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = null; setFeedback(null);
  }, []);
  const announceSaved = useCallback((saved: boolean) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback({ owner, text: saved ? '저장한 레터에 담았어요.' : '저장한 레터에서 제외했어요.' });
    feedbackTimer.current = setTimeout(() => { setFeedback(null); feedbackTimer.current = null; }, 3000);
  }, [owner]);
  useEffect(() => {
    if (isLoading || !enabled) return;
    const controller = new AbortController(); controllerRef.current = controller;
    let loadRevision = 0;
    const sync = async () => {
      const seq = ++loadRevision;
      try {
        const bookmarks = user ? await getAccountBookmarks(controller.signal) : [];
        if (controller.signal.aborted || currentOwner.current !== owner || seq !== loadRevision) return;
        setState(previous => ({ owner, bookmarks, saved: user ? bookmarks.flatMap(b => b.content.available && b.content.slug ? [b.content.slug] : []) : readList(SAVED_KEY), ready: true, available: true, error: '', loginRequested: !user && previous.owner === owner && previous.loginRequested }));
      } catch (error) {
        if (!controller.signal.aborted && currentOwner.current === owner && seq === loadRevision) setState(previous => ({ ...previous, owner, saved: previous.owner === owner ? previous.saved : [], bookmarks: previous.owner === owner ? previous.bookmarks : [], ready: true, available: false, authRequired: isAccountAuthError(error), loginRequested: isAccountAuthError(error), error: error instanceof Error ? error.message : '저장 레터를 불러오지 못했어요.' }));
      }
    };
    void sync();
    const onChange = () => { void sync(); };
    const onStorage = (event: StorageEvent) => { if (event.key === 'lens-account-bookmarks-revision' || event.key === SAVED_KEY || event.key === null) onChange(); };
    window.addEventListener('lens-account-view-changed', onChange); window.addEventListener(CHANGED, onChange); window.addEventListener('storage', onStorage); window.addEventListener('focus', onChange); window.addEventListener('pageshow', onChange);
    return () => { controller.abort(); window.removeEventListener('lens-account-view-changed', onChange); window.removeEventListener(CHANGED, onChange); window.removeEventListener('storage', onStorage); window.removeEventListener('focus', onChange); window.removeEventListener('pageshow', onChange); };
  }, [owner, user, isLoading, revision, enabled]);
  const toggleSaved = useCallback(async (slug: string, explicitId?: string): Promise<boolean> => {
    const snapshot = stateRef.current;
    const key = explicitId ?? slug;
    if (!enabled || isLoading || snapshot.owner !== owner || !snapshot.ready) return false;
    if (!user || snapshot.authRequired) {
      setState(previous => ({ ...previous, loginRequested: true }));
      return false;
    }
    if (snapshot.owner !== owner || !snapshot.ready || !snapshot.available || pending.current.has(key)) return false;
    clearFeedback();
    pending.current.add(key); setPendingCount(pending.current.size);
    try {
      const wasSaved = explicitId ? snapshot.bookmarks.some(b => b.letter_id === explicitId) : snapshot.saved.includes(slug);
      const id = explicitId ?? snapshot.bookmarks.find(b => b.content.slug === slug)?.letter_id;
      const signal = controllerRef.current?.signal;
      await setAccountBookmark(slug, !wasSaved, id, signal);
      if (signal?.aborted || currentOwner.current !== owner) return false;
      announceSaved(!wasSaved);
      // 서버 확정 후 모든 같은 화면 훅과 다른 탭을 갱신한다. 원본 공용 키는 변경하지 않는다.
      window.dispatchEvent(new Event(CHANGED));
      try { localStorage.setItem('lens-account-bookmarks-revision', `${owner}:${Date.now()}`); } catch { /* 포커스 복귀 시 다시 조회 */ }
      return true;
    } catch (error) {
      if (currentOwner.current === owner) setState(previous => ({ ...previous, authRequired: isAccountAuthError(error), loginRequested: isAccountAuthError(error), error: error instanceof Error ? error.message : '레터를 저장하지 못했어요. 다시 시도해 주세요.' }));
      return false;
    } finally { pending.current.delete(key); setPendingCount(pending.current.size); }
  }, [owner, user, isLoading, announceSaved, clearFeedback, enabled]);
  const valid = state.owner === owner;
  const saved = valid ? state.saved : [];
  // 로그인 상태에서는 저장 안내를 띄우지 않는다(빈 문자열이면 화면에서 안내 줄을 그리지 않는다).
  const notice = user ? '' : `${LETTER_SHELF_NOTICE.guest}${saved.length ? ' 기존 브라우저 저장은 조회만 가능하며 계정 저장과는 별개예요.' : ''}`;
  return { ready: enabled && !isLoading && valid && state.ready, available: valid && state.available, error: valid ? state.error : '', notice,
    feedback: feedback?.owner === owner ? feedback.text : '',
    authRequired: valid && !!state.authRequired, pending: pendingCount > 0, saved, savedLetters: valid ? state.bookmarks.flatMap(bookmarkLetter) : [],
    loginPromptOpen: valid && !!state.loginRequested, closeLoginPrompt: () => setState(previous => ({ ...previous, loginRequested: false })),
    unavailable: valid ? state.bookmarks.filter(b => !b.content.available) : [],
    isSaved: (s: string) => saved.includes(s), toggleSaved, retry: () => setRevision(value => value + 1) };
}
