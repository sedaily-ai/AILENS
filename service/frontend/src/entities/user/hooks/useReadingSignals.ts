'use client';

import { useEffect } from 'react';
import { startContentSession, reportContentProgress, ACCOUNT_VIEW_CHANGED, type ContentSession, type ContentFormat } from '../data/activityApi';
import { useAuth } from '../contexts/AuthContext';
import { saveReadingSignal, type ReadingSignal } from '../lib/readingSignals';

export function useReadingSignalScope() {
  const { user, isLoading, isAuthenticated } = useAuth();
  return isLoading ? null : isAuthenticated ? user?.userId ? `account:${user.userId}` : null : 'browser';
}

/** 화면에 보인 시간만 잰다(숨김 탭·화면 밖 시간 제외). 10초 이상 열람이 추천 근거이며, 계정은 서버가 열람으로 인정하면 보고를 멈춘다. */
export function useNewsReadingSignal(article: Omit<ReadingSignal, 'seenAt'> | null, format: ContentFormat = 'letter') {
  const scope = useReadingSignalScope();
  const key = article ? JSON.stringify(article) : '';
  useEffect(() => {
    if (!scope || !key) return;
    const controller = new AbortController();
    const signal = JSON.parse(key) as Omit<ReadingSignal, 'seenAt'>;
    let session: ContentSession | null=null;
    let visibleMs=0,lastReported=0,seq=0;
    let previousTick=performance.now(),localSaved=false,inFlight=false,finished=false;
    const onVisibility=()=>{previousTick=performance.now();};
    document.addEventListener('visibilitychange',onVisibility);
    if(scope!=='browser')void startContentSession(signal.kind,signal.id,format,controller.signal).then(value=>{
      if(!controller.signal.aborted){session=value;previousTick=performance.now();}
    }).catch(()=>{finished=true;});
    const report=async()=>{
      if(!session||inFlight||finished)return;
      inFlight=true;lastReported=visibleMs;
      const eventId=crypto.randomUUID(),next=seq+1;
      for(let attempt=0;attempt<2&&!controller.signal.aborted;attempt++){
        try{
          const result=await reportContentProgress(session.session_id,eventId,next,{visible_ms:Math.floor(visibleMs)},controller.signal);
          if(controller.signal.aborted)break;
          seq=next;
          if(result.viewed){finished=true;window.dispatchEvent(new Event(ACCOUNT_VIEW_CHANGED));}
          inFlight=false;return;
        }catch{
          if(attempt===0&&!controller.signal.aborted)await new Promise(resolve=>window.setTimeout(resolve,5000));
        }
      }
      inFlight=false;finished=true; // 확인되지 않은 저장을 성공으로 표시하거나 다음 seq로 넘어가지 않는다.
    };
    const timer=window.setInterval(()=>{
      const now=performance.now(),elapsed=Math.min(350,Math.max(0,now-previousTick));previousTick=now;
      // 보고 중인 시간은 세지 않는다(서버의 경과 시간 검사와 맞춘다).
      if(inFlight||finished||scope!=='browser'&&!session)return;
      const root=document.querySelector<HTMLElement>(signal.kind==='letter'?'.ld-wrap':'[role="tabpanel"]:not([hidden])');
      const rect=root?.getBoundingClientRect();
      if(document.visibilityState!=='visible'||!rect||rect.bottom<=0||rect.top>=innerHeight)return;
      visibleMs+=elapsed;
      if(visibleMs>=10000&&!localSaved){localSaved=true;saveReadingSignal(scope,{...signal,seenAt:new Date().toISOString()});if(scope==='browser')finished=true;}
      if(scope!=='browser'&&visibleMs-lastReported>=10000)void report();
    },250);
    return()=>{window.clearInterval(timer);controller.abort();document.removeEventListener('visibilitychange',onVisibility);};
  },[key,scope,format]);
}
