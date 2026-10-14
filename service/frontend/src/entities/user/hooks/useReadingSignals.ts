'use client';

import { useEffect, useState } from 'react';
import { startContentSession, reportContentProgress, ACCOUNT_VIEW_CHANGED, type ContentSession, type ContentFormat } from '../data/activityApi';
import { bodyScrollRatio, mergeConsumedRanges,playbackRange } from '../lib/activityProgress';
import { useAuth } from '../contexts/AuthContext';
import { parseReadingSignals, readingSignalKey, READING_SIGNAL_EVENT, saveReadingSignal, type ReadingSignal } from '../lib/readingSignals';

export function useReadingSignalScope() {
  const { user, isLoading, isAuthenticated } = useAuth();
  return isLoading ? null : isAuthenticated ? user?.userId ? `account:${user.userId}` : null : 'browser';
}

/** 계정별 서버 완료 판단에 필요한 진행을 보고한다. 숨김·seek·자동재생을 제외한다. */
export function useNewsReadingSignal(article: Omit<ReadingSignal, 'seenAt'> | null, format: ContentFormat = 'letter') {
  const scope = useReadingSignalScope();
  const key = article ? JSON.stringify(article) : '';
  useEffect(() => {
    if (!scope || !key) return;
    const controller = new AbortController();
    const signal = JSON.parse(key) as Omit<ReadingSignal, 'seenAt'>;
    let session: ContentSession | null=null;
    let visibleMs=0,activeMs=0,ratio=0,lastReported=0,seq=0;
    let previousTick=performance.now(),localSaved=false,inFlight=false,finished=false,interacted=false;
    let ranges:[number,number][]=[];
    const seenPanels=new Set<string>();
    const dwell=new Map<string,number>();
    const mediaTimes=new WeakMap<HTMLMediaElement,number>();
    const onInteraction=(event:Event)=>{
      if(!event.isTrusted)return;
      const root=document.querySelector<HTMLElement>(signal.kind==='letter'?'.ld-wrap':'[role="tabpanel"]:not([hidden])');
      if(!(event.target instanceof Node)||!root?.contains(event.target))return;
      interacted=true;root.querySelectorAll<HTMLMediaElement>('audio,video').forEach(media=>mediaTimes.set(media,media.currentTime));
    };
    for(const event of ['pointerdown','keydown'])document.addEventListener(event,onInteraction,true);
    const onVisibility=()=>{previousTick=performance.now();};
    document.addEventListener('visibilitychange',onVisibility);
    if(scope!=='browser')void startContentSession(signal.kind,signal.id,format,controller.signal).then(value=>{
      if(!controller.signal.aborted){session=value;previousTick=performance.now();}
    }).catch(()=>{finished=true;});
    const report=async()=>{
      if(!session||inFlight||finished)return;
      inFlight=true;lastReported=visibleMs;
      const eventId=crypto.randomUUID(),next=seq+1;
      const payload={visible_ms:Math.floor(visibleMs),active_ms:Math.floor(activeMs),scroll_ratio:ratio,viewed_panel_ids:[...seenPanels],consumed_ranges:ranges.map(([a,b])=>[a,b] as [number,number])};
      for(let attempt=0;attempt<2&&!controller.signal.aborted;attempt++){
        try{
          const result=await reportContentProgress(session.session_id,eventId,next,payload,controller.signal);
          if(controller.signal.aborted)break;
          seq=next;finished=result.completed||!session.completion.completion_enabled;
          if(result.viewed||result.completed)window.dispatchEvent(new Event(ACCOUNT_VIEW_CHANGED));
          inFlight=false;return;
        }catch{
          if(attempt===0&&!controller.signal.aborted)await new Promise(resolve=>window.setTimeout(resolve,5000));
        }
      }
      inFlight=false;finished=true; // 확인되지 않은 저장을 성공으로 표시하거나 다음 seq로 넘어가지 않는다.
    };
    const timer=window.setInterval(()=>{
      const now=performance.now(),elapsed=Math.min(350,Math.max(0,now-previousTick));previousTick=now;
      const root=document.querySelector<HTMLElement>(signal.kind==='letter'?'.ld-wrap':'[role="tabpanel"]:not([hidden])');
      const rect=root?.getBoundingClientRect();
      const visible=document.visibilityState==='visible'&&!!rect&&rect.bottom>0&&rect.top<innerHeight;
      if(!visible){root?.querySelectorAll<HTMLMediaElement>('audio,video').forEach(media=>mediaTimes.set(media,media.currentTime));return;}
      if(inFlight){root?.querySelectorAll<HTMLMediaElement>('audio,video').forEach(media=>mediaTimes.set(media,media.currentTime));return;}
      if(finished||scope!=='browser'&&!session)return;
      visibleMs+=elapsed;
      if(format==='letter'){
        const body=signal.kind==='letter'?[...root!.querySelectorAll<HTMLElement>('.ld-sec')]:[...root!.querySelectorAll<HTMLElement>('[data-letter-body]')];
        ratio=Math.max(ratio,bodyScrollRatio(body,innerHeight));
      }else if(format==='webtoon'&&session){
        root!.querySelectorAll<HTMLElement>('figure[data-cut-index]').forEach(element=>{
          const index=Number(element.dataset.cutIndex)-1,id=session!.completion.panel_ids[index];
          const box=element.getBoundingClientRect(),image=element.querySelector('img');
          const exposed=Math.min(box.bottom,innerHeight)-Math.max(box.top,0);
          if(!id||exposed<Math.min(box.height*.5,innerHeight*.5)||!image?.complete||!image.naturalWidth||image.src!==new URL(session!.completion.panel_urls[index],location.href).href)return;
          const time=(dwell.get(id)??0)+elapsed;dwell.set(id,time);if(time>=1000)seenPanels.add(id);
        });
      }else if(session&&session.completion.duration_seconds){
        let playing=false;
        root!.querySelectorAll<HTMLMediaElement>(format==='podcast'?'audio':'video').forEach(media=>{
          const previous=mediaTimes.get(media),current=media.currentTime;mediaTimes.set(media,current);
          if(!session!.completion.media_url||media.currentSrc!==new URL(session!.completion.media_url,location.href).href)return;
          const range=playbackRange(previous,current,elapsed,session!.completion.duration_seconds!,!media.paused||media.ended,interacted,media.seeking);
          if(!range)return;
          const nextRanges=mergeConsumedRanges([...ranges,range]);
          if(nextRanges.length<=100){ranges=nextRanges;playing=true;}
        });
        if(playing)activeMs+=elapsed;
      }
      if(visibleMs>=10000&&!localSaved){localSaved=true;saveReadingSignal(scope,{...signal,seenAt:new Date().toISOString()});if(scope==='browser')finished=true;}
      if(scope!=='browser'&&visibleMs-lastReported>=10000)void report();
    },250);
    return()=>{
      window.clearInterval(timer);controller.abort();document.removeEventListener('visibilitychange',onVisibility);
      for(const event of ['pointerdown','keydown'])document.removeEventListener(event,onInteraction,true);
    };
  },[key,scope,format]);
}

export function useReadingSignals() {
  const scope = useReadingSignalScope();
  const [state, setState] = useState<{ scope: string; records: ReadingSignal[]; available: boolean } | null>(null);
  useEffect(() => {
    if (!scope) return;
    const sync = () => {
      try { setState({ scope, records: parseReadingSignals(localStorage.getItem(readingSignalKey(scope))), available: true }); }
      catch { setState({ scope, records: [], available: false }); }
    };
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    window.addEventListener(READING_SIGNAL_EVENT, sync);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('focus', sync); window.removeEventListener(READING_SIGNAL_EVENT, sync); };
  }, [scope]);
  const mine = state?.scope === scope ? state : null;
  return { records: mine?.records ?? [], ready: !!mine, available: mine?.available ?? true, scope };
}
