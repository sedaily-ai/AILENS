'use client';

// 홈 "역사 속 그날" 칩을 눌렀을 때 결과 자리에 보이는 사건 카드 — 검증된 사건 설명 + 출처 + 그날 서울경제 보기 / 시대 연표 보기.
// 날짜 조회는 하루 30건이 중요도 순이 아니라 해당 사건 기사가 안 나올 수 있어서(12-04 상위 30건에 IMF 기사 없음), 목록 대신 설명 카드를 보여준다.
import Link from 'next/link';
import type { TimelineEvent } from '@/shared/data/timelineEvents';
import { kdate } from '@/shared/lib/date/timelineDates';
import { BLUE, INK, LINE, MUTED, BODY } from './tokens';

export function EventCard({ event, onOpenDay }: { event: TimelineEvent; onOpenDay: (paperDate: string) => void }) {
  const eraTitle = event.era;
  const chronicleHref = event.eraSlug ? `/timeline/era/${event.eraSlug}` : `/timeline/decade/${event.date.slice(0, 3)}0s`;
  const chronicleLabel = event.eraSlug ? `${eraTitle} 연표 보기` : `${event.date.slice(0, 3)}0년대 연표 보기`;
  return (
    <div style={{ padding: 'clamp(12px, 3vw, 20px)' }}>
      <div style={{ paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${LINE}` }}>
        {eraTitle && <p style={{ fontSize: 13, fontWeight: 700, color: BLUE }}>{eraTitle}</p>}
        <p style={{ fontSize: 16, fontWeight: 700, color: INK, marginTop: 4, wordBreak: 'keep-all' }}>{event.title}</p>
        <p style={{ fontSize: 13, color: MUTED, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{kdate(event.date)}</p>
      </div>
      <p style={{ fontSize: 14, color: BODY, lineHeight: 1.7, wordBreak: 'keep-all' }}>{event.description}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <button type="button" className="ntm-go ntm-focus" onClick={() => onOpenDay(event.paperDate!)}>
          {kdate(event.paperDate!)} 서울경제 보기 →
        </button>
        <Link href={chronicleHref} className="ntm-chip ntm-focus" style={{ textDecoration: 'none' }}>
          {chronicleLabel}
        </Link>
      </div>
      <p style={{ fontSize: 12.5, color: MUTED, marginTop: 10 }}>
        출처 {event.sources.map((s) => s.label).join(' · ')}
      </p>
    </div>
  );
}
