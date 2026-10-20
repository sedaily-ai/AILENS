import { NextResponse } from 'next/server';
import { fetchAllLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { SITE_URL } from '@/shared/constants/site';
import { LENS_PERSPECTIVES } from '@/shared/constants/lensPerspectives';
import { seoHeadline, lensPath } from '@ailens/domain';

// 최신 AI LENS 기사 — 기사 번호가 없는 화면(sedaily.ai 홈 등)에서 "MBTI로 읽기" 위젯이 항상 버튼을 보여 주도록 쓴다.
// GET /api/widget/latest → /api/widget/lookup/... 과 같은 모양 { found, url, headline, formats[], typeFinderUrl }
const CORS = { 'Access-Control-Allow-Origin': '*' };

export async function GET() {
  const posts = await fetchAllLensPosts();
  const hit = posts.reduce<(typeof posts)[number] | null>((best, p) => (!best || p.date > best.date ? p : best), null);
  if (!hit) return NextResponse.json({ found: false }, { status: 503, headers: { ...CORS, 'Cache-Control': 'no-store' } });
  const url = `${SITE_URL}${lensPath(hit)}`;
  return NextResponse.json(
    {
      found: true,
      url,
      headline: seoHeadline(hit.headline),
      formats: LENS_PERSPECTIVES.map((p, i) => ({ label: p.short, who: p.full, color: p.color, url: `${url}?v=${i + 1}` })),
      typeFinderUrl: `${SITE_URL}/start`,
    },
    { headers: { ...CORS, 'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600' } },
  );
}
