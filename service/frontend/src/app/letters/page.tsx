import type { Metadata } from 'next';
import { fetchCmsPosts } from '@/shared/lib/cmsPostsApi';
import { buildArchiveItems, PAGE_SIZE, type ArchiveItem } from '@/shared/lib/archiveItems';
import { LettersArchiveClient } from './LettersArchiveClient';

// 라벨 워딩 개편(2026-08-12, headerTabs.ts 주석 참조) — 나브 탭 라벨은
// "브리핑"으로 바뀌었지만 URL(/letters)·기반 데이터(channel=letters)는
// 그대로라 본문 설명·keywords에서는 "레터"를 계속 자연스럽게 쓴다(실제
// 뉴스레터 형태로 발행되는 콘텐츠라는 사실 자체는 안 바뀜).
const SITE_URL = 'https://ailens.sedaily.ai';
const TITLE = '브리핑 — 그날의 핵심을 한 통으로';
const DESCRIPTION = 'AI LENS가 매일 아침 정리해 보내드리는 경제 뉴스 브리핑 한 통. 그날의 핵심 경제·시사 이슈를 놓치지 않도록 요약해드립니다. 지금까지 발행된 모든 레터를 한 곳에서 다시 볼 수 있습니다.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // GEO 감사(2026-08-12) — 검색엔진·AI 크롤러가 이 페이지를 더 잘 찾도록
  // 키워드 커버리지를 넓혔다(동의어·관련 검색어 포함). 자연스러운 한국어
  // 조합만 골랐다 — 관련 없는 단어를 억지로 채우면 오히려 스팸으로
  // 판단돼 역효과가 난다.
  keywords: ['AI LENS 브리핑', '경제 브리핑', '오늘의 경제뉴스', '경제 뉴스레터', 'AI 뉴스 요약', '데일리 경제뉴스', '시사 브리핑', '아침 브리핑', '경제 뉴스 정리', '서울경제'],
  alternates: { canonical: `${SITE_URL}/letters` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/letters`,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS' }],
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
// 정적 HTML에 목록 스켈레톤만 구워지고 실제 아카이브 목록은 하나도
// 없었다(SSG 감사 중 발견). 가져온 값을 initialItems로 클라이언트
// 컴포넌트에 내려서 HTML에 실제 목록·링크가 바로 박히게 한다.
// force-dynamic을 걸었다가(SSR 전환 직후) 다시 뺐다(2026-08-08). 지금은
// cmsPostsApi.ts 쪽이 무캐시(2026-08-09)라 force-dynamic 여부와 무관하게
// 항상 최신 데이터를 받는다 — 상세 경위는 cmsPostsApi.ts 상단 주석 참조.

// 콘텐츠 타입별 페이지 분리(2026-08-11) — 예전엔 이 페이지 하나가 레터·
// 트렌드·칼럼·영상을 전부 탭으로 섞어 보여줬다. en.sedaily.com처럼 타입마다
// 진짜 URL을 쪼개면(레터→/letters, 트렌드→/trend, 칼럼→/column, 영상→
// /video, 전체→/archive) 검색엔진·AI가 "레터 모아보기"를 별개 카테고리
// 페이지로 인식할 수 있다. 이 페이지는 이제 레터만 — 트렌드/칼럼 카드는
// fetchTrendCards/fetchVideos 자체를 안 불러도 되니 더 가벼워졌다.
function buildJsonLd(items: ArchiveItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/letters#collection`,
    url: `${SITE_URL}/letters`,
    name: TITLE,
    description: DESCRIPTION,
    keywords: 'AI LENS 브리핑, 경제 브리핑, 오늘의 경제뉴스, 경제 뉴스레터, AI 뉴스 요약, 데일리 경제뉴스, 시사 브리핑, 서울경제',
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    // 공신력 신호(2026-08-12) — 목록 페이지도 상세 페이지(letters/[id] 등)와
    // 같은 author Organization을 명시해 "서울경제신문이 검수한다"는 관계를
    // 목록 단계에서부터 드러낸다.
    author: {
      '@type': 'Organization',
      name: 'AI LENS 편집팀',
      description: '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 요약·재구성한 초안을 작성하고, 편집팀이 검수해 발행합니다.',
      url: `${SITE_URL}/about`,
      parentOrganization: { '@id': `${SITE_URL}/#organization` },
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items
        .filter((it) => it.href)
        .slice(0, 20)
        .map((it, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: it.external ? it.href! : `${SITE_URL}${it.href}`,
          name: it.title,
        })),
    },
  };
}

export default async function LettersArchivePage() {
  const letters = await fetchCmsPosts('letters', undefined, PAGE_SIZE);
  const initialItems = buildArchiveItems(letters, [], []).filter((it) => it.kind === 'letter');
  const jsonLd = buildJsonLd(initialItems);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LettersArchiveClient initialItems={initialItems} />
    </>
  );
}
