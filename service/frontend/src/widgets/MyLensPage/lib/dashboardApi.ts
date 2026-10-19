import { ECON_CATEGORIES } from '@ailens/domain';
import { API_URL } from '@/shared/config/apiClient';
import { authReadFetch } from '@/shared/lib/auth/authReadFetch';
import type { IssueLetter } from '@/features/letter';
import type { ArchiveSentenceResponse } from '@/shared/lib/api/archiveApi';
import type { NewsArticle, NewsRecommendation } from './news/newsModel';

export type Area<T> = {status:'ready'|'error'|'unavailable';data:T|null;error:{message:string}|null};
export interface ServerCard {
  content_key:string;kind:'publication'|'issue_letter';id:string;slug:string;title:string;summary:string;published_at:string;
  category_keys:string[];keywords:string[];formats:string[];href:string;viewed:boolean;saved:boolean;
  editors?:string[];
  reasons:{type:'category'|'sentence'|'editor'|'latest';text:string;origin:string;method:string}[];
}
export interface Recommendations {items:ServerCard[];count:number;algorithm_version:string;fallback:boolean;coverage:{window_days:number;legacy_unmatched:number}}
export interface ServerProfile {
  window_days:number;categories:{key:string;label:string;distinct_contents:number}[];coverage:{legacy_unmatched:number};viewed_news_count:number;viewed_letter_count:number;sentence_total:number;
}
export type DashboardTab = 'home' | 'archive';
export interface LensDashboard {
  schema_version:1;scope:'account';news:Area<Recommendations>;letters:Area<Recommendations>;profile:Area<ServerProfile>;
  recent_sentences:Area<{items:(ArchiveSentenceResponse & {article_no?:string})[];total:number}>;
  saved_letters:Area<{total:number}>;
}
export class DashboardApiError extends Error { constructor(public status:number,message:string){super(message);} }
export const DASHBOARD_AUTH_REQUIRED='lens-dashboard-auth-required';
export async function get<T>(path:string,signal:AbortSignal):Promise<T>{
  try {
    const response=await authReadFetch(`${API_URL}/api/v2/me${path}`,signal);
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new DashboardApiError(response.status,response.status===401?'로그인이 만료됐어요. 다시 로그인해 주세요.':'대시보드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    return data as T;
  } catch(error) {
    if (!signal.aborted && typeof window!=='undefined' && (error instanceof DashboardApiError&&error.status===401 || error instanceof Error&&error.name==='NotSignedInError')) window.dispatchEvent(new Event(DASHBOARD_AUTH_REQUIRED));
    throw error;
  }
}
// minutes=0은 배포 사이 호환용이다. 읽을 시간 기능은 제거됐지만, 예전 계정 API는 이 값이 없으면 계정에 저장된 5·10분으로
// 레터 추천을 자른다(0 = 제한 없음). 새 계정 API는 이 값을 무시한다. 다음 정리 때 제거.
export const fetchLensDashboard=async(signal:AbortSignal,tab?:DashboardTab)=>normalizeDashboard(await get<unknown>(`/dashboard?${new URLSearchParams({...(tab?{tab}:{}),minutes:'0'})}`,signal));

const AREA_FAILED={message:'이 영역을 불러오지 못했어요.'};
const isRecord=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function readArea<T>(value:unknown,valid:(data:Record<string,unknown>)=>boolean):Area<T>{
  if(isRecord(value)){
    if(value.status==='ready'&&isRecord(value.data)&&valid(value.data))return {status:'ready',data:value.data as T,error:null};
    if(value.status==='unavailable')return {status:'unavailable',data:null,error:null};
    if(value.status==='error')return {status:'error',data:null,error:isRecord(value.error)&&typeof value.error.message==='string'?{message:value.error.message}:AREA_FAILED};
  }
  return {status:'error',data:null,error:AREA_FAILED};
}
const hasItems=(data:Record<string,unknown>)=>Array.isArray(data.items);
/**
 * 화면이 읽는 영역만 꺼내 모양을 확인한다. 영역이 빠졌거나 모양이 틀리면 그 영역만 오류로 바꿔,
 * API가 바뀌어도 나의 LENS 화면 전체가 멈추지 않게 한다. 화면이 쓰지 않는 예전 호환 키(format_preference 등)는 읽지 않는다.
 */
export function normalizeDashboard(raw:unknown):LensDashboard{
  const body=isRecord(raw)?raw:{};
  return {
    schema_version:1,scope:'account',
    news:readArea(body.news,hasItems),letters:readArea(body.letters,hasItems),
    profile:readArea(body.profile,data=>Array.isArray(data.categories)&&isRecord(data.coverage)),
    recent_sentences:readArea(body.recent_sentences,hasItems),
    saved_letters:readArea(body.saved_letters,data=>typeof data.total==='number'),
  };
}
export function cardNews(card:ServerCard):NewsArticle {
  return {id:card.slug,title:card.title,context:card.summary,date:new Date(Date.parse(card.published_at)+9*3600000).toISOString().slice(0,10),category:card.category_keys[0]??'',keywords:card.keywords,href:card.href};
}
export function newsRecommendations(data:Recommendations|undefined|null):NewsRecommendation[]{return (data?.items??[]).map(card=>({...cardNews(card),reasons:card.reasons.filter(reason=>reason.type!=='latest'&&reason.type!=='editor').map(reason=>({type:reason.type as 'category'|'sentence',text:reason.text}))}));}
export function cardLetter(card:ServerCard):IssueLetter{
  return {slug:card.slug,title:card.title,deck:card.summary,issueNumber:0,publishedAt:card.published_at,
    categories:card.category_keys.map(key=>ECON_CATEGORIES.find(category=>category.slug===key)?.label??key),topics:card.keywords,editors:card.editors??[],axisLabels:[],summary:[],sections:[],editorNote:'',vote:null,sources:[],reason:card.reasons.map(reason=>reason.text).join(' · ')};
}
