import { API_URL } from '@/shared/config/apiClient';
import { authFetch } from '@/shared/lib/auth/authFetch';
import { authReadFetch } from '@/shared/lib/auth/authReadFetch';

// 저장한 기사(2026-10-20) — 기사 화면 '저장'과 나의 LENS 내 서랍 '저장한 기사'가 쓰는 계정 API.
// 레터 북마크(features/letter/data/accountApi.ts)와 같은 모양이다: 기사 slug → 계정 API가 공개 기사 ID로 확인 → 저장·해제.
// 예전 플레이어별 로컬 북마크(ailens-*-bookmarks)는 읽지도 옮기지도 않는다.

export const ARTICLE_BOOKMARKS_CHANGED = 'lens-account-article-bookmarks-changed';

export interface ArticleBookmark {
  article_id: string;
  saved_at: string;
  content: {
    content_key: string; kind: 'publication'; available: boolean;
    slug?: string; title?: string; summary?: string; published_at?: string; href?: string; categories?: string[]; formats?: string[];
  };
}

export class ArticleBookmarkError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function accountJson<T>(path: string, method: 'GET' | 'PUT' | 'DELETE', signal?: AbortSignal): Promise<T> {
  const url = `${API_URL}/api/v2/me${path}`;
  const response = method === 'GET'
    ? await authReadFetch(url, signal)
    : await authFetch(url, { method, signal, cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ArticleBookmarkError(response.status, data?.error?.message ?? '계정 저장 서버를 사용할 수 없어요. 다시 시도해 주세요.');
  return data as T;
}

export const isArticleBookmarkAuthError = (error: unknown) =>
  error instanceof ArticleBookmarkError && error.status === 401 || error instanceof Error && error.name === 'NotSignedInError';

/** 기사 slug(lens.id)를 계정 저장에 쓰는 공개 기사 ID로 바꾼다. 비공개·없는 기사는 404다. */
export async function resolveArticleId(slug: string, signal?: AbortSignal): Promise<string> {
  const data = await accountJson<{ id: string }>(`/content/resolve?kind=publication&key_type=slug&key=${encodeURIComponent(slug)}`, 'GET', signal);
  if (typeof data?.id !== 'string' || !/^\d+$/.test(data.id)) throw new ArticleBookmarkError(500, '기사 정보를 확인하지 못했어요.');
  return data.id;
}

export async function getArticleBookmarkState(articleId: string, signal?: AbortSignal): Promise<boolean> {
  const data = await accountJson<{ saved: boolean }>(`/article-bookmarks/${encodeURIComponent(articleId)}`, 'GET', signal);
  return data?.saved === true;
}

export async function setArticleBookmark(articleId: string, saved: boolean, signal?: AbortSignal): Promise<boolean> {
  const data = await accountJson<{ saved: boolean }>(`/article-bookmarks/${encodeURIComponent(articleId)}`, saved ? 'PUT' : 'DELETE', signal);
  return data?.saved === true;
}

/** 저장한 기사 전체(최신 저장순). 페이지를 끝까지 이어 받되, 서버가 같은 커서를 되돌려도 멈추도록 쪽수 상한을 둔다. */
export async function listArticleBookmarks(signal?: AbortSignal, maxPages = 25): Promise<ArticleBookmark[]> {
  const all: ArticleBookmark[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const data: { items?: unknown; next_cursor?: unknown } = await accountJson(`/article-bookmarks?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, 'GET', signal);
    if (!Array.isArray(data?.items)) throw new ArticleBookmarkError(500, '저장한 기사 목록을 확인하지 못했어요.');
    all.push(...(data.items as ArticleBookmark[]).filter((item) => item && typeof item.article_id === 'string' && item.content && typeof item.content.available === 'boolean'));
    const next = typeof data.next_cursor === 'string' && data.next_cursor ? data.next_cursor : null;
    if (!next || next === cursor) break;
    cursor = next;
  }
  return all;
}
