'use client';
import { useEffect, useState } from 'react';
import { ACCOUNT_VIEW_CHANGED } from '@/entities/user';
import { ARCHIVE_CHANGED_EVENT } from '@/features/archive';
import { DASHBOARD_AUTH_REQUIRED, DashboardApiError, fetchLensDashboard, type LensDashboard, type DashboardTab } from './dashboardApi';
import { pickDiscoverySentence } from './drawerModel';

/**
 * 나의 LENS 대시보드 집계. enabled=false면 요청하지 않는다(내 서랍은 문장·레터를 자체 API로 불러와 대시보드 결과를 쓰지 않는다).
 * 꺼져 있는 동안에도 변경 신호는 revision을 올려 두므로, 다시 켜지면 그 사이 바뀐 내용을 새로 불러온다.
 */
export function useServerDashboard(owner:string|undefined,tab?:DashboardTab,enabled=true){
  const [revision,setRevision]=useState(0);
  const [authFailedOwner,setAuthFailedOwner]=useState<string|null>(null);
  useEffect(()=>{if(!owner)return;const fail=()=>setAuthFailedOwner(owner);window.addEventListener(DASHBOARD_AUTH_REQUIRED,fail);return()=>window.removeEventListener(DASHBOARD_AUTH_REQUIRED,fail);},[owner]);
  const [state,setState]=useState<{owner:string;key:string;data:LensDashboard|null;error:string;authRequired:boolean}|null>(null);
  const key=`${tab??'all'}:${revision}`;
  useEffect(()=>{
    if(!owner)return;
    const reload=()=>setRevision(value=>value+1);
    const events=[ACCOUNT_VIEW_CHANGED,ARCHIVE_CHANGED_EVENT,'lens-account-bookmarks-changed','lens-account-followed-editors-changed','focus','pageshow'];
    for(const event of events)window.addEventListener(event,reload);
    return()=>{for(const event of events)window.removeEventListener(event,reload);};
  },[owner]);
  useEffect(()=>{
    if(!owner||!enabled)return;
    const controller=new AbortController();
    void fetchLensDashboard(controller.signal,tab).then(data=>{
      if(controller.signal.aborted)return;
      const area=data.recent_sentences;
      if(area.status==='ready'&&area.data){
        // 새 응답을 받았을 때만 선택한다. 계정별 직전 ID만 저장하고 문장 전문은 저장하지 않는다.
        const storageKey=`lens-archive-discovery:v1:${owner}`;
        let previousId:string|null=null;
        try{previousId=window.localStorage.getItem(storageKey);}catch{/* 저장소가 차단돼도 무작위 선택은 가능하다. */}
        const selected=pickDiscoverySentence(area.data.items,previousId);
        data={...data,recent_sentences:{...area,data:{...area.data,items:selected?[selected]:[]}}};
        try{
          if(selected)window.localStorage.setItem(storageKey,selected.id);
          else window.localStorage.removeItem(storageKey);
        }catch{/* 저장소를 사용할 수 없어도 화면은 정상 표시한다. */}
      }
      setState({owner,key,data,error:'',authRequired:false});
    }).catch(error=>{
      if(!controller.signal.aborted)setState({owner,key,data:null,error:error instanceof DashboardApiError?error.message:'대시보드를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.',authRequired:error instanceof DashboardApiError&&error.status===401||error instanceof Error&&error.name==='NotSignedInError'});
    });
    return()=>controller.abort();
  },[owner,key,tab,enabled]);
  const mine=enabled&&state&&state.owner===owner&&state.key===key?state:null;
  const loading=enabled&&!mine;
  return {data:mine?.data,news:mine?.data?.news,loading,newsLoading:loading,error:mine?.error??'',authRequired:!!(mine?.authRequired||owner&&authFailedOwner===owner),retry:()=>setRevision(value=>value+1)};
}
