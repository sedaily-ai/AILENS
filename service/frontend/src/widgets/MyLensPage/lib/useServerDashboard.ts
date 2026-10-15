'use client';
import { useEffect, useState } from 'react';
import { ACCOUNT_VIEW_CHANGED } from '@/entities/user';
import { ARCHIVE_CHANGED_EVENT } from '@/features/archive';
import { DASHBOARD_AUTH_REQUIRED, DashboardApiError, fetchLensDashboard, type LensDashboard, type DashboardTab } from './dashboardApi';

export function useServerDashboard(owner:string|undefined,minutes:number|undefined,tab?:DashboardTab){
  const [revision,setRevision]=useState(0);
  const [authFailedOwner,setAuthFailedOwner]=useState<string|null>(null);
  useEffect(()=>{if(!owner)return;const fail=()=>setAuthFailedOwner(owner);window.addEventListener(DASHBOARD_AUTH_REQUIRED,fail);return()=>window.removeEventListener(DASHBOARD_AUTH_REQUIRED,fail);},[owner]);
  const [state,setState]=useState<{owner:string;key:string;data:LensDashboard|null;error:string;authRequired:boolean}|null>(null);
  const key=`${tab??'all'}:${minutes}:${revision}`;
  useEffect(()=>{
    if(!owner)return;
    const reload=()=>setRevision(value=>value+1);
    for(const event of [ACCOUNT_VIEW_CHANGED,ARCHIVE_CHANGED_EVENT,'lens-account-bookmarks-changed','lens-account-followed-editors-changed','lens-notifications-changed','focus','pageshow'])window.addEventListener(event,reload);
    return()=>{for(const event of [ACCOUNT_VIEW_CHANGED,ARCHIVE_CHANGED_EVENT,'lens-account-bookmarks-changed','lens-account-followed-editors-changed','lens-notifications-changed','focus','pageshow'])window.removeEventListener(event,reload);};
  },[owner]);
  useEffect(()=>{
    if(!owner)return;
    const controller=new AbortController();
    void fetchLensDashboard(minutes,controller.signal,tab).then(data=>{if(!controller.signal.aborted)setState({owner,key,data,error:'',authRequired:false});}).catch(error=>{
      if(!controller.signal.aborted)setState({owner,key,data:null,error:error instanceof DashboardApiError?error.message:'대시보드를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.',authRequired:error instanceof DashboardApiError&&error.status===401||error instanceof Error&&error.name==='NotSignedInError'});
    });
    return()=>controller.abort();
  },[owner,minutes,key,tab]);
  const mine=state&&state.owner===owner&&state.key===key?state:null;
  return {data:mine?.data,news:mine?.data?.news,loading:!mine,newsLoading:!mine,error:mine?.error??'',authRequired:!!(mine?.authRequired||owner&&authFailedOwner===owner),retry:()=>setRevision(value=>value+1)};
}
