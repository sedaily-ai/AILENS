import type { Metadata } from 'next';
import { fetchCmsPosts, fetchTrendCards, fetchVideos } from '@/shared/lib/cmsPostsApi';
import { LettersArchiveClient } from './LettersArchiveClient';
import { buildArchiveItems, PAGE_SIZE } from './archiveItems';

const SITE_URL = 'https://ailens.sedaily.ai';
const TITLE = '지금까지의 모든 콘텐츠';
const DESCRIPTION = 'AI LENS가 정리한 레터·트렌드·칼럼·영상을 한 곳에서 모아봅니다.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
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

export default async function LettersArchivePage() {
  const [letters, cards, videos] = await Promise.all([
    fetchCmsPosts('letters', undefined, PAGE_SIZE),
    fetchTrendCards(),
    fetchVideos(),
  ]);
  const initialItems = buildArchiveItems(letters, cards, videos);
  return <LettersArchiveClient initialItems={initialItems} />;
}
