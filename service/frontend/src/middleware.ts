import { NextResponse, type NextRequest } from 'next/server';

// 목록 페이지네이션 라우트 — /{base}/page/{n}에서 n<=1이면 베이스 경로로
// 리다이렉트(2026-09-30). 원래는 각 page/[n]/page.tsx 컴포넌트 안에서
// next/navigation의 redirect()를 호출했는데, Next.js가 redirect() 호출을
// "Dynamic API" 사용으로 인식해서 그 라우트 전체를 캐시 불가(no-store)
// 처리해버렸다 — export const revalidate를 명시해도 무시됨(카테고리
// 아카이브 페이지네이션에서 실측 확인, x-cache 항상 Miss + private/no-store).
// 이 리다이렉트를 미들웨어(요청이 페이지 컴포넌트에 도달하기 전, React
// 렌더링 파이프라인 밖)에서 처리하면 페이지 컴포넌트엔 redirect() 호출이
// 아예 안 남아 정상적으로 ISR 캐시(revalidate:300)를 받는다.
const PAGE_N_BASES = new Set([
  'lens', 'webtoon', 'video', 'listen',
  'markets', 'signal', 'property', 'industry', 'finance', 'international', 'culture',
]);

// /lens?page=N, /webtoon?page=N 옛 링크 정리(2026-08-23) — next.config.ts의
// redirects()+has 조합으로 먼저 시도했는데, Next가 has로 매칭한 쿼리를
// destination에 :page로 다시 꽂아 넣어도 원본 쿼리스트링을 그대로 남겨서
// "/lens/page/2?page=2"처럼 지저분한 URL이 됐다(has 캡처 그룹이 "사용됨"으로
// 안 잡히는 걸로 보임). 미들웨어에서 직접 새 URL을 만들면 이 문제가 없다.
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
  const base = pathname === '/lens' ? '/lens' : '/webtoon';
  const destination = n <= 1 ? base : `${base}/page/${n}`;
  const url = request.nextUrl.clone();
  url.pathname = destination;
  url.search = '';
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: [
    '/lens', '/webtoon',
    '/lens/page/:n', '/webtoon/page/:n', '/video/page/:n', '/listen/page/:n',
    '/markets/page/:n', '/signal/page/:n', '/property/page/:n', '/industry/page/:n',
    '/finance/page/:n', '/international/page/:n', '/culture/page/:n',
  ],
};
