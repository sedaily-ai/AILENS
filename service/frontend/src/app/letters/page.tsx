import type { Metadata } from 'next';
import { fetchCmsPosts, fetchTrendCards, fetchVideos } from '@/shared/lib/cmsPostsApi';
import { LettersArchiveClient } from './LettersArchiveClient';
import { buildArchiveItems, PAGE_SIZE } from './archiveItems';

export const metadata: Metadata = {
  title: '지금까지의 모든 콘텐츠 | AI LENS',
  description: 'AI LENS가 정리한 레터·트렌드·칼럼·영상을 한 곳에서 모아봅니다.',
};

// 서버 컴포넌트로 전환(2026-08-07) — 이전엔 페이지 전체가 'use client'라
// 정적 HTML에 목록 스켈레톤만 구워지고 실제 아카이브 목록은 하나도
// 없었다(SSG 감사 중 발견). 빌드타임에 가져온 값을 initialItems로
// 클라이언트 컴포넌트에 내려서 정적 HTML에 실제 목록·링크가 바로 박히게 한다.
export default async function LettersArchivePage() {
  const [letters, cards, videos] = await Promise.all([
    fetchCmsPosts('letters', undefined, PAGE_SIZE),
    fetchTrendCards(),
    fetchVideos(),
  ]);
  const initialItems = buildArchiveItems(letters, cards, videos);
  return <LettersArchiveClient initialItems={initialItems} />;
}
