import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExitPill, DecadeView, SURFACE, GLOBAL_CSS } from '@/features/timeline';
import { DECADES, getDecadeEvents, isDecadeKey } from '@/shared/data/timelineEvents';
import { SITE_URL } from '@/shared/constants/site';

// 연대 페이지(/timeline/decade/{1990s|2000s|2010s|2020s}) — 정적 데이터라 빌드 때 전부 만든다.
export const dynamicParams = false;

export function generateStaticParams() {
  return DECADES.map((d) => ({ decade: d.key }));
}

export async function generateMetadata({ params }: { params: Promise<{ decade: string }> }): Promise<Metadata> {
  const { decade } = await params;
  if (!isDecadeKey(decade)) return { robots: { index: false } };
  const label = DECADES.find((d) => d.key === decade)!.label;
  const events = getDecadeEvents(decade);
  const title = `${label} 경제 사건 연표 — 그날로 떠나요`;
  const description = `${label}의 주요 경제·사회 사건을 연도별로 정리하고, 사건 무렵 서울경제가 쓴 기사로 이어집니다. ${events.slice(0, 5).map((e) => e.shortTitle ?? e.title).join(', ')} 등.`.slice(0, 160);
  const url = `${SITE_URL}/timeline/decade/${decade}`;
  return {
    title,
    description,
    keywords: [`${label} 경제 연표`, `${label} 주요 사건`, '경제 사건', '서울경제', 'AI LENS'],
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'article', locale: 'ko_KR', siteName: 'AI LENS — 서울경제' },
  };
}

export default async function DecadePage({ params }: { params: Promise<{ decade: string }> }) {
  const { decade } = await params;
  if (!isDecadeKey(decade)) notFound();

  const label = DECADES.find((d) => d.key === decade)!.label;
  const url = `${SITE_URL}/timeline/decade/${decade}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#collection`,
    url,
    name: `${label} 경제 사건 연표`,
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: getDecadeEvents(decade).map((e, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: e.title,
        description: e.description,
        ...(e.paperDate ? { url: `${SITE_URL}/timeline/${e.paperDate}` } : {}),
      })),
    },
  };

  return (
    <div className="min-h-screen" style={{ background: SURFACE }}>
      <style>{GLOBAL_CSS}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ExitPill />
      <DecadeView decade={decade} />
    </div>
  );
}
