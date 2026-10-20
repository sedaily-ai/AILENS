'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  ARTICLE_BOOKMARKS_CHANGED, ArticleBookmarkError, getArticleBookmarkState, isArticleBookmarkAuthError, resolveArticleId, setArticleBookmark,
} from '../data/articleBookmarksApi';

export type ArticleSaveOutcome = 'saved' | 'removed' | 'failed' | 'login';

type State = { owner: string; slug: string; id: string | null; saved: boolean; ready: boolean; available: boolean };

/** 404는 '저장할 수 없음'이다: 공개되지 않은 기사이거나, 배포 사이 계정 API·CMS에 저장한 기사 경로가 아직 없는 경우. */
const unavailable = (error: unknown) => error instanceof ArticleBookmarkError && error.status === 404;

/**
 * 기사 한 편의 계정 저장 상태. 로그인하지 않았으면 저장 대신 'login'을 돌려줘 호출부가 로그인으로 보낸다.
 * 저장할 수 없는 기사(404)면 available=false — 버튼을 숨긴다. 그 밖의 확인 실패(네트워크)는 saved=false로 두고 눌렀을 때 다시 시도한다.
 */
export function useArticleBookmark(slug: string) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const owner = isAuthenticated ? user?.userId : undefined;
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const mine = state && state.owner === owner && state.slug === slug ? state : null;

  useEffect(() => {
    if (!owner) return;
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ owner?: string }>).detail;
      if (!detail?.owner || detail.owner === owner) setRevision((value) => value + 1);
    };
    window.addEventListener(ARTICLE_BOOKMARKS_CHANGED, changed);
    return () => window.removeEventListener(ARTICLE_BOOKMARKS_CHANGED, changed);
  }, [owner]);

  useEffect(() => {
    if (!owner || !slug) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const id = await resolveArticleId(slug, controller.signal);
        const saved = await getArticleBookmarkState(id, controller.signal);
        if (!controller.signal.aborted) setState({ owner, slug, id, saved, ready: true, available: true });
      } catch (error) {
        if (!controller.signal.aborted) setState({ owner, slug, id: null, saved: false, ready: true, available: !unavailable(error) });
      }
    })();
    return () => controller.abort();
  }, [owner, slug, revision]);

  const toggle = useCallback(async (): Promise<ArticleSaveOutcome | null> => {
    // 로그인 확인 중에는 로그인한 사용자도 owner가 아직 없다 — 로그인 화면으로 잘못 보내지 않게 기다린다.
    if (isLoading) return null;
    if (!owner) return 'login';
    // 이미 처리 중이면 아무것도 하지 않는다(두 번 누름을 실패로 알리지 않는다).
    if (busy) return null;
    setBusy(true);
    const nextSaved = !(mine?.saved ?? false);
    try {
      const id = mine?.id ?? await resolveArticleId(slug);
      const saved = await setArticleBookmark(id, nextSaved);
      setState({ owner, slug, id, saved, ready: true, available: true });
      window.dispatchEvent(new CustomEvent(ARTICLE_BOOKMARKS_CHANGED, { detail: { owner } }));
      return saved ? 'saved' : 'removed';
    } catch (error) {
      if (unavailable(error)) setState({ owner, slug, id: mine?.id ?? null, saved: false, ready: true, available: false });
      return isArticleBookmarkAuthError(error) ? 'login' : 'failed';
    } finally {
      setBusy(false);
    }
  }, [owner, isLoading, busy, mine, slug]);

  return {
    signedIn: !!owner,
    authLoading: isLoading,
    saved: mine?.saved ?? false,
    ready: !owner || !!mine?.ready,
    /** 로그인한 사용자에게 저장할 수 없는 기사로 확인되면 false. 로그인 전에는 true(누르면 로그인으로 보낸다). */
    available: !owner || mine?.available !== false,
    busy,
    toggle,
  };
}
