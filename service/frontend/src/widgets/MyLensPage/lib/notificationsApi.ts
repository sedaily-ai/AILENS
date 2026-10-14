import { get,type Area } from './dashboardApi';
import { API_URL } from '@/shared/config/apiClient';
import { authFetch } from '@/shared/lib/auth/authFetch';
import type { PushConfig } from '@/entities/user';
import type { NotificationPreferences } from './notificationPreferences';
export interface NotificationState {revision:number;preferences:NotificationPreferences;config:PushConfig;consent:{granted:boolean;current:boolean;policy_version:string;agreed_at:string|null};subscriptions:{id:string;active:boolean;simulated:boolean}[];delivery:{mode:'dry_run'|'live';status:string;active_subscriptions:number;blocked_reasons:string[];last_sent_at:string|null;last_simulated_at:string|null}}
export interface NotificationPreview {mode:'dry_run'|'live';content_count:number;items:{title:string;href:string}[];weekly:{read_days:number;saved_contents:number}|null;empty:boolean;actual_sent:false}
export const getNotifications=(signal:AbortSignal)=>get<NotificationState>('/notifications/preferences',signal);
export const getNotificationPreview=(signal:AbortSignal)=>get<NotificationPreview>('/notifications/preview',signal);
export class NotificationSaveError extends Error{constructor(public status:number,message:string){super(message);}}
export async function mutateNotifications(path:string,payload:unknown,signal:AbortSignal){
 let response:Response;
 try{response=await authFetch(`${API_URL}/api/v2/me${path}`,{method:'PUT',signal,cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}catch(error){if(!signal.aborted&&error instanceof Error&&error.name==='NotSignedInError')window.dispatchEvent(new Event('lens-dashboard-auth-required'));throw error;}
 const data=await response.json();if(!response.ok){if(response.status===401&&!signal.aborted)window.dispatchEvent(new Event('lens-dashboard-auth-required'));throw new NotificationSaveError(response.status,data?.error?.message??'알림 설정을 저장하지 못했어요.');}return data as NotificationState;
}
export type NotificationArea=Area<NotificationState>;
