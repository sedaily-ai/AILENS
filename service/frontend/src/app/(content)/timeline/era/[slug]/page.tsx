import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExitPill, EraView, SURFACE, GLOBAL_CSS } from '@/features/timeline';
import { ERAS, getEra } from '@/shared/data/timelineEvents';
import { SITE_URL } from '@/shared/constants/site';

// 시대 페이지(/timeline/era/{slug}) — 정적 데이터라 빌드 때 전부 만든다. 목록에 없는 slug는 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return ERAS.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const era = getEra((await params).slug);
  if (!era) return { robots: { index: false } };
  const title = `${era.title} 연표 (${era.period}) — 그날로 떠나요`;
  const description = (era.summary ?? era.events.map((e) => e.title).join(', ')).slice(0, 150);
  const url = `${SITE_URL}/timeline/era/${era.slug}`;
  return {
    title,
    description,
    keywords: [era.title, `${era.title} 연표`, '경제 사건', '서울경제', 'AI LENS'],
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'article', locale: 'ko_KR', siteName: 'AI LENS — 서울경제' },
  };
}

export default async function EraPage({ params }: { params: Promise<{ slug: string }> }) {
  const era = getEra((await params).slug);
  if (!era) notFound();

  const url = `${SITE_URL}/timeline/era/${era.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#collection`,
    url,
    name: `${era.title} 연표`,
    description: era.summary ?? era.events.map((e) => e.title).join(', '),
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: era.events.map((e, i) => ({
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
      <EraView era={era} />
    </div>
  );
}
