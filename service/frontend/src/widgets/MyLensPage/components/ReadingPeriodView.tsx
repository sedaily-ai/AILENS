'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { currentKstDay, readingPeriodRange, type ReadingPeriod } from '../lib/readingPeriod';
import { WeeklyStamps } from './WeeklyStamps';

const PERIODS = [{ key: 'week', label: '주' }, { key: 'month', label: '월' }, { key: 'year', label: '연' }] as const;

export function ReadingPeriodView({ example, onExitExample }: { example: boolean; onExitExample: () => void }) {
  const [today, setToday] = useState<string | null>(null);
  const [period, setPeriod] = useState<ReadingPeriod>('week');
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 서버 시각과 브라우저 시각 차이로 인한 초기 HTML 불일치를 피한다.
    setToday(currentKstDay());
  }, []);
  const range = today ? readingPeriodRange(period, offset, today) : null;
  // 달성 예시를 켜면 현재 주의 예시를 보여준다. 예시 밖의 기간은 실제 기록 대기 상태다.
  const shownPeriod = example ? 'week' : period;
  const shownOffset = example ? 0 : offset;
  const shownRange = example && today ? readingPeriodRange('week', 0, today) : range;
  const switchPeriod = (next: ReadingPeriod) => { onExitExample(); setPeriod(next); setOffset(0); };
  const navigate = (next: number) => { onExitExample(); setPeriod(shownPeriod); setOffset(next); };
  return <div className="ml-period-record">
    <div className="ml-period-top"><h3>나의 읽기 기록</h3><div className="ml-period-switch" role="group" aria-label="읽기 기록 기간">{PERIODS.map((item) => <button type="button" key={item.key} aria-pressed={shownPeriod === item.key} onClick={() => switchPeriod(item.key)}>{item.label}</button>)}</div></div>
    <div className="ml-period-navigation"><button type="button" aria-label="이전 기간" className="ml-icon-button" disabled={!today} onClick={() => navigate(shownOffset - 1)}><ChevronLeft size={18} /></button><p aria-live="polite">{shownRange?.label ?? '기간을 확인하고 있어요'}</p><button type="button" aria-label="다음 기간" className="ml-icon-button" disabled={!today || shownOffset >= 0} onClick={() => navigate(shownOffset + 1)}><ChevronRight size={18} /></button><button type="button" className="ml-period-current" disabled={!today || shownOffset === 0} onClick={() => navigate(0)}>{shownPeriod === 'week' ? '이번 주' : shownPeriod === 'month' ? '이번 달' : '올해'}</button></div>
    <div className="ml-reward-sheet" data-example={example}>
      {shownPeriod === 'week' ? <>
        <div className="ml-reward-heading"><div><h3>{example ? '주간 스탬프 예시' : '나의 주간 스탬프'}</h3><p>{example ? '일주일 동안 3일 읽은 모습을 미리 보여드려요.' : '그날 처음으로 새 콘텐츠를 다 읽으면 스탬프 하나.'}</p></div></div>
        <WeeklyStamps example={example} />
        <div className="ml-reward-progress"><span>{example ? '예시 · 3일 / 주간 목표 3일' : '선택한 주 기록 — / 주간 목표 3일'}</span><span>{example ? '꾸준한 시선 배지 달성 예시' : '실제 달성 여부는 연동 후 확인'}</span></div>
      </> : shownPeriod === 'month' ? <>
        <h3>월간 읽기 달력</h3><p className="ml-period-description">읽은 날짜에 스탬프를 모아볼 수 있어요. 현재는 기록 연동 전이에요.</p>
        <div className="ml-month-weekdays" aria-hidden>{['월', '화', '수', '목', '금', '토', '일'].map((day) => <span key={day}>{day}</span>)}</div>
        <ol className="ml-month-calendar" aria-label={`${shownRange?.label ?? ''} 읽기 달력 · 기록 연동 대기`}>{shownRange && Array.from({ length: shownRange.days }, (_, index) => {
          const date = `${shownRange.start.slice(0, 8)}${String(index + 1).padStart(2, '0')}`;
          return <li key={date} style={index === 0 ? { gridColumnStart: shownRange.leadingDays + 1 } : undefined} aria-label={`${date} ${today && date > today ? '미래 날짜' : '기록 연동 대기'}`} aria-current={date === today ? 'date' : undefined} data-today={date === today} data-future={!!today && date > today}><span>{index + 1}</span><span aria-hidden>{today && date > today ? '·' : '—'}</span></li>;
        })}</ol>
      </> : <>
        <h3>한 해의 읽기 흐름</h3><p className="ml-period-description">월별 읽은 날과 콘텐츠 수를 돌아보는 공간이에요.</p>
        <ol className="ml-year-record" aria-label={`${shownRange?.label ?? ''} 월별 기록 · 연동 대기`}>{Array.from({ length: 12 }, (_, index) => <li key={index}><strong>{index + 1}월</strong><span>읽은 날 —</span><span>읽은 콘텐츠 —</span></li>)}</ol>
      </>}
    </div>
    <div className="ml-period-metrics" aria-label="선택한 기간의 읽기 집계"><div><span>읽은 날</span><strong>{example ? '예시 3일' : '—'}</strong></div><div><span>읽은 콘텐츠</span><strong>—</strong></div><div><span>만난 분야</span><strong>—</strong></div></div>
    <p className="ml-period-description">{example ? '예시의 3일 외에는 실제 집계값을 표시하지 않아요.' : '선택한 기간의 집계는 연동 준비 중이에요. 브라우저의 누적 열람 기록과는 별개예요.'} 날짜는 한국 시간 기준이에요.</p>
  </div>;
}
