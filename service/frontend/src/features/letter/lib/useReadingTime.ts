'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/entities/user';
import { AccountApiError, isAccountAuthError, getLensPreferences, putLensPreferences, type LensPreferences } from '../data/accountApi';

/** 읽을 시간만 변경한다. 과거 관심사와 이메일 구독은 서버에서 보존한다. */
export function useReadingTime(enabled = true) {
  const { user, isLoading } = useAuth();
  const owner = user?.userId;
  const [state, setState] = useState<{ owner: string; preferences?: LensPreferences; available: boolean; error: string; authRequired?: boolean }>();
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!owner || isLoading || !enabled) return;
    const controller = new AbortController(); controllerRef.current = controller;
    void getLensPreferences(controller.signal).then(preferences => {
      if (!controller.signal.aborted) setState({ owner, preferences, available: true, error: '' });
    }).catch(error => {
      if (!controller.signal.aborted) setState(previous => ({ owner, preferences: previous?.owner === owner ? previous.preferences : undefined, available: false, authRequired: isAccountAuthError(error), error: '읽을 시간을 불러오지 못했어요. 다시 시도해 주세요.' }));
    });
    const refresh = () => { if (!saving.current) setReload(value => value + 1); };
    window.addEventListener('focus', refresh); window.addEventListener('pageshow', refresh);
    return () => { controller.abort(); window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh); };
  }, [owner, isLoading, reload, enabled]);
  const saveMinutes = useCallback(async (minutes: number): Promise<boolean> => {
    const before = state;
    const controller = controllerRef.current;
    if (!enabled || !owner || saving.current || before?.owner !== owner || !before.available || !before.preferences || !controller || controller.signal.aborted) return false;
    saving.current = true; setPending(true);
    try {
      const preferences = await putLensPreferences({ ...before.preferences, minutes }, controller.signal);
      if (controller.signal.aborted) return false;
      setState({ owner, preferences, available: true, error: '' });
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      if (error instanceof AccountApiError && error.status === 409) {
        try {
          const preferences = await getLensPreferences(controller.signal);
          if (!controller.signal.aborted) setState({ owner, preferences, available: true, error: error.message });
        } catch (refreshError) {
          if (!controller.signal.aborted) setState({ ...before, available: false, authRequired: isAccountAuthError(refreshError), error: '최신 읽을 시간을 확인하지 못했어요. 다시 불러와 주세요.' });
        }
      } else setState({ ...before, authRequired: isAccountAuthError(error), error: error instanceof Error ? error.message : '읽을 시간을 저장하지 못했어요.' });
      return false;
    } finally { saving.current = false; setPending(false); }
  }, [owner, state, enabled]);
  const mine = enabled && state?.owner === owner ? state : undefined;
  return { minutes: mine?.preferences?.minutes, available: !!mine?.available, pending, error: mine?.error ?? '', authRequired: !!mine?.authRequired, saveMinutes, retry: () => setReload(value => value + 1) };
}
