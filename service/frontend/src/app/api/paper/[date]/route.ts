import { NextResponse } from 'next/server';
import { fetchLensPostsOnDate, toLensPreviewSummaries } from '@/shared/lib/api/cmsPostsApi';
import { pickLensPostsForHome } from '@/shared/lib/content/homeFeedTrim';

// 홈 지면 카드의 ◀ ▶가 부르는 "그날의 지면 16건" — 브라우저가 CMS 목록 API에서 하루치 전체(약 64KB, 기사 36건)를 받아 직접 줄이지 않도록 서버가 줄여 보낸다(약 1/5).
// 응답은 CDN·브라우저가 5분 보관한다(지난 날은 사실상 바뀌지 않는다).
export async function GET(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ posts: [] }, { status: 400 });
  const posts = toLensPreviewSummaries(pickLensPostsForHome(await fetchLensPostsOnDate(date)));
  return NextResponse.json(
    { posts },
    { headers: { 'Cache-Control': posts.length > 0 ? 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' : 'no-store' } },
  );
}
