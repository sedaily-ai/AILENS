import type { NotificationState } from './notificationsApi';
import { ECON_CATEGORIES } from '@ailens/domain';
import { API_URL } from '@/shared/config/apiClient';
import { authFetch } from '@/shared/lib/auth/authFetch';
import type { IssueLetter } from '@/features/letter';
import type { ArchiveSentenceResponse } from '@/shared/lib/api/archiveApi';
import type { NewsArticle, NewsFilter, NewsRecommendation } from './news/newsModel';

export type Area<T> = {status:'ready'|'error'|'unavailable';data:T|null;error:{message:string}|null};
export interface ServerCard {
  content_key:string;kind:'publication'|'issue_letter';id:string;slug:string;title:string;summary:string;published_at:string;
  category_keys:string[];keywords:string[];formats:string[];read_minutes:number|null;href:string;viewed:boolean;saved:boolean;completed?:boolean;
  preferred_format?:'letter'|'webtoon'|'podcast'|'video'|null;editors?:string[];
  reasons:{type:'category'|'keyword'|'sentence'|'editor'|'latest';text:string;origin:string;method:string}[];
}
export interface Recommendations {items:ServerCard[];count:number;algorithm_version:string;fallback:boolean;total_minutes:number;coverage:{window_days:number;legacy_unmatched:number}}
export interface ServerProfile {
  window_days:number;categories:{key:string;label:string;distinct_contents:number}[];keywords:{key:string;label:string;distinct_contents:number}[];
  sentence_terms:string[];coverage:{legacy_unmatched:number};viewed_news_count:number;viewed_letter_count:number;sentence_total:number;
}
export type DashboardTab = 'home' | 'archive' | 'records' | 'settings';
export interface LensDashboard {
  schema_version:1;scope:'account';format_preference:Area<FormatPreferenceData>;news:Area<Recommendations>;letters:Area<Recommendations>;profile:Area<ServerProfile>;
  recent_sentences:Area<{items:(ArchiveSentenceResponse & {article_no?:string})[];total:number}>;
  saved_letters:Area<{total:number}>;weekly_rewards:Area<RewardWeek>;notifications:Area<NotificationState>;
}
export class DashboardApiError extends Error { constructor(public status:number,message:string){super(message);} }
export const DASHBOARD_AUTH_REQUIRED='lens-dashboard-auth-required';
export async function get<T>(path:string,signal:AbortSignal):Promise<T>{
  try {
    const response=await authFetch(`${API_URL}/api/v2/me${path}`,{signal,cache:'no-store'});
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new DashboardApiError(response.status,data?.error?.message??'대시보드를 불러오지 못했어요. 다시 시도해 주세요.');
    return data as T;
  } catch(error) {
    if (!signal.aborted && typeof window!=='undefined' && (error instanceof DashboardApiError&&error.status===401 || error instanceof Error&&error.name==='NotSignedInError')) window.dispatchEvent(new Event(DASHBOARD_AUTH_REQUIRED));
    throw error;
  }
}
export const fetchLensDashboard=(minutes:number,signal:AbortSignal,tab?:DashboardTab)=>get<LensDashboard>(`/dashboard?minutes=${minutes}${tab ? `&tab=${tab}` : ''}`,signal);
export const fetchRecommendations=(filter:NewsFilter,signal:AbortSignal)=>get<Recommendations>(`/recommendations?kind=news&reason=${filter}&limit=4`,signal);
export const fetchSentenceRecommendations=(id:string,signal:AbortSignal)=>get<Recommendations>(`/sentences/${encodeURIComponent(id)}/recommendations?limit=3`,signal);
export interface RewardWeek {week_start:string;week_end:string;today:string;coverage_start:string;goal_days:number;stamp_days:number;stamps:{date:string;awarded_at:string}[];badges:{id:string;title:string;earned:boolean;earned_at:string|null;progress:{current:number;target:number}}[]}
export interface ReadingRecords {period:'week'|'month'|'year';start:string;end:string;today:string;coverage_start:string;completed_contents:number;read_days:number;stamp_days:number;pending_rewards:number;categories:{key:string;count:number}[];days:{date:string;completed_contents:number;stamped:boolean;future:boolean;covered:boolean}[];months:{month:number;read_days:number;completed_contents:number;stamp_days:number;covered:boolean;future:boolean}[]}
export const fetchReadingRecords=(period:ReadingRecords['period'],anchor:string|undefined,signal:AbortSignal)=>get<Area<ReadingRecords>>(`/activity?period=${period}${anchor?`&anchor=${anchor}`:''}`,signal);
export const fetchRewards=(week:string|undefined,signal:AbortSignal)=>get<Area<RewardWeek>>(`/rewards${week?`?week=${week}`:''}`,signal);
export function cardNews(card:ServerCard):NewsArticle {
  return {id:card.slug,title:card.title,context:card.summary,date:new Date(Date.parse(card.published_at)+9*3600000).toISOString().slice(0,10),category:card.category_keys[0]??'',keywords:card.keywords,href:card.href,preferredFormat:card.preferred_format??null};
}
export function newsRecommendations(data:Recommendations|undefined|null):NewsRecommendation[]{return (data?.items??[]).map(card=>({...cardNews(card),score:0,reasons:card.reasons.filter(reason=>reason.type!=='latest'&&reason.type!=='editor').map(reason=>({type:reason.type as 'category'|'keyword'|'sentence',text:reason.text}))}));}
export function cardLetter(card:ServerCard):IssueLetter{
  return {slug:card.slug,title:card.title,deck:card.summary,issueNumber:0,publishedAt:card.published_at,readMinutes:card.read_minutes??0,
    categories:card.category_keys.map(key=>ECON_CATEGORIES.find(category=>category.slug===key)?.label??key),topics:card.keywords,editors:card.editors??[],axisLabels:[],summary:[],sections:[],editorNote:'',vote:null,sources:[],reason:card.reasons.map(reason=>reason.text).join(' · ')};
}

export interface FormatPreferenceData {status:'ready'|'insufficient_data';algorithm_version:string;window_days:number;minimum_contents:number;qualified_contents:number;preferred_format:'letter'|'webtoon'|'podcast'|'video'|null;distribution:{format:'letter'|'webtoon'|'podcast'|'video';viewed_contents:number;completed_contents:number;score:number;share:number;rank:number|null}[]}
