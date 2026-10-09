import { NextResponse } from 'next/server';
import { fetchAllLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { displayHeadline } from '@/shared/lib/content/displayHeadline';
import { pickLensPhoto } from '@/shared/constants/lensPerspectives';
import type { SearchRecord } from '@/shared/lib/search/searchIndex';

// 일반 검색용 가벼운 목록 — 제목·요약·분류·날짜·썸네일만 담는다(기사 본문 제외, shared/lib/search/searchIndex.ts 참조).
// 5분마다 다시 만든다(기사 목록 캐시 TTL과 같은 값 — route segment config는 import한 상수를 쓸 수 없어 리터럴로 적는다).
export const revalidate = 300;

const SUMMARY_MAX = 120;

export async function GET() {
  const posts = await fetchAllLensPosts();
  if (posts.length === 0) {
    // 목록 API가 일시적으로 비면 빈 응답을 캐시에 굳히지 않는다.
    return NextResponse.json({ items: [] }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const items: SearchRecord[] = posts.map((p) => ({
    i: p.id,
    h: displayHeadline(p.headline),
    s: (p.context ?? '').slice(0, SUMMARY_MAX),
    c: p.category ?? '',
    u: p.subcategory ?? '',
    d: p.date,
    t: p.published_at ?? '',
    p: pickLensPhoto(p) || p.cover_image_url || '',
  }));
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
}
