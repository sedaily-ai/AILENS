// /timeline 입구 — 연대 카드와 시대 카드. 날짜를 몰라도 사건으로 들어갈 수 있게 대표 사건 이름을 미리 보여준다.
import Link from 'next/link';
import { DECADES, ERAS, getDecadeEvents } from '@/shared/data/timelineEvents';
import { SURFACE_SUNKEN, TEXT_STRONG, TEXT_MUTED, BORDER_HAIRLINE, FONT, SPACE, CONTAINER_MAX } from '@/features/timeline/lib/tone';

const cardStyle = { display: 'block', background: SURFACE_SUNKEN, border: `1px solid ${BORDER_HAIRLINE}`, borderRadius: 14, padding: '16px 18px', textDecoration: 'none' } as const;

export function HubCards() {
  return (
    <div style={{ maxWidth: CONTAINER_MAX, margin: '0 auto', padding: `${SPACE.xxl}px clamp(20px, 5vw, 32px) ${SPACE.xxl}px` }}>
      <Link
        href="/timeline/chronicle"
        className="tl-focus"
        style={{
          display: 'block', marginBottom: SPACE.xl, padding: '22px 24px', borderRadius: 16, textDecoration: 'none', color: '#fff',
          background: 'linear-gradient(135deg, #0b1220 0%, #1e3a8a 100%)',
        }}
      >
        <p style={{ fontSize: FONT.caption, letterSpacing: '0.16em', color: '#93a4c3' }}>연대기 탐험</p>
        <p style={{ fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>1990 → 2026</p>
        <p style={{ fontSize: FONT.meta, color: '#cbd5e1', lineHeight: 1.6, wordBreak: 'keep-all' }}>
          사건 79개를 연표로 훑고, 눌러서 그 무렵 서울경제 기사로 들어가 보세요. →
        </p>
      </Link>
      <section aria-labelledby="decade-heading" style={{ marginBottom: SPACE.xl }}>
        <h2 id="decade-heading" style={{ fontSize: FONT.sectionTitle, fontWeight: 800, color: TEXT_STRONG, marginBottom: SPACE.md }}>연대기로 떠나기</h2>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {DECADES.map((d) => {
            const events = getDecadeEvents(d.key);
            const names = events.filter((e) => e.shortTitle).slice(0, 4).map((e) => e.shortTitle).join(' · ');
            return (
              <li key={d.key}>
                <Link href={`/timeline/decade/${d.key}`} className="tl-focus" style={cardStyle}>
                  <p style={{ fontSize: FONT.sectionTitle, fontWeight: 800, color: TEXT_STRONG }}>{d.label}</p>
                  <p style={{ fontSize: FONT.caption, color: TEXT_MUTED, margin: '2px 0 6px' }}>사건 {events.length}개</p>
                  {names && <p style={{ fontSize: FONT.meta, color: TEXT_MUTED, lineHeight: 1.6, wordBreak: 'keep-all' }}>{names}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="era-heading">
        <h2 id="era-heading" style={{ fontSize: FONT.sectionTitle, fontWeight: 800, color: TEXT_STRONG, marginBottom: SPACE.md }}>시대로 떠나기</h2>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {ERAS.map((era) => (
            <li key={era.slug}>
              <Link href={`/timeline/era/${era.slug}`} className="tl-focus" style={cardStyle}>
                <p style={{ fontSize: FONT.caption, color: TEXT_MUTED, fontVariantNumeric: 'tabular-nums' }}>{era.period}</p>
                <p style={{ fontSize: FONT.sectionTitle, fontWeight: 800, color: TEXT_STRONG, margin: '2px 0 6px' }}>{era.title}</p>
                <p style={{ fontSize: FONT.meta, color: TEXT_MUTED }}>사건 {era.events.length}개</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
