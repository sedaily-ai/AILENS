import Link from 'next/link';
import { Check,ChevronRight } from 'lucide-react';
import type { Area,ReadingRecords } from '../lib/dashboardApi';

export function WeeklyStamps({ week,compact=false }: {week:ReadingRecords;compact?:boolean}){
 const start=new Date(`${week.start}T00:00:00Z`);
 return <ol className={`ml-stamp-week${compact?' ml-stamp-compact':''}`} aria-label="요일별 이용 기록">{['월','화','수','목','금','토','일'].map((day,index)=>{
  const date=new Date(start.getTime()+index*86400000).toISOString().slice(0,10),stamped=week.days.some(s=>s.date===date&&s.completed_contents>0);
  const unknown=date<week.coverage_start,future=date>week.today;
  return <li key={day}><span>{day}</span><span className="ml-stamp" data-stamped={stamped} role="img" aria-label={`${date} ${stamped?'콘텐츠 완료':future?'미래 날짜':unknown?'수집 시작 전':'완료 기록 없음'}`}>{stamped?<Check size={compact?13:20} aria-hidden/>:<span aria-hidden>{unknown?'—':'·'}</span>}</span></li>;
 })}</ol>;
}
export function WeeklyStampSummary({area,loading,onRetry}:{area:Area<ReadingRecords>|undefined;loading:boolean;onRetry:()=>void}){
 const week=area?.data;
 return <section className="ml-weekly-summary" aria-labelledby="ml-weekly-summary-title"><div className="ml-section-title"><h2 id="ml-weekly-summary-title">이번 주 이용 기록</h2></div>
 {loading?<p role="status" className="ml-helper">기록을 불러오고 있어요.</p>:week?<><WeeklyStamps week={week} compact/><p className="ml-weekly-goal"><strong>{week.read_days}일</strong><span> 완료</span></p><p className="ml-helper">읽고, 보고, 들은 날을 표시해요.</p></>:<p className="ml-helper">이용 기록을 불러오지 못했어요. <button type="button" className="ml-text-link" onClick={onRetry}>다시 불러오기</button></p>}
 <Link href="/my-lens?tab=records#ml-rewards" className="ml-summary-link">주·월·연 기록 보기 <ChevronRight size={14} aria-hidden/></Link></section>;
}
