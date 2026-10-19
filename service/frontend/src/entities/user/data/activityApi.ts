import { API_URL } from '@/shared/config/apiClient';
import { authFetch } from '@/shared/lib/auth/authFetch';
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
