'use client';
import { useEffect,useState } from 'react';
import { ACCOUNT_VIEW_CHANGED,useAuth } from '@/entities/user';
import { fetchReadingRecords,type Area,type ReadingRecords } from './dashboardApi';
import type { ReadingPeriod } from './readingPeriod';
export function useReadingRecords(period:ReadingPeriod,anchor:string|undefined){
 const {user}=useAuth();const owner=user?.userId;
 const [revision,setRevision]=useState(0);
 const key=`${period}:${anchor??'current'}:${revision}`;
 const [state,setState]=useState<{owner:string;key:string;records:Area<ReadingRecords>|null;error:string}|null>(null);
 useEffect(()=>{
  const refresh=()=>setRevision(n=>n+1);const events=[ACCOUNT_VIEW_CHANGED,'focus','pageshow'];
  events.forEach(e=>window.addEventListener(e,refresh));return()=>events.forEach(e=>window.removeEventListener(e,refresh));
 },[]);
 useEffect(()=>{
  if(!owner)return;const controller=new AbortController();
  void fetchReadingRecords(period,anchor,controller.signal).then(records=>{
   if(!controller.signal.aborted)setState({owner,key,records,error:''});
  }).catch(error=>{if(!controller.signal.aborted)setState({owner,key,records:null,error:error instanceof Error?error.message:'기록을 불러오지 못했어요.'});});
  return()=>controller.abort();
 },[owner,key,period,anchor]);
 const mine=state&&state.owner===owner&&state.key===key?state:null;
 return {records:mine?.records?.data,loading:!mine,error:mine?.error??'',retry:()=>setRevision(n=>n+1)};
}
