// 연대 페이지 — 그 연대의 사건을 연도별 연표로. 위쪽에 다른 연대로 가는 탭.
import Link from 'next/link';
import { DECADES, getDecadeEvents, type DecadeKey } from '@/shared/data/timelineEvents';
import { Chronicle } from '@/features/timeline/components/chronicle/Chronicle';
import { ChronicleFrame } from '@/features/timeline/components/chronicle/ChronicleFrame';
import { TEXT_STRONG, TEXT_MUTED, SURFACE_CHIP, TEXT_INVERSE, BORDER_STRONG, FONT, SPACE, TOUCH_MIN } from '@/features/timeline/lib/tone';

export function DecadeView({ decade }: { decade: DecadeKey }) {
  const current = DECADES.find((d) => d.key === decade)!;
  const events = getDecadeEvents(decade);
  return (
    <ChronicleFrame kicker="그날로 떠나요 · 연대기" title={current.label} subtitle={`주요 사건 ${events.length}개`}>
      <nav aria-label="연대 이동" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: SPACE.sm, marginBottom: SPACE.xl }}>
        {DECADES.map((d) => {
          const active = d.key === decade;
          return (
            <Link
              key={d.key}
              href={`/timeline/decade/${d.key}`}
              aria-current={active ? 'page' : undefined}
              className="tl-focus"
              style={{
                display: 'inline-flex', alignItems: 'center', minHeight: TOUCH_MIN, padding: '0 18px', borderRadius: 9999, textDecoration: 'none',
                fontSize: FONT.meta, fontWeight: 700, background: active ? BORDER_STRONG : SURFACE_CHIP, color: active ? TEXT_INVERSE : TEXT_STRONG,
              }}
            >
              {d.label}
            </Link>
          );
        })}
        <Link
          href="/timeline/chronicle"
          className="tl-focus"
          style={{
            display: 'inline-flex', alignItems: 'center', minHeight: TOUCH_MIN, padding: '0 18px', borderRadius: 9999, textDecoration: 'none',
            fontSize: FONT.meta, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8',
          }}
        >
          전체 연대기 →
        </Link>
      </nav>
      {events.length === 0 ? (
        <p style={{ fontSize: FONT.meta, color: TEXT_MUTED, textAlign: 'center', padding: '40px 0' }}>이 연대의 사건을 준비하고 있어요.</p>
      ) : (
        <Chronicle events={events} showEra />
      )}
    </ChronicleFrame>
  );
}
