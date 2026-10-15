'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/entities/user';
import { ARCHIVE_CHANGED_EVENT, notifyArchiveChanged } from '@/features/archive';
import { deleteArchiveSentence, listArchiveSentences, type ArchiveSentenceResponse } from '@/shared/lib/api/archiveApi';

export function useDashboardArchive(enabled = true) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const owner = isAuthenticated ? user?.userId : undefined;
  const [result, setResult] = useState<{ owner: string; sentences: ArchiveSentenceResponse[]; failed: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
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
    void listArchiveSentences(owner, { limit: 200, signal: controller.signal }).then((data) => {
      if (!Array.isArray(data.sentences)) throw new Error('archive-shape');
      if (!controller.signal.aborted) setResult({ owner, sentences: data.sentences.filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.article_id === 'string' && typeof item.article_title === 'string'), failed: false });
    }).catch(() => { if (!controller.signal.aborted) setResult({ owner, sentences: [], failed: true }); });
    return () => controller.abort();
  }, [owner, revision, enabled]);
  const mine = result?.owner === owner ? result : null;
  const remove = async (id: string) => {
    if (!owner) return false;
    try {
      await deleteArchiveSentence(id, owner);
      setResult((current) => current?.owner === owner ? { ...current, sentences: current.sentences.filter((sentence) => sentence.id !== id) } : current);
      notifyArchiveChanged(owner);
      return true;
    } catch { return false; }
  };
  return { owner, sentences: mine?.sentences ?? [], failed: mine?.failed ?? false, loading: isLoading || !!(owner && !mine), retry: () => setRevision((value) => value + 1), remove };
}
