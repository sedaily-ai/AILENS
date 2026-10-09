import { NextResponse } from 'next/server';
import { fetchPaperDates } from '@/shared/lib/api/cmsPostsApi';
import { SITE_URL } from '@/shared/constants/site';
import { paperPath } from './paperShared';

// /paper — 가장 최근에 지면이 편성된 날로 보낸다. 최신 날짜가 매일 바뀌므로 영구(308)가 아니라 임시 이동(307)이다.
// 예전엔 page.tsx에서 redirect()를 불렀는데, 같은 폴더의 loading.tsx 때문에 응답이 스트리밍으로 시작되어 HTTP 200 + meta refresh로 나갔다
// (크롤러는 title·canonical이 홈인 빈 페이지로 봄). 라우트 핸들러는 처음부터 실제 307 헤더를 보낸다.
export const revalidate = 300;

export async function GET() {
  const dates = await fetchPaperDates();
  if (dates.length === 0) return new NextResponse('Not Found', { status: 404 });
  return NextResponse.redirect(new URL(paperPath(dates[0]), SITE_URL), 307);
}
