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
// force-dynamic(SSR, 2026-08-08) — 새 웹툰을 발행했는데도 이 목록 페이지가
// 안 바뀌는 문제(재빌드해도 Next 자체 캐시 때문에 재발)를 겪은 뒤 확정한
// 설정. 명시 안 하면 fetch()에 캐시 옵션이 없어 Next가 빌드/최초 요청 시점
// 결과를 정적으로 캐싱해버린다.
export const dynamic = 'force-dynamic';

export default async function WebtoonListPage() {
  const items = await fetchWebtoons();
  return <WebtoonListClient initialItems={items} />;
}
