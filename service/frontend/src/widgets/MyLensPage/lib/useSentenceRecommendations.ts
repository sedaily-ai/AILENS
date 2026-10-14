'use client';
import { useEffect, useState } from 'react';
import { ACCOUNT_VIEW_CHANGED, useAuth } from '@/entities/user';
import { ARCHIVE_CHANGED_EVENT } from '@/features/archive';
import { fetchSentenceRecommendations, newsRecommendations, type Recommendations } from './dashboardApi';
export function useSentenceRecommendations(id:string|null,exists:boolean){
 const {user}=useAuth();const owner=user?.userId;
 const [revision,setRevision]=useState(0);const [state,setState]=useState<{owner?:string;id:string;data:Recommendations|null;failed:boolean}|null>(null);
 useEffect(()=>{
  const refresh=()=>setRevision(value=>value+1);
  const events=[ACCOUNT_VIEW_CHANGED,ARCHIVE_CHANGED_EVENT,'focus','pageshow'];
  events.forEach(event=>window.addEventListener(event,refresh));
  return()=>events.forEach(event=>window.removeEventListener(event,refresh));
 },[]);
 useEffect(()=>{if(!owner||!id||!exists)return;const controller=new AbortController();void fetchSentenceRecommendations(id,controller.signal).then(data=>{if(!controller.signal.aborted)setState({owner,id,data,failed:false});}).catch(()=>{if(!controller.signal.aborted)setState({owner,id,data:null,failed:true});});return()=>controller.abort();},[owner,id,exists,revision]);
 const mine=state&&state.owner===owner&&state.id===id?state:null;
 return {items:newsRecommendations(mine?.data),loading:!!(id&&exists&&!mine),available:!mine?.failed,retry:()=>setRevision(value=>value+1)};
}
