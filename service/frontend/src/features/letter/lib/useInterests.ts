'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/entities/user';
import { fetchMyFeed, fetchMyInterests, saveMyInterests, type InterestItem } from '../data/interestApi';
import { AccountApiError, isAccountAuthError, getLensPreferences, putLensPreferences, type LensPreferences } from '../data/accountApi';
import type { IssueLetter } from '../data/letterTypes';

/** 로그인 관심은 계정 API, 비로그인 공개 레터는 기존 기기 API. 계정 실패 시 기기로 대체하지 않는다. */
export function useInterests() {
  const { user, isLoading } = useAuth();
  const owner = user?.userId ?? 'browser';
  const currentOwner = useRef(owner); currentOwner.current = owner;
  const [state, setState] = useState<{ owner: string; ready: boolean; available: boolean; preferences: LensPreferences; reasons: Record<string, string>; matchedLetters: IssueLetter[]; error: string; authRequired?: boolean }>({ owner, ready: false, available: false, preferences: { interests: [], minutes: 0, revision: 0, updated_at: null }, reasons: {}, matchedLetters: [], error: '' });
  const stateRef = useRef(state); stateRef.current = state;
  const saving = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!user) return;
    const refresh = () => setReload(value => value + 1);
    window.addEventListener('focus', refresh); window.addEventListener('pageshow', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh); };
  }, [owner, user]);

  useEffect(() => {
    if (isLoading) return;
    const controller = new AbortController(); controllerRef.current = controller;
    void (async () => {
      try {
        const mine = user ? null : await fetchMyInterests();
        if (!user && mine === null) throw new Error('관심 설정을 불러오지 못했어요.');
        const preferences = user ? await getLensPreferences(controller.signal) : { interests: mine ?? [], minutes: 0, revision: 0, updated_at: null };
        const feed = !user && preferences.interests.length ? await fetchMyFeed(30) : [];
        if (!controller.signal.aborted && currentOwner.current === owner) setState({ owner, ready: true, available: true, preferences, matchedLetters: feed, reasons: Object.fromEntries(feed.filter(l => l.reason).map(l => [l.slug, l.reason as string])), error: '' });
      } catch (error) {
        if (!controller.signal.aborted && currentOwner.current === owner) setState({ owner, ready: true, available: false, preferences: { interests: [], minutes: 0, revision: 0, updated_at: null }, reasons: {}, matchedLetters: [], authRequired: isAccountAuthError(error), error: error instanceof Error ? error.message : '관심 설정을 불러오지 못했어요.' });
      }
    })();
    return () => controller.abort();
  }, [owner, isLoading, reload, user]);
  const saveValues = useCallback(async (items: InterestItem[], minutes: number): Promise<boolean> => {
    if (saving.current || stateRef.current.owner !== owner || !stateRef.current.available) return false;
    saving.current = true;
    try {
      const before = stateRef.current.preferences;
      let preferences: LensPreferences;
      if (user) preferences = await putLensPreferences({ ...before, interests: items, minutes }, controllerRef.current?.signal);
      else {
        const saved = await saveMyInterests(items);
        if (saved === null) throw new Error('관심사를 저장하지 못했어요.');
        preferences = { ...before, interests: saved };
      }
      const feed = !user && preferences.interests.length ? await fetchMyFeed(30) : [];
      if (currentOwner.current !== owner) return false;
      setState(previous => ({ ...previous, preferences, matchedLetters: feed, reasons: Object.fromEntries(feed.filter(l => l.reason).map(l => [l.slug, l.reason as string])), error: '' }));
      return true;
    } catch (error) {
      if (currentOwner.current !== owner) return false;
      // 최신 revision만 복원해 사용자의 dialog 선택은 유지한다. 자동 덮어쓰기 재시도는 하지 않는다.
      if (error instanceof AccountApiError && error.status === 409) {
        try { const latest = await getLensPreferences(controllerRef.current?.signal); if (currentOwner.current === owner) setState(previous => ({ ...previous, preferences: latest, error: error.message })); } catch { /* 다음 재조회에서 복구 */ }
      } else setState(previous => ({ ...previous, authRequired: isAccountAuthError(error), error: error instanceof Error ? error.message : '관심사를 저장하지 못했어요.' }));
      return false;
    } finally { saving.current = false; }
  }, [owner, user]);
  const valid = state.owner === owner;
  return { ready: !isLoading && valid && state.ready, available: valid && state.available, saved: valid ? state.preferences.interests : [], minutes: valid ? state.preferences.minutes : 0,
    reasons: valid ? state.reasons : {}, matchedLetters: valid ? state.matchedLetters : [], error: valid ? state.error : '', account: !!user, authRequired: valid && !!state.authRequired,
    save: (items: InterestItem[]) => saveValues(items, stateRef.current.preferences.minutes), saveMinutes: (minutes: number) => saveValues(stateRef.current.preferences.interests, minutes), retry: () => setReload(value => value + 1) };
}
export type InterestState = ReturnType<typeof useInterests>;
