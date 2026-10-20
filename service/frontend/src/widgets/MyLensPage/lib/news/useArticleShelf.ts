'use client';

import { useEffect, useState } from 'react';
import { ARTICLE_BOOKMARKS_CHANGED, ArticleBookmarkError, listArticleBookmarks, setArticleBookmark, useAuth, type ArticleBookmark } from '@/entities/user';

/** 나의 LENS 내 서랍 '저장한 기사'(2026-10-20). 계정에 저장한 기사를 최신 저장순으로 불러오고, 서랍에서 저장을 해제한다. */
export function useArticleShelf(enabled = true) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const owner = isAuthenticated ? user?.userId : undefined;
  const [result, setResult] = useState<{ owner: string; items: ArticleBookmark[]; failed: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  useEffect(() => {
    if (!owner || !enabled) return;
    const refresh = () => setRevision((value) => value + 1);
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ owner?: string }>).detail;
      if (!detail?.owner || detail.owner === owner) refresh();
    };
    window.addEventListener(ARTICLE_BOOKMARKS_CHANGED, changed);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      window.removeEventListener(ARTICLE_BOOKMARKS_CHANGED, changed);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [owner, enabled]);
  useEffect(() => {
    if (!owner || !enabled) return;
    const controller = new AbortController();
    void listArticleBookmarks(controller.signal)
      .then((items) => { if (!controller.signal.aborted) setResult({ owner, items, failed: false }); })
      // 404: 배포 사이 계정 API·CMS에 저장한 기사 경로가 아직 없다 — 저장된 기사도 있을 수 없으니 빈 목록으로 보여 준다.
      .catch((error) => { if (!controller.signal.aborted) setResult({ owner, items: [], failed: !(error instanceof ArticleBookmarkError && error.status === 404) }); });
    return () => controller.abort();
  }, [owner, revision, enabled]);
  const mine = result?.owner === owner ? result : null;
  /** 서랍에서 저장 해제. 성공하면 목록에서 바로 빼고, 다른 화면(기사 저장 버튼)에도 알린다. 다른 해제가 진행 중이면 null(아무것도 하지 않음). */
  const remove = async (articleId: string): Promise<boolean | null> => {
    if (!owner) return false;
    if (pendingId) return null;
    setPendingId(articleId);
    try {
      await setArticleBookmark(articleId, false);
      setResult((current) => current?.owner === owner ? { ...current, items: current.items.filter((item) => item.article_id !== articleId) } : current);
      window.dispatchEvent(new CustomEvent(ARTICLE_BOOKMARKS_CHANGED, { detail: { owner } }));
      return true;
    } catch {
      return false;
    } finally {
      setPendingId(null);
    }
  };
  return {
    owner, items: mine?.items ?? [], failed: mine?.failed ?? false, loading: isLoading || !!(owner && !mine),
    pendingId, retry: () => setRevision((value) => value + 1), remove,
  };
}
