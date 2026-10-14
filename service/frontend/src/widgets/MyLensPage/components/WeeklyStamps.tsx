import Link from 'next/link';
import { Check,ChevronRight } from 'lucide-react';
import type { Area,RewardWeek } from '../lib/dashboardApi';

export function WeeklyStamps({ week,compact=false }: {week:RewardWeek;compact?:boolean}){
 const start=new Date(`${week.week_start}T00:00:00Z`);
 return <ol className={`ml-stamp-week${compact?' ml-stamp-compact':''}`} aria-label="요일별 실제 스탬프">{['월','화','수','목','금','토','일'].map((day,index)=>{
  const date=new Date(start.getTime()+index*86400000).toISOString().slice(0,10),stamped=week.stamps.some(s=>s.date===date);
  const unknown=date<week.coverage_start,future=date>week.today;
  return <li key={day}><span>{day}</span><span className="ml-stamp" data-stamped={stamped} role="img" aria-label={`${date} ${stamped?'스탬프 획득':future?'미래 날짜':unknown?'수집 시작 전':'스탬프 없음'}`}>{stamped?<Check size={compact?13:20} aria-hidden/>:<span aria-hidden>{unknown?'—':'·'}</span>}</span></li>;
 })}</ol>;
}
export function WeeklyStampSummary({area,loading,onRetry}:{area:Area<RewardWeek>|undefined;loading:boolean;onRetry:()=>void}){
 const week=area?.data;
 return <section className="ml-weekly-summary" aria-labelledby="ml-weekly-summary-title"><div className="ml-section-title"><h2 id="ml-weekly-summary-title">이번 주 스탬프</h2><span className="ml-summary-state">서버 완료 기록</span></div>
 {loading?<p role="status" className="ml-helper">기록을 불러오고 있어요.</p>:week?<><WeeklyStamps week={week} compact/><p className="ml-weekly-goal"><strong>{week.stamp_days}일</strong><span> / 주간 목표 {week.goal_days}일</span></p><p className="ml-helper">새 콘텐츠를 처음 완료한 날, 하루 하나씩 쌓여요.</p></>:<p className="ml-helper">스탬프를 불러오지 못했어요. <button type="button" className="ml-text-link" onClick={onRetry}>다시 불러오기</button></p>}
 <Link href="/my-lens?tab=records#ml-rewards" className="ml-summary-link">주·월·연 기록 보기 <ChevronRight size={14} aria-hidden/></Link></section>;
}
