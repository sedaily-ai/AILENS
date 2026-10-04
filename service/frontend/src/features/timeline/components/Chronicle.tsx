// 연표 — 사건을 연도별로 묶어 세로 타임라인으로 그린다. 연대 페이지와 시대 페이지가 같이 쓴다.
import Link from 'next/link';
import type { TimelineEvent } from '@/shared/data/timelineEvents';
import { formatEventDate, kdate } from '@/shared/lib/timelineDates';
import { EventArticles } from './EventArticles';
import { TEXT_STRONG, TEXT_BODY, TEXT_MUTED, ACCENT, BORDER_HAIRLINE, BORDER_CONTROL, FONT, SPACE, TOUCH_MIN } from '../lib/tone';

function ChronicleEvent({ event, showEra }: { event: TimelineEvent; showEra: boolean }) {
  return (
    <li id={`e-${event.id}`} style={{ position: 'relative', paddingLeft: 28, paddingBottom: SPACE.xl }}>
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 8, width: 10, height: 10, borderRadius: '50%', background: ACCENT }} />
      <p style={{ fontSize: FONT.caption, fontWeight: 700, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
        {formatEventDate(event.date, event.endDate)}
        {showEra && event.era && (
          <span style={{ color: TEXT_MUTED, fontWeight: 600 }}>
            {' · '}
            {event.eraSlug ? (
              <Link href={`/timeline/era/${event.eraSlug}`} style={{ color: TEXT_MUTED }}>{event.era}</Link>
            ) : (
              event.era
            )}
          </span>
        )}
      </p>
      <h3 style={{ fontSize: FONT.sectionTitle, fontWeight: 800, color: TEXT_STRONG, letterSpacing: '-0.015em', margin: '4px 0 8px', wordBreak: 'keep-all' }}>
        {event.title}
      </h3>
      <p style={{ fontSize: FONT.body, color: TEXT_BODY, lineHeight: 1.65, wordBreak: 'keep-all' }}>{event.description}</p>

      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px' }}>
        <EventArticles event={event} />
        {event.paperDate && (
          <Link
            href={`/timeline/${event.paperDate}`}
            className="tl-focus"
            style={{
              display: 'inline-flex', alignItems: 'center', minHeight: TOUCH_MIN, padding: '0 16px', borderRadius: 9999,
              border: `1px solid ${BORDER_CONTROL}`, color: TEXT_STRONG, fontSize: FONT.meta, fontWeight: 700, textDecoration: 'none',
            }}
          >
            {kdate(event.paperDate)} 신문 전체 보기 →
          </Link>
        )}
      </div>

      {event.note && <p style={{ fontSize: FONT.caption, color: TEXT_MUTED, marginTop: 10, lineHeight: 1.6 }}>{event.note}</p>}
      <p style={{ fontSize: FONT.caption, color: TEXT_MUTED, marginTop: 8, lineHeight: 1.7 }}>
        출처{' '}
        {event.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && ' · '}
            <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: TEXT_MUTED, textDecoration: 'underline', textUnderlineOffset: 2 }}>
              {s.label}
            </a>
          </span>
        ))}
      </p>
    </li>
  );
}

export function Chronicle({ events, showEra = false }: { events: TimelineEvent[]; showEra?: boolean }) {
  const years = [...new Set(events.map((e) => e.date.slice(0, 4)))];
  return (
    <div>
      {years.map((year) => (
        <section key={year} aria-labelledby={`y-${year}`} style={{ marginBottom: SPACE.lg }}>
          <h2 id={`y-${year}`} style={{ fontSize: FONT.sectionTitle, fontWeight: 800, color: TEXT_STRONG, marginBottom: SPACE.md }}>
            {year}년
          </h2>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, borderLeft: `2px solid ${BORDER_HAIRLINE}`, marginLeft: 4 }}>
            {events.filter((e) => e.date.startsWith(year)).map((event) => (
              <ChronicleEvent key={event.id} event={event} showEra={showEra} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
