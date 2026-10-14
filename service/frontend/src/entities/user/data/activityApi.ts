import { API_URL } from '@/shared/config/apiClient';
import { authFetch } from '@/shared/lib/auth/authFetch';
export type ContentFormat = 'letter' | 'webtoon' | 'podcast' | 'video';
export const ACCOUNT_VIEW_CHANGED = 'lens-account-view-changed';
export interface CompletionRules {completion_enabled:boolean;group_key:string|null;panel_ids:string[];panel_urls:string[];duration_seconds:number|null;media_url:string|null;pending_reason:string|null}
export interface ContentSession {session_id:string;reward_evaluation_enabled:boolean;completion:CompletionRules}
export interface ContentProgress {visible_ms:number;active_ms:number;scroll_ratio:number;viewed_panel_ids:string[];consumed_ranges:[number,number][]}
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
  return json<{viewed:boolean;completed:boolean;reward:{status:string};awards:unknown[]}>('/activity/events','POST',{session_id:sessionId,event_id:eventId,session_seq:seq,event_type:'progress',...progress},signal);
}
export function reportContentView(sessionId: string, eventId: string, visibleMs: number, signal: AbortSignal) {
  return json<{viewed:boolean;completed:false}>('/activity/events','POST',{session_id:sessionId,event_id:eventId,session_seq:1,event_type:'progress',visible_ms:visibleMs},signal);
}
