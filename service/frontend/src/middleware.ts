import { NextResponse, type NextRequest } from 'next/server';

// /lens?page=N, /webtoon?page=N 옛 링크 정리(2026-08-23) — next.config.ts의
// redirects()+has 조합으로 먼저 시도했는데, Next가 has로 매칭한 쿼리를
// destination에 :page로 다시 꽂아 넣어도 원본 쿼리스트링을 그대로 남겨서
// "/lens/page/2?page=2"처럼 지저분한 URL이 됐다(has 캡처 그룹이 "사용됨"으로
// 안 잡히는 걸로 보임). 미들웨어에서 직접 새 URL을 만들면 이 문제가 없다 —
// 이 두 경로에서만 돈다(matcher로 스코프 한정, 다른 라우트의 캐시/렌더링에는
// 영향 없음).
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const page = searchParams.get('page');
  if (!page || !/^\d+$/.test(page)) return NextResponse.next();

  const n = parseInt(page, 10);
  const base = pathname === '/lens' ? '/lens' : '/webtoon';
  const destination = n <= 1 ? base : `${base}/page/${n}`;
  const url = request.nextUrl.clone();
  url.pathname = destination;
  url.search = '';
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ['/lens', '/webtoon'],
};
