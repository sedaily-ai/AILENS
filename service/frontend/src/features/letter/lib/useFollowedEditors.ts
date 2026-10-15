'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/entities/user';
import { EDITORS } from '../data/editors';
import { getAccountFollows, isAccountAuthError, setAccountFollow, type AccountFollow } from '../data/accountApi';
const CHANGED='lens-account-followed-editors-changed';
export function useFollowedEditors(enabled=true){
  const {user,isLoading}=useAuth(),owner=user?.userId??null;
  const current=useRef(owner);current.current=owner;
  const controller=useRef<AbortController|null>(null),inFlight=useRef(false);
  const [state,setState]=useState<{owner:string|null;items:AccountFollow[];ready:boolean;available:boolean;error:string;authRequired:boolean}>({owner,items:[],ready:false,available:false,error:'',authRequired:false});
  const [revision,setRevision]=useState(0),[pending,setPending]=useState(false);
  useEffect(()=>{
    if(isLoading||!enabled)return;
    const abort=new AbortController();controller.current=abort;
    let sequence=0;
    const load=async()=>{const seq=++sequence;try{const data=owner?await getAccountFollows(abort.signal):{items:[]};if(!abort.signal.aborted&&seq===sequence)setState({owner,items:data.items,ready:true,available:!!owner,error:'',authRequired:false});}catch(error){if(!abort.signal.aborted&&seq===sequence)setState(previous=>({...previous,owner,items:previous.owner===owner?previous.items:[],ready:true,available:false,error:error instanceof Error?error.message:'팔로우를 불러오지 못했어요.',authRequired:isAccountAuthError(error)}));}};
    void load();const changed=()=>void load();const storage=(event:StorageEvent)=>{if(event.key==='lens-account-follows-revision'||event.key===null)changed();};
    for(const event of [CHANGED,'focus','pageshow'])window.addEventListener(event,changed);window.addEventListener('storage',storage);
    return()=>{abort.abort();for(const event of [CHANGED,'focus','pageshow'])window.removeEventListener(event,changed);window.removeEventListener('storage',storage);};
  },[owner,isLoading,revision,enabled]);
  const valid=state.owner===owner,items=valid?state.items:[],ids=items.map(item=>item.id);
  const toggle=async(id:string)=>{
    if(!enabled||!owner||isLoading||!valid||!state.available||inFlight.current)return false;
    inFlight.current=true;setPending(true);
    try{await setAccountFollow(id,!ids.includes(id),controller.current?.signal);if(current.current!==owner)return false;window.dispatchEvent(new Event(CHANGED));try{localStorage.setItem('lens-account-follows-revision',`${owner}:${Date.now()}`);}catch{/* 포커스 복귀에서 재조회 */}return true;}catch(error){if(current.current===owner)setState(previous=>({...previous,error:error instanceof Error?error.message:'팔로우를 저장하지 못했어요.',authRequired:isAccountAuthError(error)}));return false;}finally{inFlight.current=false;setPending(false);}
  };
  return{ready:enabled&&!isLoading&&valid&&state.ready,available:valid&&state.available,authRequired:valid&&state.authRequired,error:valid?state.error:'',pending,items,ids,followed:EDITORS.filter(e=>ids.includes(e.id)&&items.some(item=>item.id===e.id&&item.active)),isFollowing:(id:string)=>ids.includes(id),toggle,retry:()=>setRevision(n=>n+1)};
}
