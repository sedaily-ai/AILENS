import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchDayArticles, kdate } from '@/features/timeline';
import { TimelineDayClient } from './TimelineDayClient';

// 날짜별 고유 URL(2026-08-12, GEO 감사) — 예전엔 /timeline이 입력창 하나만
// 있고 실제 기사는 사용자가 날짜를 골라야만(클라이언트 fetch) 나타났다.
// AI 크롤러 상당수는 JS를 안 돌려서 이 페이지가 사실상 빈 화면으로
// 보였다. 날짜마다 진짜 URL을 주면 하루하루가 쌓일 때마다 색인 가능한
// 페이지가 늘어나는 아카이브가 된다(NewsTimeMachine.tsx가 되감기 애니메이션
// 후 여기로 router.push한다).
const SITE_URL = 'https://ailens.sedaily.ai';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  if (!DATE_RE.test(date)) return { robots: { index: false } };

  const label = kdate(date);
  const title = `${label}자 서울경제 — 뉴스 타임라인`;
  const description = `${label}, 서울경제를 비롯한 주요 언론이 다룬 경제 뉴스를 그날 지면 그대로 모아봅니다.`;
  const { list } = await fetchDayArticles(date);

  return {
    title,
    description,
    // 기사가 없는 날은 색인에서 뺀다 — 얇은 페이지가 검색결과에 잡히는 걸
    // 막는다(letters/page.tsx 등 다른 페이지의 "가짜 신선도 금지" 원칙과
    // 같은 이유, sitemap.ts 주석 참조).
    robots: list.length === 0 ? { index: false } : undefined,
    keywords: ['뉴스 타임라인', '경제 뉴스 아카이브', `${label} 뉴스`, '서울경제', 'AI LENS'],
    alternates: { canonical: `${SITE_URL}/timeline/${date}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/timeline/${date}`,
      type: 'website',
      images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS' }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${SITE_URL}/og-image.png`],
    },
  };
}

function buildJsonLd(date: string, articles: { title: string; original_link: string }[]) {
  const label = kdate(date);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/timeline/${date}#collection`,
    url: `${SITE_URL}/timeline/${date}`,
    name: `${label}자 서울경제 — 뉴스 타임라인`,
    description: `${label}, 서울경제를 비롯한 주요 언론이 다룬 경제 뉴스를 그날 지면 그대로 모아봅니다.`,
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    author: {
      '@type': 'Organization',
      name: 'AI LENS 편집팀',
      description: '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 요약·재구성한 초안을 작성하고, 편집팀이 검수해 발행합니다.',
      url: `${SITE_URL}/about`,
      parentOrganization: { '@id': `${SITE_URL}/#organization` },
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: articles
        .filter((a) => a.original_link && a.original_link !== '#')
        .slice(0, 30)
        .map((a, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: a.original_link,
          name: a.title,
        })),
    },
  };
}

export default async function TimelineDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();

  const { list, source, degraded } = await fetchDayArticles(date);
  const jsonLd = buildJsonLd(date, list);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TimelineDayClient date={date} initialArticles={list} initialSource={source} initialDegraded={degraded} />
    </>
  );
}
