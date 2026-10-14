import Link from 'next/link';
import { Check, ChevronRight } from 'lucide-react';

export function WeeklyStamps({ example, compact = false }: { example: boolean; compact?: boolean }) {
  return <ol className={`ml-stamp-week${compact ? ' ml-stamp-compact' : ''}`} aria-label={example ? '예시: 월·수·금 스탬프, 실제 기록 아님' : '요일별 기록 연동 대기'}>{['월', '화', '수', '목', '금', '토', '일'].map((day, index) => {
    const stamped = example && [0, 2, 4].includes(index);
    return <li key={day}><span>{day}</span><span className="ml-stamp" data-stamped={stamped} role="img" aria-label={`${day}요일 ${example ? stamped ? '스탬프 예시' : '미획득 예시' : '기록 연동 대기'}`}>{stamped ? <Check size={compact ? 13 : 20} aria-hidden /> : <span aria-hidden>—</span>}</span></li>;
  })}</ol>;
}

export function WeeklyStampSummary({ example }: { example: boolean }) {
  return <section className="ml-weekly-summary" aria-labelledby="ml-weekly-summary-title">
    <div className="ml-section-title"><h2 id="ml-weekly-summary-title">이번 주 스탬프</h2><span className="ml-summary-state">{example ? '화면 예시' : '연동 대기'}</span></div>
    <WeeklyStamps example={example} compact />
    <p className="ml-weekly-goal"><strong>{example ? '예시 3일' : '—일'}</strong><span> / 주간 목표 3일</span></p>
    <p className="ml-helper">{example ? '본문에서 선택한 예시예요. 실제 획득 기록은 아니에요.' : '하루 한 편, 나의 속도로. 실제 기록은 연결 후 보여드려요.'}</p>
    <Link href="/my-lens?tab=records#ml-rewards" className="ml-summary-link">주·월·연 기록 보기 <ChevronRight size={14} aria-hidden /></Link>
  </section>;
}
