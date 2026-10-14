'use client';

import { useEffect, useState } from 'react';
import { API_URL, CMS_API_URL } from '@/shared/config/apiClient';
import { authFetch } from '@/shared/lib/auth/authFetch';
import { parseNewsArticles, type NewsArticle, type NewsEvidence } from './newsModel';

export function usePersonalNews(owner: string | undefined) {
  const [state, setState] = useState<{ owner?: string; articles: NewsArticle[]; history: NewsEvidence[]; available: boolean; historyAvailable: boolean; unmatched: number } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    let active = true;
    void (async () => {
      const [newsResult, historyResult] = await Promise.allSettled([
        fetch(`${CMS_API_URL}/api/v2/posts?channel=lens&limit=100`, { signal: controller.signal, cache: 'no-store' }).then(async (response) => { if (!response.ok) throw new Error('news'); const data: unknown = await response.json(); if (!data || typeof data !== 'object' || !('posts' in data) || !Array.isArray(data.posts)) throw new Error('news-shape'); return parseNewsArticles(data); }),
        owner ? authFetch(`${API_URL}/api/user/history`, { signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error('history'); const data: unknown = await response.json(); if (!data || typeof data !== 'object' || !('history' in data) || !Array.isArray(data.history)) throw new Error('history-shape'); return data.history as unknown[]; }) : Promise.resolve([] as unknown[]),
      ]);
      window.clearTimeout(timeout);
      if (!active) return;
      const articles = newsResult.status === 'fulfilled' ? newsResult.value : [];
      const history: NewsEvidence[] = [];
      let unmatched = 0;
      if (historyResult.status === 'fulfilled') for (const raw of historyResult.value.slice(0, 20)) {
        if (!raw || typeof raw !== 'object' || !('article_id' in raw) || typeof raw.article_id !== 'string') continue;
        const article = articles.find((item) => item.id === raw.article_id);
        if (!article) { unmatched++; continue; }
        history.push({ id: article.id, kind: 'news', title: article.title, categories: article.category ? [article.category] : [], keywords: article.keywords });
      }
      setState({ owner, articles, history, unmatched, available: newsResult.status === 'fulfilled', historyAvailable: historyResult.status === 'fulfilled' });
    })();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [owner, revision]);
  const mine = state?.owner === owner ? state : null;
  return { articles: mine?.articles ?? [], history: mine?.history ?? [], loading: !mine, available: mine?.available ?? true, historyAvailable: mine?.historyAvailable ?? true, unmatched: mine?.unmatched ?? 0, retry: () => setRevision((value) => value + 1) };
}
