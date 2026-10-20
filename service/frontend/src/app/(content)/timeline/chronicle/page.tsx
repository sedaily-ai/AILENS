import type { Metadata } from 'next';
import Link from 'next/link';
import { ExitPill, ChronicleExplorer, SURFACE, GLOBAL_CSS } from '@/features/timeline';

// 전체 사건 목록 — Lens 톤(features/timeline/lib/tone.ts 와 같은 값).
const TEXT_STRONG = '#111827';
const TEXT_BODY = '#374151';
const TEXT_MUTED = '#6b7280';
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

// 연대 묶음을 넓은 화면에서 2열(1990·2000년대 / 2010·2020년대)로 놓는다. 한 열 약 540px ≈ 14px 한글 38자라 한 줄 길이 기준(25~40자)에 맞는다.
// 좁은 화면은 2열이면 한 줄이 10자 남짓이 돼 1열로 둔다.
const LIST_CSS = `
.cl-decades{display:grid;grid-template-columns:minmax(0,1fr);gap:24px 48px}
@media (min-width:860px){.cl-decades{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

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
      {/* 연대기는 1180px 컨테이너(좌우 28px) — 알약을 조작 줄·차트 왼쪽 끝(1124px 폭)에 맞춘다. */}
      <ExitPill column={1124} />
      <ChronicleExplorer />

      <section aria-labelledby="all-events" style={{ maxWidth: 1180, margin: '0 auto', padding: '0 clamp(16px,3vw,28px) 72px' }}>
        <style>{LIST_CSS}</style>
        <h2 id="all-events" style={{ fontSize: 20, fontWeight: 800, margin: '8px 0 16px', color: TEXT_STRONG }}>전체 사건 목록</h2>
        <div className="cl-decades">
          {DECADES.map((d) => (
            <div key={d.key}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: TEXT_STRONG, marginBottom: 8 }}>
                <Link href={`/timeline/decade/${d.key}`} className="tl-focus" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 4 }}>{d.label}</Link>
              </h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 14, lineHeight: 1.9, color: TEXT_BODY, wordBreak: 'keep-all' }}>
                {getDecadeEvents(d.key).map((e) => (
                  <li key={e.id}>
                    <span style={{ color: TEXT_MUTED, fontVariantNumeric: 'tabular-nums' }}>{formatEventDate(e.date, e.endDate)}</span>
                    {' · '}
                    {e.title}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
