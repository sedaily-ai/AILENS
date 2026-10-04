'use client';

// 홈 "그날로 떠나요" 구역 — 날짜를 고르면 그날의 서울경제 기사를 보여주고, "이날 보기"를 누르면 되감기 연출 뒤 /timeline/{날짜}로 이동한다.
// 구성: 데이터 useTimeMachineDay / 날짜 입력 DatePicker / 결과 ResultHeader + DayRows / 로딩·빈 상태 ResultStates. 날짜 계산은 shared/lib/timelineDates.
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TimeMachineRewind } from '@/shared/ui/time-machine/TimeMachineRewind';
import { TimelineSketch } from '@/shared/ui/icons/VideoSketch';
import { HandUnderline } from '@/shared/ui/effects/HandUnderline';
import { kstTodayStr } from '@/shared/lib/date/date';
import { fullYearsAgo } from '@/shared/lib/date/timelineDates';
import { getFeaturedEvents, type TimelineEvent } from '@/shared/data/timelineEvents';
import { DatePicker } from '@/features/news-feed/components/time-machine/DatePicker';
import { EventCard } from '@/features/news-feed/components/time-machine/EventCard';
import { DayRows } from '@/features/news-feed/components/time-machine/DayRows';
import { ResultHeader } from '@/features/news-feed/components/time-machine/ResultHeader';
import { EmptyDay, ResultSkeleton } from '@/features/news-feed/components/time-machine/ResultStates';
import { BLUE, INK, LINE, SR_ONLY, TIME_MACHINE_CSS } from '@/features/news-feed/components/time-machine/tokens';
import { useTimeMachineDay } from '@/features/news-feed/components/time-machine/useTimeMachineDay';

const SOURCE_LABEL = {
  liveToday: '서울경제 · 실시간',
  live: '서울경제 기사',
  archive: '빅카인즈 뉴스빅데이터 제공 · 발행 시각 정보 없음',
} as const;

export function NewsTimeMachineSection() {
  const router = useRouter();
  const headingId = useId();
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

  return (
    <section aria-labelledby={headingId} style={{ padding: 'clamp(24px, 4vw, 40px) 0 0' }}>
      <style>{TIME_MACHINE_CSS}</style>

      <header style={{ marginBottom: 12 }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          <h2
            id={headingId}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em', color: INK }}
          >
            <TimelineSketch className="w-12 h-10 -ml-1" />
            <HandUnderline>그날로 떠나요</HandUnderline>
          </h2>
          {/* 실시간 표시는 점만 보이고, 보조기기에는 안 보이는 텍스트로 상태를 알린다. */}
          {isLive && (
            <>
              <span aria-hidden className="ntm-livedot" style={{ width: 6, height: 6, borderRadius: '50%', background: BLUE, flexShrink: 0 }} />
              <span style={SR_ONLY}>실시간 업데이트 중</span>
            </>
          )}
        </div>
      </header>

      <div
        style={{
          borderRadius: 16, background: '#fff', border: `1px solid ${LINE}`,
          boxShadow: '0 1px 2px rgba(17,24,39,0.03), 0 3px 10px rgba(17,24,39,0.04)', overflow: 'hidden',
        }}
      >
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
      </div>
    </section>
  );
}
