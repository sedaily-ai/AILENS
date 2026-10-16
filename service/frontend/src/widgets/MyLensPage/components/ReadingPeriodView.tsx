'use client';
import { useState } from 'react';
import { Check,ChevronLeft,ChevronRight } from 'lucide-react';
import { currentKstDay,readingPeriodRange,type ReadingPeriod } from '../lib/readingPeriod';
import { useReadingRecords } from '../lib/useReadingRecords';
import { WeeklyStamps } from './WeeklyStamps';
const PERIODS=[{key:'week',label:'주'},{key:'month',label:'월'},{key:'year',label:'연'}] as const;
export function ReadingPeriodView(){
 const [period,setPeriod]=useState<ReadingPeriod>('week'),[offset,setOffset]=useState(0);
 const [clock,setClock]=useState<string|null>(null);
 const fallback=clock??currentKstDay();
 const anchor=offset?readingPeriodRange(period,offset,fallback).start:undefined;
 const feed=useReadingRecords(period,anchor);
 const data=feed.records;
 const label=data?readingPeriodRange(period,0,data.start).label:'기간 기록';
 const navigate=(n:number)=>{if(data)setClock(data.today);setOffset(n);};
 const earliest=data?new Date(`${data.coverage_start}T00:00:00Z`).getUTCFullYear():null;
 const previous=readingPeriodRange(period,offset-1,data?.today??fallback);
 const canPrevious=!!data&&Number(previous.end.slice(0,4))>=(earliest??0);
 return <div className="ml-period-record" aria-busy={feed.loading}>
  <div className="ml-period-top"><h3>나의 뉴스 이용 기록</h3><div className="ml-period-switch" role="group" aria-label="뉴스 이용 기록 기간">{PERIODS.map(item=><button type="button" key={item.key} aria-pressed={period===item.key} onClick={()=>{if(data)setClock(data.today);setPeriod(item.key);setOffset(0);}}>{item.label}</button>)}</div></div>
  <p className="ml-period-scope">읽기·웹툰·듣기·영상, 어떤 형식이든 완료하면 기록돼요.</p>
  <div className="ml-period-navigation"><button type="button" className="ml-icon-button" aria-label="이전 기간" disabled={!canPrevious||feed.loading} onClick={()=>navigate(offset-1)}><ChevronLeft size={18}/></button><p aria-live="polite">{feed.loading?'기록을 불러오고 있어요':label}</p><button type="button" className="ml-icon-button" aria-label="다음 기간" disabled={offset>=0||feed.loading} onClick={()=>navigate(offset+1)}><ChevronRight size={18}/></button><button type="button" className="ml-period-current" disabled={offset===0||feed.loading} onClick={()=>navigate(0)}>{period==='week'?'이번 주':period==='month'?'이번 달':'올해'}</button></div>
  {feed.error?<p role="alert" className="ml-helper">{feed.error} <button type="button" onClick={feed.retry}>다시 불러오기</button></p>:feed.loading?<p role="status" className="ml-loading">서버의 완료 기록을 확인하고 있어요.</p>:data?<>
   <div className="ml-reward-sheet">
    {period==='week'?<><h3>이번 주 이용 기록</h3><WeeklyStamps week={data}/><div className="ml-reward-progress"><span>완료한 날 {data.read_days}일</span><span>콘텐츠를 완료한 날짜에 표시해요.</span></div></>:period==='month'?<>
     <div className="ml-calendar-heading"><h3>월간 활동 달력</h3><span>완료한 날 {data.read_days}일</span></div>
     <div className="ml-month-weekdays" aria-hidden>{['월','화','수','목','금','토','일'].map(d=><span key={d}>{d}</span>)}</div>
     <ol className="ml-month-calendar" aria-label="월간 콘텐츠 완료 달력">{data.days.map((day,index)=><li key={day.date} style={index===0?{gridColumnStart:readingPeriodRange('month',0,data.start).leadingDays+1}:undefined} aria-label={`${day.date}${day.date===data.today?' 오늘':''} ${day.future?'미래 날짜':!day.covered?'수집 시작 전':`${day.completed_contents}편 완료`}`} aria-current={day.date===data.today?'date':undefined} data-today={day.date===data.today} data-future={day.future} data-stamped={!day.future&&day.covered&&day.completed_contents>0} data-completed={!day.future&&day.covered&&day.completed_contents>0}>
      <span className="ml-calendar-date">{Number(day.date.slice(-2))}</span>
      <span className="ml-calendar-status">{day.future?<span aria-hidden>·</span>:!day.covered?<span aria-hidden>—</span>:day.completed_contents>0?<><Check size={15} aria-hidden /><span>완료</span></>:<span aria-hidden>·</span>}</span>
      {!day.future&&day.covered&&day.completed_contents>0&&<span className="ml-calendar-count">{day.completed_contents}편</span>}
     </li>)}</ol>
     <ul className="ml-calendar-legend" aria-label="달력 표시 안내"><li><span data-kind="stamp" aria-hidden />콘텐츠 완료</li><li><span aria-hidden>—</span>기록 수집 전</li></ul>
    </>:<><h3>한 해의 이용 흐름</h3><ol className="ml-year-record" aria-label="실제 월별 완료 기록">{data.months.map(month=><li key={month.month}><strong>{month.month}월</strong><span>완료한 날 {month.covered&&!month.future?`${month.read_days}일`:'—'}</span><span>{month.covered&&!month.future?`완료 ${month.completed_contents}편`:month.future?'미래 기간':'수집 시작 전'}</span></li>)}</ol></>}
   </div>
   <div className="ml-period-metrics"><div><span>완료한 날</span><strong>{data.read_days}일</strong></div><div><span>완료한 콘텐츠</span><strong>{data.completed_contents}편</strong></div><div><span>만난 분야</span><strong>{data.categories.length}개</strong></div></div>
   <p className="ml-period-description">한국 시간 기준, 같은 이슈는 기간 내 한 편으로 세어요. {data.coverage_start}부터 기록하며 수집 전 날짜는 —로 표시해요.</p>
  </>:<p className="ml-helper">기록을 조회할 수 없어요. <button onClick={feed.retry}>다시 불러오기</button></p>}
 </div>;
}
