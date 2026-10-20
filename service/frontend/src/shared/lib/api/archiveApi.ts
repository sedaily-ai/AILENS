/**
 * Archive API client: "내 서랍" 저장 문장의 저장·목록·삭제. 모두 로그인 계정 기준이다.
 * (저장 문장 관련 글·인기 문장·키워드 추천은 2026-10-19 기능 다이어트로 제거했다.)
 */

import { API_URL } from '@/shared/config/apiClient';
import { authFetch } from '@/shared/lib/auth/authFetch';
import { authReadFetch } from '@/shared/lib/auth/authReadFetch';

export interface ArchiveSentencePayload {
  user_id: string;
  text: string;
  article_id: string;
  article_title: string;
  article_published_at?: string;
}

export interface ArchiveSentenceResponse {
  content_key?: string | null;
  href?: string | null;
  id: string;
  text: string;
  article_id: string;
  article_title: string;
  article_published_at: string;
  created_at: string;
}

/** 문장을 아카이브에 저장하고, 서버가 생성한 ID가 붙은 저장 결과를 돌려준다. */
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

/** 사용자의 아카이브 문장 목록(최신순). */
export async function listArchiveSentences(
  userId: string,
  options?: { dateFrom?: string; dateTo?: string; limit?: number; signal?: AbortSignal },
): Promise<{ sentences: ArchiveSentenceResponse[]; count: number }> {
  const params = new URLSearchParams({ user_id: userId });
  if (options?.dateFrom) params.set('date_from', options.dateFrom);
  if (options?.dateTo) params.set('date_to', options.dateTo);
  if (options?.limit) params.set('limit', String(options.limit));

  // 목록은 사용자별이라 인증이 필요하다(익명 아카이브는 localStorage에 있고 어느 경로를 쓸지는 호출부가 정한다).
  const res = await authReadFetch(`${API_URL}/api/archive?${params}`, options?.signal);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Archive list failed: ${res.status}`);
  }

  return res.json();
}

/** 아카이브 문장을 삭제한다. */
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
