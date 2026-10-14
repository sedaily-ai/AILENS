import { API_URL } from '@/shared/config/apiClient';
import { authFetch } from '@/shared/lib/auth/authFetch';
import type { InterestItem } from './interestApi';

export interface LensPreferences { interests: InterestItem[]; minutes: number; revision: number; updated_at: string | null }
export interface AccountBookmark {
  letter_id: string; saved_at: string; version: number;
  content: { content_key: string; kind: 'issue_letter'; available: boolean; completed?: boolean; slug?: string; title?: string; summary?: string; read_minutes?: number; published_at?: string; href?: string; categories?: string[] };
}
export class AccountApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
async function accountJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    const response = await authFetch(`${API_URL}/api/v2/me${path}`, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...options.headers } });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new AccountApiError(response.status, data?.error?.code ?? 'REQUEST_FAILED', data?.error?.message ?? '계정 저장 서버를 사용할 수 없어요. 다시 시도해 주세요.');
    return data as T;
  } catch(error) {
    if (!options.signal?.aborted && typeof window!=='undefined' && isAccountAuthError(error)) window.dispatchEvent(new Event('lens-dashboard-auth-required'));
    throw error;
  }
}

export const getLensPreferences = (signal?: AbortSignal) => accountJson<LensPreferences>('/preferences', { signal });
export const putLensPreferences = (data: LensPreferences, signal?: AbortSignal) => accountJson<LensPreferences>('/preferences', { method: 'PUT', signal, body: JSON.stringify({ interests: data.interests, minutes: data.minutes, revision: data.revision }) });
export async function getAccountBookmarks(signal?: AbortSignal, read: 'all'|'unread'|'completed' = 'all'): Promise<AccountBookmark[]> {
  const all: AccountBookmark[] = [];
  let cursor: string | null = null;
  do {
    const page: { items: AccountBookmark[]; next_cursor: string | null } = await accountJson(`/letter-bookmarks?limit=200&read=${read}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal });
    all.push(...page.items); cursor = page.next_cursor;
  } while (cursor);
  return all;
}
export async function setAccountBookmark(slug: string, saved: boolean, letterId?: string, signal?: AbortSignal) {
  const id = letterId ?? (await accountJson<{ id: string }>(`/content/resolve?kind=issue_letter&key_type=slug&key=${encodeURIComponent(slug)}`, { signal })).id;
  return accountJson<{ letter_id: string; saved: boolean; saved_at: string | null; version: number }>(`/letter-bookmarks/${encodeURIComponent(id)}`, { method: saved ? 'PUT' : 'DELETE', signal });
}

export function isAccountAuthError(error: unknown) { return error instanceof AccountApiError && error.status === 401 || error instanceof Error && error.name === 'NotSignedInError'; }

export interface AccountFollow { id:string; name:string; href:string; active:boolean; followed_at:string }
export const getAccountFollows=(signal?:AbortSignal)=>accountJson<{items:AccountFollow[];total:number}>('/followed-editors',{signal});
export const setAccountFollow=(id:string,following:boolean,signal?:AbortSignal)=>accountJson(`/followed-editors/${encodeURIComponent(id)}`,{method:following?'PUT':'DELETE',signal});
export interface BookmarkImportResult {import_id:string;replayed:boolean;accepted:{slug:string;content_key:string}[];rejected:{slug:string;code:string}[]}
export const importBrowserBookmarks=(slugs:string[],importId:string,signal?:AbortSignal)=>accountJson<BookmarkImportResult>('/imports/bookmarks',{method:'POST',signal,body:JSON.stringify({source:'browser-bookmarks-v1',import_id:importId,slugs})});
