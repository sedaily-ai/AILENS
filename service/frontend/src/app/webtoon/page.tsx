import type { Metadata } from 'next';
import { fetchWebtoons } from '@/shared/lib/cmsPostsApi';
import { WebtoonListClient } from './WebtoonListClient';

export const metadata: Metadata = {
  title: '웹툰 | AI LENS',
  description: '요즘 이슈를 컷으로 이어 보여드려요.',
};

// 서버 컴포넌트로 전환(2026-08-07) — 이전엔 페이지 전체가 'use client'라
// 정적 HTML에 목록 스켈레톤만 구워지고 실제 웹툰 목록·링크는 하나도
// 없었다(SSG 감사 중 발견). 빌드타임에 fetchWebtoons()로 가져온 값을
// initialItems로 클라이언트 컴포넌트에 내려서 정적 HTML에 실제 목록이
// 바로 박히게 한다.
export default async function WebtoonListPage() {
  const items = await fetchWebtoons();
  return <WebtoonListClient initialItems={items} />;
}
