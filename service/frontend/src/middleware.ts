import { NextResponse, type NextRequest } from 'next/server';

// 목록 페이지네이션 라우트: /{base}/page/{n}에서 n<=1이면 베이스 경로로 리다이렉트한다.
// 각 page/[n]/page.tsx에서 next/navigation의 redirect()를 호출하면 Next.js가 "Dynamic API" 사용으로 인식해 라우트 전체를 캐시 불가(no-store)로 만들며,
// export const revalidate를 명시해도 무시된다. 미들웨어(React 렌더링 파이프라인 밖)에서 처리하면 페이지 컴포넌트에 redirect() 호출이 남지 않아 ISR 캐시(revalidate:300)를 받는다.
const PAGE_N_BASES = new Set([
  'lens',
  'markets', 'property', 'economy', 'finance', 'industry', 'politics', 'national', 'international', 'culture',
]);

// /lens?page=N, /webtoon?page=N 옛 링크 정리. next.config.ts의 redirects()+has 조합은 has로 매칭한 쿼리를 destination에 :page로 넣어도
// 원본 쿼리스트링이 남아 "/lens/page/2?page=2" 같은 URL이 되므로, 미들웨어에서 새 URL을 직접 만든다.
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  const pageSegmentMatch = pathname.match(/^\/([a-z]+)\/page\/(\d+)$/);
  if (pageSegmentMatch) {
    const [, base, nStr] = pageSegmentMatch;
    if (PAGE_N_BASES.has(base) && parseInt(nStr, 10) <= 1) {
      const url = request.nextUrl.clone();
      url.pathname = `/${base}`;
      url.search = '';
      return NextResponse.redirect(url, 308);
    }
    return NextResponse.next();
  }

  const page = searchParams.get('page');
  if (!page || !/^\d+$/.test(page)) return NextResponse.next();

  const n = parseInt(page, 10);
  const base = '/lens';
  const destination = n <= 1 ? base : `${base}/page/${n}`;
  const url = request.nextUrl.clone();
  url.pathname = destination;
  url.search = '';
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: [
    '/lens',
    '/lens/page/:n',
    '/markets/page/:n', '/property/page/:n', '/economy/page/:n', '/finance/page/:n', '/industry/page/:n',
    '/politics/page/:n', '/national/page/:n', '/international/page/:n', '/culture/page/:n',
  ],
};
