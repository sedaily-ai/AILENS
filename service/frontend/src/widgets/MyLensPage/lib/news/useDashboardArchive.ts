'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/entities/user';
import { ARCHIVE_CHANGED_EVENT, notifyArchiveChanged } from '@/features/archive';
import { deleteArchiveSentence, listArchiveSentences, type ArchiveSentenceResponse } from '@/shared/lib/api/archiveApi';

/** 저장 문장 API가 한 번에 주는 최대 개수. 더 오래된 문장은 '이전 문장 더 보기'로 이어서 받는다. */
export const ARCHIVE_PAGE_SIZE = 200;

type ArchiveResult = { owner: string; sentences: ArchiveSentenceResponse[]; failed: boolean; hasMore: boolean };

const isSentence = (item: ArchiveSentenceResponse) => !!item && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.article_id === 'string' && typeof item.article_title === 'string';
const savedAt = (item: ArchiveSentenceResponse) => Date.parse(item.created_at) || 0;

/**
 * 첫 페이지를 다시 받았을 때(포커스 복귀·저장 변경) 이미 '더 보기'로 불러온 더 오래된 문장은 유지한다.
 * 첫 페이지가 다 차지 않았으면 그 자체가 전체 목록이다.
 */
export function mergeArchiveFirstPage(first: ArchiveSentenceResponse[], previous: ArchiveSentenceResponse[]): ArchiveSentenceResponse[] {
  if (first.length < ARCHIVE_PAGE_SIZE || !previous.length) return first;
  const oldest = savedAt(first[first.length - 1]);
  const ids = new Set(first.map((item) => item.id));
  return [...first, ...previous.filter((item) => !ids.has(item.id) && savedAt(item) < oldest)];
}

/** '더 보기'로 받은 페이지를 붙인다. 경계 시각(<=)이 겹쳐 다시 온 문장은 빼고, 새 문장이 없으면 끝으로 본다. */
export function appendArchivePage(current: ArchiveSentenceResponse[], page: ArchiveSentenceResponse[]) {
  const ids = new Set(current.map((item) => item.id));
  const fresh = page.filter((item) => !ids.has(item.id));
  return { sentences: [...current, ...fresh], hasMore: page.length === ARCHIVE_PAGE_SIZE && fresh.length > 0 };
}

export function useDashboardArchive(enabled = true) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const owner = isAuthenticated ? user?.userId : undefined;
  const [result, setResult] = useState<ArchiveResult | null>(null);
  const [revision, setRevision] = useState(0);
  const [more, setMore] = useState<{ owner: string; loading: boolean; failed: boolean } | null>(null);
  useEffect(() => {
    if (!owner || !enabled) return;
    const refresh = () => setRevision((value) => value + 1);
    const changed = (event: Event) => {
      if ((event as CustomEvent<{ owner: string }>).detail?.owner === owner) refresh();
    };
    window.addEventListener(ARCHIVE_CHANGED_EVENT, changed);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      window.removeEventListener(ARCHIVE_CHANGED_EVENT, changed);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [owner, enabled]);
  useEffect(() => {
    if (!owner || !enabled) return;
    const controller = new AbortController();
    void listArchiveSentences(owner, { limit: ARCHIVE_PAGE_SIZE, signal: controller.signal }).then((data) => {
      if (!Array.isArray(data.sentences)) throw new Error('archive-shape');
      if (controller.signal.aborted) return;
      const first = data.sentences.filter(isSentence);
      setResult((previous) => {
        const kept = previous?.owner === owner && !previous.failed ? previous : null;
        const sentences = mergeArchiveFirstPage(first, kept?.sentences ?? []);
        const hasMore = first.length < ARCHIVE_PAGE_SIZE ? false : sentences.length > first.length ? kept!.hasMore : true;
        return { owner, sentences, failed: false, hasMore };
      });
    }).catch(() => { if (!controller.signal.aborted) setResult({ owner, sentences: [], failed: true, hasMore: false }); });
    return () => controller.abort();
  }, [owner, revision, enabled]);
  const mine = result?.owner === owner ? result : null;
  const moreState = more?.owner === owner ? more : null;
  const loadMore = useCallback(async () => {
    if (!owner || !mine || !mine.hasMore || moreState?.loading) return;
    const oldest = mine.sentences[mine.sentences.length - 1];
    if (!oldest?.created_at) {
      // 저장 시각이 없는 문장에서는 이어 받을 기준이 없다 — 버튼이 눌러도 반응 없이 남지 않게 끝으로 본다.
      setResult((current) => current?.owner === owner ? { ...current, hasMore: false } : current);
      return;
    }
    setMore({ owner, loading: true, failed: false });
    try {
      // created_at(저장 시각) 이전·같은 시각의 다음 묶음을 받는다. 같은 시각으로 다시 오는 문장은 appendArchivePage가 걸러 낸다.
      const data = await listArchiveSentences(owner, { limit: ARCHIVE_PAGE_SIZE, dateTo: oldest.created_at });
      const page = Array.isArray(data.sentences) ? data.sentences.filter(isSentence) : [];
      setResult((current) => current?.owner === owner ? { ...current, ...appendArchivePage(current.sentences, page) } : current);
      setMore({ owner, loading: false, failed: false });
    } catch {
      setMore({ owner, loading: false, failed: true });
    }
  }, [owner, mine, moreState?.loading]);
  const remove = async (id: string) => {
    if (!owner) return false;
    try {
      await deleteArchiveSentence(id, owner);
      setResult((current) => current?.owner === owner ? { ...current, sentences: current.sentences.filter((sentence) => sentence.id !== id) } : current);
      notifyArchiveChanged(owner);
      return true;
    } catch { return false; }
  };
  return {
    owner, sentences: mine?.sentences ?? [], failed: mine?.failed ?? false, loading: isLoading || !!(owner && !mine),
    hasMore: mine?.hasMore ?? false, loadingMore: moreState?.loading ?? false, moreFailed: moreState?.failed ?? false, loadMore,
    retry: () => setRevision((value) => value + 1), remove,
  };
}
