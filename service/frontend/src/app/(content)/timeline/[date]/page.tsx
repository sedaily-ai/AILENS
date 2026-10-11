import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isReadableOriginal } from '@/features/timeline';
import { fetchBigkindsDay, fetchDayArticles } from '@/shared/lib/api/timelineApi';
import { isArchiveDate } from '@/shared/constants/timeline';
import { kdate } from '@/shared/lib/date/timelineDates';
import { TimelineDayClient } from './TimelineDayClient';

// 날짜별 고유 URL. 클라이언트 fetch로만 기사가 나타나는 입력창 페이지는 JS를 실행하지 않는 AI 크롤러에 빈 화면이므로 날짜마다 서버 렌더되는 URL을 둔다.
// NewsTimeMachine.tsx가 되감기 애니메이션 후 여기로 router.push한다.
//
// S3 지면 아카이브(ARCHIVE_MIN_DATE=2026-02-01) 이전 날짜는 빅카인즈 뉴스 검색(날짜 범위 + provider=서울경제)으로 대체한다(features/news-feed의 NewsTimeMachineSection.tsx 홈 위젯과 같은 엔드포인트).
// issue_ranking의 news_cluster 기사 상세는 신뢰도가 낮아(같은 news_id에 0건/서버 오류 혼재) 날짜 범위 직접 검색을 쓴다. 제목·본문 스니펫·바이라인·원본 링크가 나오며 발행 시각만 없다.
import { SITE_URL } from '@/shared/constants/site';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// generateStaticParams가 없으면 Next의 'auto' 모드가 이 라우트를 정적/ISR로 렌더할 근거가 없어 전부 SSR-only(ƒ)가 된다. 아래 설정으로 ISR 렌더를 유도한다.
export const revalidate = 300;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  if (!DATE_RE.test(date)) return { robots: { index: false } };

  const label = kdate(date);
  const isRecent = isArchiveDate(date);
  const title = `${label}자 서울경제 — 뉴스 타임라인`;
  const description = `${label}, 서울경제를 비롯한 주요 언론이 다룬 경제 뉴스를 그날 그대로 모아봅니다.`;

  const indexable = isRecent
    ? (await fetchDayArticles(date)).length > 0
    : (await fetchBigkindsDay(date)).articles.length > 0;

  return {
    title,
    description,
    // 기사가 없는 날은 색인에서 뺀다(얇은 페이지 방지, sitemap.ts 참조).
    //
    // indexable일 때는 robots 키를 넣지 않는다. `robots: undefined`를 리턴하면 상위 layout.tsx의 robots를 상속하지 않고 덮어써 robots 메타태그가 사라진다.
    ...(indexable ? {} : { robots: { index: false } }),
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

function buildJsonLd(date: string, articles: { title: string; original_link: string | null }[]) {
  const label = kdate(date);
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/timeline/${date}#collection`,
    url: `${SITE_URL}/timeline/${date}`,
    name: `${label}자 서울경제 — 뉴스 타임라인`,
    description: `${label}, 서울경제를 비롯한 주요 언론이 다룬 경제 뉴스를 그날 그대로 모아봅니다.`,
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    author: {
      '@type': 'Organization',
      name: 'AI LENS 편집팀',
      description: '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 레터·웹툰·팟캐스트·영상을 자동으로 만들어 발행하고, 편집팀이 발행 후 점검해 오류를 바로잡습니다.',
      url: `${SITE_URL}/about`,
      parentOrganization: { '@id': `${SITE_URL}/#organization` },
    },
    mainEntity: {
      '@type': 'ItemList',
      // url은 실제로 기사에 닿는 것만 넣는다(isReadableOriginal). 빅카인즈가 2015년 이전 기사에 주는 sednews.com 주소는 서울경제 홈으로 리다이렉트되어 죽은 주소를 알리게 된다.
      //
      // 항목 자체는 빼지 않는다. schema.org ListItem은 url 없이 name만으로도 유효하며, 제목만 남기면 크롤러가 "무엇이 있었나"를 알 수 있다.
      itemListElement: articles.slice(0, 30).map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: a.title,
        ...(isReadableOriginal(a.original_link) ? { url: a.original_link } : {}),
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

  if (!isArchiveDate(date)) {
    const { articles, investments } = await fetchBigkindsDay(date);
    const jsonLd = buildJsonLd(date, articles);
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <TimelineDayClient date={date} initialBigkindsArticles={articles} initialInvestments={investments} />
      </>
    );
  }

  const articles = await fetchDayArticles(date);
  const jsonLd = buildJsonLd(date, articles);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TimelineDayClient date={date} initialArticles={articles} />
    </>
  );
}
