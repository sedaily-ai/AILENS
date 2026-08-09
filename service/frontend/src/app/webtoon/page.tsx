import type { Metadata } from 'next';
import { fetchWebtoons } from '@/shared/lib/cmsPostsApi';
import { WebtoonListClient } from './WebtoonListClient';

export const metadata: Metadata = {
  title: '웹툰',
  description: '요즘 이슈를 컷으로 이어 보여드려요.',
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

export default async function WebtoonListPage() {
  const items = await fetchWebtoons();
  return <WebtoonListClient initialItems={items} />;
}
