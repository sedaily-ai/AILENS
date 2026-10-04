import type { Metadata } from 'next';
import Link from 'next/link';
import { ExitPill, ChronicleExplorer, SURFACE, GLOBAL_CSS } from '@/features/timeline';
import { DECADES, EVENTS, getDecadeEvents } from '@/shared/data/timelineEvents';
import { formatEventDate } from '@/shared/lib/date/timelineDates';
import { SITE_URL } from '@/shared/constants/site';

// 연대기 탐험(/timeline/chronicle) — 1990년부터 지금까지 사건을 가로 연표로 훑는 인터랙티브 페이지.
// 크롤러와 스크린리더를 위해 모든 사건을 아래에 일반 목록으로도 싣는다(JS 없이 읽히는 본문).
const TITLE = '1990년부터 2026년까지 한국 경제 연대기 — 그날로 떠나요';
const DESCRIPTION = `${EVENTS.length}개 사건을 연표로 훑고, 사건 무렵 서울경제 기사를 바로 읽어보세요. IMF 외환위기, 글로벌 금융위기, 코로나 쇼크, 12·3 계엄까지.`;
const URL = `${SITE_URL}/timeline/chronicle`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ['한국 경제 연대기', '경제 사건 연표', 'IMF 외환위기 연표', '글로벌 금융위기', '서울경제', 'AI LENS'],
  alternates: { canonical: URL },
  openGraph: { title: TITLE, description: DESCRIPTION, url: URL, type: 'website', locale: 'ko_KR', siteName: 'AI LENS — 서울경제' },
};

export default function ChroniclePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${URL}#collection`,
    url: URL,
    name: TITLE,
    description: DESCRIPTION,
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: [...EVENTS].sort((a, b) => a.date.localeCompare(b.date)).map((e, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: e.title,
        description: e.description,
        ...(e.paperDate ? { url: `${SITE_URL}/timeline/${e.paperDate}` } : {}),
      })),
    },
  };

  return (
    <div style={{ background: SURFACE, minHeight: '100vh' }}>
      <style>{GLOBAL_CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ExitPill />
      <ChronicleExplorer />

      <section aria-labelledby="all-events" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 clamp(16px,4vw,28px) 72px' }}>
        <h2 id="all-events" style={{ fontSize: 20, fontWeight: 800, margin: '8px 0 16px', color: '#0f172a' }}>전체 사건 목록</h2>
        {DECADES.map((d) => (
          <div key={d.key} style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#334155', marginBottom: 8 }}>
              <Link href={`/timeline/decade/${d.key}`} style={{ color: 'inherit' }}>{d.label}</Link>
            </h3>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 14, lineHeight: 1.9, color: '#334155' }}>
              {getDecadeEvents(d.key).map((e) => (
                <li key={e.id}>
                  <span style={{ color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{formatEventDate(e.date, e.endDate)}</span>
                  {' · '}
                  {e.title}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
