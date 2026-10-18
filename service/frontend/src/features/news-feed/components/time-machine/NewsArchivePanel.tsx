'use client';

// 기존 기사 탐색 보기. 생일 시세의 입력과 별도 상태를 유지한다.
// 구성: 데이터 useTimeMachineDay / 날짜 입력 DatePicker / 결과 ResultHeader + DayRows / 로딩·빈 상태 ResultStates. 날짜 계산은 shared/lib/timelineDates.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TimeMachineRewind } from '@/shared/ui/time-machine/TimeMachineRewind';
import { kstTodayStr } from '@/shared/lib/date/date';
import { fullYearsAgo } from '@/shared/lib/date/timelineDates';
import { getFeaturedEvents, type TimelineEvent } from '@/shared/data/timelineEvents';
import { DatePicker } from '@/features/news-feed/components/time-machine/DatePicker';
import { EventCard } from '@/features/news-feed/components/time-machine/EventCard';
import { DayRows } from '@/features/news-feed/components/time-machine/DayRows';
import { ResultHeader } from '@/features/news-feed/components/time-machine/ResultHeader';
import { EmptyDay, ResultSkeleton } from '@/features/news-feed/components/time-machine/ResultStates';
import { useTimeMachineDay } from '@/features/news-feed/components/time-machine/useTimeMachineDay';

const SOURCE_LABEL = {
  liveToday: '서울경제 · 실시간',
  live: '서울경제 기사',
  archive: '빅카인즈 뉴스빅데이터 제공 · 발행 시각 정보 없음',
} as const;

export function NewsArchivePanel() {
  const router = useRouter();
  const [pickedDate, setPickedDate] = useState(kstTodayStr);
  const [rewinding, setRewinding] = useState(false);
  const [featured, setFeatured] = useState<TimelineEvent | null>(null);
  const events = getFeaturedEvents();
  const { rows, kind, isLive } = useTimeMachineDay(pickedDate);

  const today = kstTodayStr();
  const source = isLive ? SOURCE_LABEL.liveToday : kind === 'live' ? SOURCE_LABEL.live : SOURCE_LABEL.archive;

  const depart = (typedDate: string | null) => {
    if (typedDate) setPickedDate(typedDate);
    setRewinding(true);
  };

  return (<div>
        {rewinding && (
          <div style={{ padding: 'clamp(28px, 6vw, 48px) 20px' }}>
            <TimeMachineRewind fromDate={today} toDate={pickedDate} onComplete={() => router.push(`/timeline/${pickedDate}`)} />
          </div>
        )}

        <DatePicker
          pickedDate={pickedDate}
          hidden={rewinding}
          events={events}
          activeEventKey={featured?.id ?? null}
          onPick={(date) => { setFeatured(null); setPickedDate(date); }}
          onPickEvent={setFeatured}
          onDepart={(typed) => { setFeatured(null); depart(typed); }}
        />

        {!rewinding && featured && (
          <EventCard event={featured} onOpenDay={(paperDate) => { setPickedDate(paperDate); setRewinding(true); }} />
        )}

        {!rewinding && !featured &&
          (rows === null ? (
            <ResultSkeleton kind={kind} />
          ) : (
            <div key={pickedDate} className="ntm-pageturn" style={{ padding: 'clamp(12px, 3vw, 20px)' }}>
              <ResultHeader
                date={pickedDate}
                source={source}
                yearsBack={fullYearsAgo(pickedDate)}
                isToday={isLive}
                onBackToToday={() => setPickedDate(today)}
              />
              {rows.length === 0 ? <EmptyDay /> : <DayRows rows={rows} kind={kind} />}
            </div>
          ))}

  </div>);
}
