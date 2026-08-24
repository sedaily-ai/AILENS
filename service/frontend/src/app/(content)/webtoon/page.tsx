import type { Metadata } from 'next';
import { fetchWebtoons } from '@/shared/lib/api/cmsPostsApi';
import { groupIntoSeries, type WebtoonSeries } from '@/shared/lib/webtoonSeries';
import { WebtoonListClient } from './WebtoonListClient';

const SITE_URL = 'https://ailens.sedaily.ai';
const TITLE = '웹툰 — 이슈를 컷으로';
// "흑백 펜화" 를 뺐다(2026-08-19) — 실제 그림은 전부 컬러다. 표지·컷 14장의
// HSV 채도를 재보니 평균 0.24~0.43, 유채색 픽셀 46~75% 였다. 검색 결과에
// 노출되는 문장이 콘텐츠와 다르면 톤 문제가 아니라 신뢰 문제다.
const DESCRIPTION =
  '서울경제 AI LENS가 요즘 경제·사회 이슈를 웹툰으로 옮깁니다. 성과급 갈등, 세제개편, AI 데이터센터 같은 뉴스를 여러 컷으로 이어 보여드려요.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ['웹툰', '뉴스 웹툰', '시사 웹툰', '경제 웹툰', 'AI LENS', '서울경제'],
  alternates: { canonical: `${SITE_URL}/webtoon` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/webtoon`,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 웹툰' }],
    locale: 'ko_KR',
    siteName: 'AI LENS — 서울경제',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}/og-image.png`],
  },
};

// 서버 컴포넌트로 전환(2026-08-07) — 이전엔 페이지 전체가 'use client'라
// 정적 HTML에 목록 스켈레톤만 구워지고 실제 웹툰 목록·링크는 하나도
// 없었다(SSG 감사 중 발견). fetchWebtoons()로 가져온 값을 initialItems로
// 클라이언트 컴포넌트에 내려서 HTML에 실제 목록이 바로 박히게 한다.
// force-dynamic을 걸었다가(새 웹툰이 목록에 안 보이는 문제를 겪은 뒤) 다시
// 뺐다(2026-08-08). fetchWebtoons()는 이제 무캐시(2026-08-09,
// cmsPostsApi.ts 상단 주석 참조 — 태그 캐시가 revalidateTag(tag,'max')의
// 오해로 최대 30일 스테일을 낼 수 있는 버그였다)라 force-dynamic 여부와
// 무관하게 항상 최신 데이터를 받는다.
//
// SEO 감사(2026-08-11) — 목록 페이지 메타데이터가 title/description 두 줄뿐
// 이라 상세 페이지([slug]/page.tsx)에 비해 크게 부실했다. canonical·OG·
// Twitter·CollectionPage JSON-LD를 상세 페이지와 같은 수준으로 채웠다.
//
// 시리즈 재구조화(2026-08-21) — ItemList가 예전엔 "편"을 나열했는데, 이제
// 목록 화면 자체가 시리즈 단위라 링크 대상도 시리즈 상세(/webtoon/series/*)
// 로 맞춘다 — 실제 화면에 보이는 카드와 JSON-LD가 가리키는 URL이 어긋나면
// 검색엔진이 클릭 후 다른 페이지를 보게 된다.
function buildJsonLd(series: WebtoonSeries[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/webtoon#collection`,
    url: `${SITE_URL}/webtoon`,
    name: TITLE,
    description: DESCRIPTION,
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
      itemListElement: series.slice(0, 20).map((s, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/webtoon/series/${encodeURIComponent(s.slug)}`,
        name: s.title,
      })),
    },
  };
}

// 페이지네이션을 진짜 URL로(2026-08-14, GEO 감사) — /lens와 동일 원인·동일
// 수정: onClick+useState라 서버 첫 HTML엔 최신화+12개만 <a href>로 존재하고
// 나머지는 크롤러가 못 밟았다.
// cat 파라미터(2026-08-21) — 카테고리 칩도 page 와 같은 방식으로 URL 상태다.
// 클라이언트 useState 로 걸러버리면 (a) 크롤러가 카테고리별 목록을 못 밟고
// (b) 뒤로가기가 필터를 기억하지 못한다. 값 검증은 클라이언트가 한다 —
// 데이터에 실제로 존재하는 라벨만 활성 처리하고 나머지는 전체로 떨어진다.
export default async function WebtoonListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; cat?: string }>;
}) {
  const { page, cat } = await searchParams;
  const items = await fetchWebtoons();
  const jsonLd = buildJsonLd(groupIntoSeries(items));
  const initialPage = Math.max(1, parseInt(page ?? '1', 10) || 1);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <WebtoonListClient initialItems={items} initialPage={initialPage} initialCategory={cat} />
    </>
  );
}
