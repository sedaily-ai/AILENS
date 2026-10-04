/**
 * Archive API client — "내 서랍" server-side operations.
 *
 * For logged-in users: calls backend API for persistent storage + similarity search.
 * For anonymous users: falls back to localStorage (handled by caller).
 */

import { API_URL } from '@/shared/config/apiClient';
import { authFetch } from '@/shared/lib/auth/authFetch';

export interface ArchiveSentencePayload {
  user_id: string;
  text: string;
  article_id: string;
  article_title: string;
  article_published_at?: string;
}

export interface ArchiveSentenceResponse {
  id: string;
  text: string;
  article_id: string;
  article_title: string;
  article_published_at: string;
  created_at: string;
}

/**
 * Save a sentence to the archive.
 * Returns the saved sentence with server-generated ID.
 */
export async function saveArchiveSentence(
  payload: ArchiveSentencePayload,
): Promise<{ sentence: ArchiveSentenceResponse; vector_status: string }> {
  const res = await authFetch(`${API_URL}/api/archive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Archive save failed: ${res.status}`);
  }

  return res.json();
}

/**
 * List archived sentences for a user.
 * Returns newest first.
 */
export async function listArchiveSentences(
  userId: string,
  options?: { dateFrom?: string; dateTo?: string; limit?: number },
): Promise<{ sentences: ArchiveSentenceResponse[]; count: number }> {
  const params = new URLSearchParams({ user_id: userId });
  if (options?.dateFrom) params.set('date_from', options.dateFrom);
  if (options?.dateTo) params.set('date_to', options.dateTo);
  if (options?.limit) params.set('limit', String(options.limit));

  // Listing is per-user, so it requires auth (anonymous archive lives in
  // localStorage; the caller decides which path to take).
  const res = await authFetch(`${API_URL}/api/archive?${params}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Archive list failed: ${res.status}`);
  }

  return res.json();
}

export interface PopularHighlight {
  text: string;
  article_id: string;
  article_title: string;
  count: number;
}

/**
 * "다른 사람들이 담은 문장" — 전체 유저 아카이브를 텍스트 빈도로 집계한
 * 공개 목록(글쓰기 없이 저장 행위만으로 채워짐, Kindle Popular Highlights
 * 패턴). 로그인 여부와 무관 — 커뮤니티 탭 대체(2026-08-06).
 */
export async function fetchPopularArchiveSentences(
  limit: number = 20,
): Promise<PopularHighlight[]> {
  try {
    const res = await fetch(`${API_URL}/api/archive/popular?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.highlights ?? [];
  } catch {
    return [];
  }
}

/**
 * Delete an archived sentence.
 */
export async function deleteArchiveSentence(
  archiveId: string,
  userId: string,
): Promise<void> {
  const res = await authFetch(
    `${API_URL}/api/archive/${encodeURIComponent(archiveId)}?user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Archive delete failed: ${res.status}`);
  }
}

// ── 키워드 기반 기사 추천 (raw XML 버킷에서 검색) ──────────────────────
// 백엔드 GET /s3-articles/keyword?keywords=...&days=N&limit=N
// 사용자 저장 문장에서 추출한 키워드 → 최근 N일 XML 의 title+content 매칭.

export interface KeywordArticle {
  news_id: string;
  title: string;
  sub_title?: string;
  published_at: string;
  category: string;
  provider?: string;
  byline?: string;
  image_url?: string | null;
  original_link?: string;
  matches: number;
}

export interface KeywordSearchResponse {
  keywords: string[];
  days_searched: number;
  total: number;
  articles: KeywordArticle[];
}

export async function searchArticlesByKeywords(
  keywords: string[],
  options?: { days?: number; limit?: number },
): Promise<KeywordSearchResponse> {
  const params = new URLSearchParams();
  params.set('keywords', keywords.join(','));
  params.set('days', String(options?.days ?? 7));
  params.set('limit', String(options?.limit ?? 20));

  // 인증 불필요 — 공개 read 엔드포인트
  const res = await fetch(`${API_URL}/s3-articles/keyword?${params}`);
  if (!res.ok) {
    throw new Error(`Keyword article search failed: ${res.status}`);
  }
  return res.json();
}

