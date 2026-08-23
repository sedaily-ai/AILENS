import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ARCHIVE_MIN_DATE, fetchBigkindsDay, fetchDayArticles, kdate, isReadableOriginal } from '@/features/timeline';
import { TimelineDayClient } from './TimelineDayClient';

// 날짜별 고유 URL(2026-08-12, GEO 감사) — 예전엔 /timeline이 입력창 하나만
// 있고 실제 기사는 사용자가 날짜를 골라야만(클라이언트 fetch) 나타났다.
// AI 크롤러 상당수는 JS를 안 돌려서 이 페이지가 사실상 빈 화면으로
// 보였다. 날짜마다 진짜 URL을 주면 하루하루가 쌓일 때마다 색인 가능한
// 페이지가 늘어나는 아카이브가 된다(NewsTimeMachine.tsx가 되감기 애니메이션
// 후 여기로 router.push한다).
//
// 2026-08-17: S3 지면 아카이브(ARCHIVE_MIN_DATE=2026-02-01) 이전 날짜는 이
// 소스가 없다 — 대신 빅카인즈 뉴스 검색(날짜 범위 + provider=서울경제)으로
// 대체한다(features/news-feed의 NewsTimeMachineSection.tsx 홈 위젯과 같은
// 백엔드 엔드포인트). 처음엔 issue_ranking(토픽+키워드만)을 썼는데, 그 API의
// news_cluster로 기사 상세를 찾으면 신뢰도가 낮아서(같은 news_id에 0건/서버
// 오류가 섞여 나옴, 당일 날짜조차 그랬음) 날짜 범위 직접 검색으로 교체 —
// 제목·본문 스니펫·바이라인·원본 링크까지 나온다(발행 시각만 없음).
import { SITE_URL } from '@/shared/constants/site';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  if (!DATE_RE.test(date)) return { robots: { index: false } };

  const label = kdate(date);
  const isRecent = date >= ARCHIVE_MIN_DATE;
  const title = `${label}자 서울경제 — 뉴스 타임라인`;
  const description = `${label}, 서울경제를 비롯한 주요 언론이 다룬 경제 뉴스를 그날 지면 그대로 모아봅니다.`;

  const indexable = isRecent
    ? (await fetchDayArticles(date)).list.length > 0
    : (await fetchBigkindsDay(date)).articles.length > 0;

  return {
    title,
    description,
    // 기사가 없는 날은 색인에서 뺀다 — 얇은 페이지가 검색결과에 잡히는 걸
    // 막는다(letters/page.tsx 등 다른 페이지의 "가짜 신선도 금지" 원칙과
    // 같은 이유, sitemap.ts 주석 참조).
    //
    // indexable일 때 robots 키를 아예 안 넣는다 — `robots: undefined`를
    // 리턴하면 상위 layout.tsx의 robots(index:true, googleBot 옵션 포함)를
    // "물려받는" 게 아니라 그대로 덮어써서 robots 메타태그 자체가 통째로
    // 사라졌다(2026-08-17 발견, curl로 직접 확인). 키를 안 넣어야 실제로
    // 상속된다.
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
      // url 은 **실제로 기사에 닿는 것만** 넣는다(isReadableOriginal). 예전엔
      // "빈 값이 아니면" 통과였는데, 빅카인즈가 2015년 이전 기사에 주는
      // sednews.com 주소는 지금 기사가 아니라 서울경제 홈으로 리다이렉트된다
      // (2026-08-19 실측). 그걸 구조화 데이터에 실으면 크롤러에게 "이 기사는
      // 여기 있다"고 죽은 주소를 알려주는 셈이다.
      //
      // 다만 항목 자체를 빼지는 않는다. 그날 그 제목의 기사가 지면에 있었다는
      // 건 사실이고, schema.org 의 ListItem 은 url 없이 name 만으로도 유효하다.
      // 링크만 지우고 제목은 남기면 크롤러가 "무엇이 있었나"는 알 수 있다.
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

  if (date < ARCHIVE_MIN_DATE) {
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

  const { list } = await fetchDayArticles(date);
  const jsonLd = buildJsonLd(date, list);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TimelineDayClient date={date} initialArticles={list} />
    </>
  );
}
