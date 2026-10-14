'use client';
import { useEffect, useState } from 'react';
import { ACCOUNT_VIEW_CHANGED } from '@/entities/user';
import { ARCHIVE_CHANGED_EVENT } from '@/features/archive';
import { DASHBOARD_AUTH_REQUIRED, DashboardApiError, fetchLensDashboard, fetchRecommendations, type LensDashboard, type Recommendations } from './dashboardApi';
import type { NewsFilter } from './news/newsModel';

export function useServerDashboard(owner:string|undefined,minutes:number,settingsKey:string,filter:NewsFilter){
  const [revision,setRevision]=useState(0);
  const [authFailedOwner,setAuthFailedOwner]=useState<string|null>(null);
  useEffect(()=>{if(!owner)return;const fail=()=>setAuthFailedOwner(owner);window.addEventListener(DASHBOARD_AUTH_REQUIRED,fail);return()=>window.removeEventListener(DASHBOARD_AUTH_REQUIRED,fail);},[owner]);
  const [state,setState]=useState<{owner:string;key:string;data:LensDashboard|null;error:string;authRequired:boolean}|null>(null);
  const [filtered,setFiltered]=useState<{owner:string;key:string;data:Recommendations|null;error:boolean;authRequired:boolean}|null>(null);
  const key=`${minutes}:${settingsKey}:${revision}`;
  const filterKey=`${key}:${filter}`;
  useEffect(()=>{
    const reload=()=>setRevision(value=>value+1);
    for(const event of [ACCOUNT_VIEW_CHANGED,ARCHIVE_CHANGED_EVENT,'lens-account-bookmarks-changed','lens-account-followed-editors-changed','lens-notifications-changed','focus','pageshow'])window.addEventListener(event,reload);
    return()=>{for(const event of [ACCOUNT_VIEW_CHANGED,ARCHIVE_CHANGED_EVENT,'lens-account-bookmarks-changed','lens-account-followed-editors-changed','lens-notifications-changed','focus','pageshow'])window.removeEventListener(event,reload);};
  },[]);
  useEffect(()=>{
    if(!owner)return;
    const controller=new AbortController();
    void fetchLensDashboard(minutes,controller.signal).then(data=>{if(!controller.signal.aborted)setState({owner,key,data,error:'',authRequired:false});}).catch(error=>{
      if(!controller.signal.aborted)setState({owner,key,data:null,error:error instanceof Error?error.message:'대시보드 연결을 확인해 주세요.',authRequired:error instanceof DashboardApiError&&error.status===401||error instanceof Error&&error.name==='NotSignedInError'});
    });
    return()=>controller.abort();
  },[owner,minutes,key]);
  useEffect(()=>{
    if(!owner||filter==='all')return;
    const controller=new AbortController();
    void fetchRecommendations(filter,controller.signal).then(data=>{if(!controller.signal.aborted)setFiltered({owner,key:filterKey,data,error:false,authRequired:false});}).catch(error=>{if(!controller.signal.aborted)setFiltered({owner,key:filterKey,data:null,error:true,authRequired:error instanceof DashboardApiError&&error.status===401||error instanceof Error&&error.name==='NotSignedInError'});});
    return()=>controller.abort();
  },[owner,filter,filterKey]);
  const mine=state&&state.owner===owner&&state.key===key?state:null;
  const selected=filtered&&filtered.owner===owner&&filtered.key===filterKey?filtered:null;
  const news=filter==='all'?mine?.data?.news: selected?{status:selected.error?'error' as const:'ready' as const,data:selected.data,error:null}:undefined;
  return {data:mine?.data,news,loading:!mine,newsLoading:!mine||filter!=='all'&&!selected,error:mine?.error??'',authRequired:!!(mine?.authRequired||selected?.authRequired||owner&&authFailedOwner===owner),retry:()=>setRevision(value=>value+1)};
}
