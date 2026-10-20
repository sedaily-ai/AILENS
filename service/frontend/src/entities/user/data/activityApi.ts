import { API_URL } from '@/shared/config/apiClient';
import { authFetch } from '@/shared/lib/auth/authFetch';
import { clearReadingSignals } from '../lib/readingSignals';
export type ContentFormat = 'letter' | 'webtoon' | 'podcast' | 'video';
export const ACCOUNT_VIEW_CHANGED = 'lens-account-view-changed';
export interface ContentSession {session_id:string}
/** 화면에 보인 누적 시간만 보낸다. 완료 판정용 값(active_ms·scroll_ratio·viewed_panel_ids·consumed_ranges)은 이전 서버에서도 선택 항목이다. */
export interface ContentProgress {visible_ms:number}
async function json<T>(path: string, method: string, body: unknown, signal: AbortSignal): Promise<T> {
  const response = await authFetch(`${API_URL}/api/v2/me${path}`, { method, signal, cache:'no-store', headers:{'Content-Type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {}) });
  if (!response.ok) throw new Error(`activity-http-${response.status}`);
  return response.json() as Promise<T>;
}
export async function startContentSession(kind: 'news' | 'letter', slug: string, format: ContentFormat, signal: AbortSignal) {
  const content = await json<{content_key:string}>(`/content/resolve?kind=${kind==='news'?'publication':'issue_letter'}&key_type=slug&key=${encodeURIComponent(slug)}`, 'GET', null, signal);
  return json<ContentSession>('/activity/sessions','POST',{content_key:content.content_key,format},signal);
}
export function reportContentProgress(sessionId:string,eventId:string,seq:number,progress:ContentProgress,signal:AbortSignal){
  return json<{viewed:boolean}>('/activity/events','POST',{session_id:sessionId,event_id:eventId,session_seq:seq,event_type:'progress',...progress},signal);
}

export class ReadingHistoryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function clearAccountReadingHistory(owner: string, signal: AbortSignal): Promise<void> {
  const response = await authFetch(`${API_URL}/api/v2/me/activity/history`, {
    method: 'DELETE', signal, cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: true }),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ReadingHistoryError(response.status, response.status === 401
    ? '로그인이 만료됐어요. 다시 로그인해 주세요.'
    : '열람 기록을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
  if (!result || typeof result !== 'object' || !('deleted' in result) || result.deleted !== true) {
    throw new ReadingHistoryError(503, '삭제 결과를 확인하지 못했어요. 다시 시도해 주세요.');
  }
  signal.throwIfAborted();
  clearReadingSignals(`account:${owner}`);
  window.dispatchEvent(new Event(ACCOUNT_VIEW_CHANGED));
}
