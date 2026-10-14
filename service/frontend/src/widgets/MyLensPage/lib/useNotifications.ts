'use client';
import { useEffect,useRef,useState } from 'react';
import { connectPushDevice,disconnectPushDevice,currentPushDevice,useAuth } from '@/entities/user';
import { getNotifications,getNotificationPreview,mutateNotifications,type NotificationState,type NotificationPreview,NotificationSaveError } from './notificationsApi';
import { notificationPreferencesEqual,type NotificationPreferences } from './notificationPreferences';
export function useNotifications(){
 const {user}=useAuth();const owner=user?.userId;
 const currentOwner=useRef(owner);currentOwner.current=owner;
 const controller=useRef<AbortController|null>(null);
 const busyRef=useRef(false),previewSequence=useRef(0);
 const [state,setState]=useState<{owner:string;data:NotificationState|null;draft:NotificationPreferences|null;error:string;preview:NotificationPreview|null}|null>(null);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[revision,setRevision]=useState(0);
 busyRef.current=busy;
 const mine=state?.owner===owner?state:null;
 useEffect(()=>{
  busyRef.current=false;previewSequence.current++;
  if(!owner)return;const abort=new AbortController();controller.current=abort;
  void getNotifications(abort.signal).then(data=>{if(!abort.signal.aborted){setBusy(false);setState(prev=>({owner,data,draft:prev?.owner===owner&&prev.draft&&!notificationPreferencesEqual(prev.draft,prev.data?.preferences)?prev.draft:data.preferences,error:'',preview:null}));}}).catch(error=>{if(!abort.signal.aborted)setState(prev=>({...((prev?.owner===owner)?prev:{owner,data:null,draft:null,preview:null}),error:error instanceof Error?error.message:'알림 설정을 불러오지 못했어요.'}));});
  return()=>abort.abort();
 },[owner,revision]);
 useEffect(()=>{const refresh=()=>{if(!busyRef.current)setRevision(n=>n+1);};window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('pageshow',refresh);};},[]);
 const perform=async(operation:(data:NotificationState,signal:AbortSignal)=>Promise<unknown>,success:string)=>{
  if(!owner||!mine?.data||busyRef.current||!controller.current)return false;
  const signal=controller.current.signal;busyRef.current=true;previewSequence.current++;setBusy(true);setMessage('');
  try{
   await operation(mine.data,signal);if(signal.aborted||currentOwner.current!==owner)return false;
   const data=await getNotifications(signal);if(signal.aborted||currentOwner.current!==owner)return false;
   setState(previous=>({owner,data,draft:previous?.owner===owner&&previous.draft&&!notificationPreferencesEqual(previous.draft,previous.data?.preferences)?previous.draft:data.preferences,error:'',preview:null}));setMessage(success);window.dispatchEvent(new Event('lens-notifications-changed'));return true;
  }catch(error){if(!signal.aborted&&currentOwner.current===owner){setState(prev=>prev?{...prev,error:error instanceof Error?error.message:'요청을 확인해 주세요.'}:prev);if(error instanceof NotificationSaveError&&error.status===409){setMessage('서버의 최신 설정을 확인했어요. 선택은 유지하니 다시 저장해 주세요.');setRevision(n=>n+1);}}return false;}
  finally{if(currentOwner.current===owner){busyRef.current=false;setBusy(false);}}
 };
 const dirty=!!mine?.draft&&!notificationPreferencesEqual(mine.draft,mine.data?.preferences);
 return {data:mine?.data,draft:mine?.draft,error:mine?.error??'',preview:mine?.preview,loading:!mine,busy,dirty,message,
  retry:()=>setRevision(n=>n+1),setDraft:(draft:NotificationPreferences)=>{previewSequence.current++;setState(prev=>prev?{...prev,draft,error:'',preview:null}:prev);setMessage('');},
  reset:()=>{setState(prev=>prev?.data?{...prev,draft:prev.data.preferences,error:''}:prev);setMessage('');},
  save:()=>perform(data=>mutateNotifications('/notifications/preferences',{revision:data.revision,preferences:mine?.draft},controller.current!.signal),'알림 설정을 계정에 저장했어요. 수신 동의와 기기 연결은 별도예요.'),
  consent:(granted:boolean)=>perform((data,signal)=>mutateNotifications('/notifications/consent',{channel:'web_push',granted,policy_version:data.config.policy_version},signal),granted?'수신 동의를 계정에 저장했어요.':'수신 동의를 철회하고 기기·대기 작업을 해제했어요.'),
  connect:()=>perform((data,signal)=>connectPushDevice(owner!,data.config,signal),'기기를 연결했어요.'),
  disconnect:(id:string)=>perform((data,signal)=>disconnectPushDevice(owner!,id,data.config.mode,signal),'기기 연결을 해제했어요.'),
  currentDevice:owner?currentPushDevice(owner):null,
  loadPreview:async()=>{if(!owner||!controller.current||busyRef.current)return;const signal=controller.current.signal;const sequence=++previewSequence.current;try{const preview=await getNotificationPreview(signal);if(!signal.aborted&&currentOwner.current===owner&&sequence===previewSequence.current)setState(prev=>prev?{...prev,preview,error:''}:prev);}catch(error){if(!signal.aborted&&currentOwner.current===owner&&sequence===previewSequence.current)setState(prev=>prev?{...prev,error:error instanceof Error?error.message:'미리보기를 불러오지 못했어요.'}:prev);}},
 };
}
