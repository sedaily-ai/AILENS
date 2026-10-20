import { NextResponse } from 'next/server';
import { fetchAllLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { widgetPayload } from '../widgetPayload';

// 최신 AI LENS 기사 — 기사 번호가 없는 화면(sedaily.ai 홈 등)에서 "MBTI로 읽기" 위젯이 항상 기사 미리보기와 버튼을 보여 주도록 쓴다.
// GET /api/widget/latest → /api/widget/lookup/... 과 같은 모양 { found, url, headline, image, date, formats[], typeFinderUrl }
const CORS = { 'Access-Control-Allow-Origin': '*' };

export async function GET() {
  const posts = await fetchAllLensPosts();
  const hit = posts.reduce<(typeof posts)[number] | null>((best, p) => (!best || p.date > best.date ? p : best), null);
  if (!hit) return NextResponse.json({ found: false }, { status: 503, headers: { ...CORS, 'Cache-Control': 'no-store' } });
  return NextResponse.json(
    widgetPayload({ id: hit.id, date: hit.date, category: hit.category, headline: hit.headline, image: hit.photo_image_url || hit.cover_image_url || null }),
    { headers: { ...CORS, 'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600' } },
  );
}
