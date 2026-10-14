'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/entities/user';
import { ARCHIVE_CHANGED_EVENT, notifyArchiveChanged } from '@/features/archive';
import { deleteArchiveSentence, listArchiveSentences, type ArchiveSentenceResponse } from '@/shared/lib/api/archiveApi';

export function useDashboardArchive() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const owner = isAuthenticated ? user?.userId : undefined;
  const [result, setResult] = useState<{ owner: string; sentences: ArchiveSentenceResponse[]; failed: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!owner) return;
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
  }, [owner]);
  useEffect(() => {
    if (!owner) return;
    let active = true;
    void listArchiveSentences(owner, { limit: 200 }).then((data) => {
      if (!Array.isArray(data.sentences)) throw new Error('archive-shape');
      if (active) setResult({ owner, sentences: data.sentences.filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.article_id === 'string' && typeof item.article_title === 'string'), failed: false });
    }).catch(() => { if (active) setResult({ owner, sentences: [], failed: true }); });
    return () => { active = false; };
  }, [owner, revision]);
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
