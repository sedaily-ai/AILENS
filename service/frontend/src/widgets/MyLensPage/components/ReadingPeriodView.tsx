'use client';
import { useState } from 'react';
import { ChevronLeft,ChevronRight } from 'lucide-react';
import { currentKstDay,readingPeriodRange,type ReadingPeriod } from '../lib/readingPeriod';
import { useReadingRecords } from '../lib/useReadingRecords';
import { WeeklyStamps } from './WeeklyStamps';
import { Award,Compass,RotateCcw } from 'lucide-react';
const PERIODS=[{key:'week',label:'주'},{key:'month',label:'월'},{key:'year',label:'연'}] as const;
const ICONS=[Award,Compass,RotateCcw];
export function ReadingPeriodView(){
 const [period,setPeriod]=useState<ReadingPeriod>('week'),[offset,setOffset]=useState(0);
 const [clock,setClock]=useState<string|null>(null);
 const fallback=clock??currentKstDay();
 const anchor=offset?readingPeriodRange(period,offset,fallback).start:undefined;
 const feed=useReadingRecords(period,anchor);
 const data=feed.records,week=feed.rewards;
 const label=data?readingPeriodRange(period,0,data.start).label:'기간 기록';
 const navigate=(n:number)=>{if(data)setClock(data.today);setOffset(n);};
 const earliest=data?new Date(`${data.coverage_start}T00:00:00Z`).getUTCFullYear():null;
 const previous=readingPeriodRange(period,offset-1,data?.today??fallback);
 const canPrevious=!!data&&Number(previous.end.slice(0,4))>=(earliest??0);
 return <div className="ml-period-record" aria-busy={feed.loading}>
  <div className="ml-period-top"><h3>나의 읽기 기록</h3><div className="ml-period-switch" role="group" aria-label="읽기 기록 기간">{PERIODS.map(item=><button type="button" key={item.key} aria-pressed={period===item.key} onClick={()=>{if(data)setClock(data.today);setPeriod(item.key);setOffset(0);}}>{item.label}</button>)}</div></div>
  <div className="ml-period-navigation"><button type="button" className="ml-icon-button" aria-label="이전 기간" disabled={!canPrevious||feed.loading} onClick={()=>navigate(offset-1)}><ChevronLeft size={18}/></button><p aria-live="polite">{feed.loading?'기록을 불러오고 있어요':label}</p><button type="button" className="ml-icon-button" aria-label="다음 기간" disabled={offset>=0||feed.loading} onClick={()=>navigate(offset+1)}><ChevronRight size={18}/></button><button type="button" className="ml-period-current" disabled={offset===0||feed.loading} onClick={()=>navigate(0)}>{period==='week'?'이번 주':period==='month'?'이번 달':'올해'}</button></div>
  {feed.error?<p role="alert" className="ml-helper">{feed.error} <button type="button" onClick={feed.retry}>다시 불러오기</button></p>:feed.loading?<p role="status" className="ml-loading">서버의 완료 기록을 확인하고 있어요.</p>:data?<>
   <div className="ml-reward-sheet">
    {period==='week'&&week?<><h3>나의 주간 스탬프</h3><WeeklyStamps week={week}/><div className="ml-reward-progress"><span>{week.stamp_days}일 / 주간 목표 {week.goal_days}일</span><span>같은 콘텐츠의 다른 형식은 중복 지급하지 않아요.</span></div></>:period==='month'?<><h3>월간 읽기 달력</h3><div className="ml-month-weekdays" aria-hidden>{['월','화','수','목','금','토','일'].map(d=><span key={d}>{d}</span>)}</div><ol className="ml-month-calendar" aria-label="실제 월간 읽기 달력">{data.days.map((day,index)=><li key={day.date} style={index===0?{gridColumnStart:readingPeriodRange('month',0,data.start).leadingDays+1}:undefined} aria-label={`${day.date} ${day.future?'미래 날짜':!day.covered?'수집 시작 전':`${day.completed_contents}편 완료${day.stamped?', 스탬프 획득':''}`}`} data-today={day.date===data.today} data-future={day.future}><span>{Number(day.date.slice(-2))}</span><span>{day.stamped?'✓':day.completed_contents?`${day.completed_contents}편`:!day.covered?'—':'·'}</span></li>)}</ol></>:<><h3>한 해의 읽기 흐름</h3><ol className="ml-year-record" aria-label="실제 월별 완료 기록">{data.months.map(month=><li key={month.month}><strong>{month.month}월</strong><span>읽은 날 {month.covered&&!month.future?`${month.read_days}일`:'—'}</span><span>{month.covered&&!month.future?`완료 ${month.completed_contents}편 · 스탬프 ${month.stamp_days}일`:month.future?'미래 기간':'수집 시작 전'}</span></li>)}</ol></>}
   </div>
   <div className="ml-period-metrics"><div><span>읽은 날</span><strong>{data.read_days}일</strong></div><div><span>완료한 콘텐츠</span><strong>{data.completed_contents}편</strong></div><div><span>만난 분야</span><strong>{data.categories.length}개</strong></div></div>
   <p className="ml-period-description">한국 시간 기준, 같은 이슈는 기간 내 한 편으로 세어요. {data.coverage_start}부터 기록하며 수집 전 날짜는 —로 표시해요. 스탬프와 읽은 날은 다를 수 있어요.</p>
   {data.pending_rewards>0&&<p className="ml-helper">완료 기록 {data.pending_rewards}건은 같은 이슈의 보상 그룹 확인을 기다리고 있어요.</p>}
   {week&&<div className="ml-badge-list">{week.badges.map((badge,index)=>{const Icon=ICONS[index]??Award;return <div className="ml-badge-row" key={badge.id}><span className="ml-badge-icon" data-earned={badge.earned}><Icon size={22} aria-hidden/></span><div><h3>{badge.title}</h3><p>{badge.progress.current} / {badge.progress.target}{badge.earned&&badge.earned_at?` · ${new Date(badge.earned_at).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})} 획득`:''}</p></div><span className="ml-badge-state">{badge.earned?'획득':'진행 중'}</span></div>;})}</div>}
  </>:<p className="ml-helper">기록을 조회할 수 없어요. <button onClick={feed.retry}>다시 불러오기</button></p>}
 </div>;
}
