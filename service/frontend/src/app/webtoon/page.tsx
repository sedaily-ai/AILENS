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
// 뺐다(2026-08-08) — fetchWebtoons()가 이제 posts:webtoon 태그로 캐시되고,
// admin 발행 시 POST /api/revalidate 가 그 태그를 revalidateTag() 로 정확히
// 깬다. force-dynamic으로 매 요청 강제 재렌더링하면 <Link> 프리페치가
// 무력화돼 "클릭 즉시 이동" 요구와 충돌한다.

export default async function WebtoonListPage() {
  const items = await fetchWebtoons();
  return <WebtoonListClient initialItems={items} />;
}
