'use client';
import { useEffect, useRef, useState } from 'react';
import { importBrowserBookmarks, type BookmarkImportResult, type IssueLetter } from '@/features/letter';
// 일회성 이전 도구: 계정 저장(2026-10-14) 전에 이 브라우저에만 저장한 레터를 계정으로 옮긴다.
// 2026-10-20 기능 다이어트에서 기한을 정했다 — 2026-12-31 이후 이 컴포넌트와 서버 가져오기 경로(`/api/v2/me/imports/bookmarks`)를 함께 지운다.
export function BrowserBookmarksImport({owner,letters,onImported}:{owner:string;letters:IssueLetter[];onImported:()=>void}){
 const [legacy,setLegacy]=useState<string[]>([]),[selected,setSelected]=useState<string[]>([]),[open,setOpen]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<BookmarkImportResult|null>(null);
 const abort=useRef<AbortController|null>(null),busy=useRef(false),request=useRef<{selection:string;id:string}|null>(null);
 useEffect(()=>{const controller=new AbortController();abort.current=controller;try{const value:unknown=JSON.parse(localStorage.getItem('lens-letter-saved')??'[]');const slugs=Array.isArray(value)?[...new Set(value.filter((v):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=200))].slice(-200):[];// eslint-disable-next-line react-hooks/set-state-in-effect
setLegacy(slugs);}catch{/* 원본을 바꾸지 않는다. */}return()=>controller.abort();},[owner]);
 const submit=async()=>{if(!selected.length||busy.current)return;busy.current=true;setPending(true);setError('');try{const selection=JSON.stringify([...new Set(selected)].sort());if(request.current?.selection!==selection)request.current={selection,id:crypto.randomUUID()};const response=await importBrowserBookmarks(selected,request.current.id,abort.current?.signal);if(abort.current?.signal.aborted)return;request.current=null;setResult(response);onImported();}catch(e){if(!abort.current?.signal.aborted)setError(e instanceof Error?e.message:'가져오기를 완료하지 못했어요. 원본은 유지돼요.');}finally{busy.current=false;setPending(false);}};
 if(!legacy.length)return null;
 return <section className="ml-browser-import" aria-labelledby="ml-import-title"><div><h3 id="ml-import-title">이 브라우저에 남아 있는 레터 {legacy.length}편</h3><p className="ml-helper">로그인 전 저장한 목록이에요. 선택한 레터만 현재 계정으로 가져올 수 있고, 브라우저 원본은 그대로 유지해요.</p></div><button type="button" className="ml-text-link" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?'선택 접기':'가져올 레터 선택'}</button>
  {open&&<><fieldset disabled={pending}><legend>현재 로그인 계정에 가져올 레터</legend><div className="ml-import-choices">{legacy.map(slug=><label key={slug}><input type="checkbox" checked={selected.includes(slug)} onChange={event=>{setResult(null);setSelected(values=>event.target.checked?[...values,slug]:values.filter(v=>v!==slug));}}/><span>{letters.find(l=>l.slug===slug)?.title??`이전 레터 · ${slug}`}</span></label>)}</div></fieldset><button type="button" className="ml-button" disabled={!selected.length||pending} onClick={()=>void submit()}>{pending?'가져오는 중…':`선택한 ${selected.length}편 계정으로 가져오기`}</button></>}
  {error&&<p role="alert" className="ml-helper">{error}</p>}{result&&<div role="status" className="ml-helper"><p>{result.replayed?'이전에 처리한 목록이에요. 이후 해제한 레터는 다시 저장하지 않아요.':`선택 목록에서 레터 ${result.accepted.length}편의 가져오기를 처리했어요.`}</p>{result.rejected.length>0&&<p>공개 상태를 확인할 수 없는 {result.rejected.length}편은 가져오지 않았어요: {result.rejected.map(r=>r.slug).join(', ')}. 브라우저 원본은 남아 있어요.</p>}</div>}
 </section>;
}
