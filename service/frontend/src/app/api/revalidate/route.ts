import { timingSafeEqual } from 'node:crypto';

// admin이 글을 발행/수정/삭제하면 이 webhook을 호출한다(2026-08-08 신설).
//
// 2026-08-09: 태그 기반 캐시(revalidateTag) 자체를 걷어냈다 — revalidateTag(tag,
// 'max')의 'max'가 "즉시·완전 무효화"가 아니라 Next 내장 cache-life 프로파일
// (stale:5분/revalidate:30일/expire:영구)이라는 걸 뒤늦게 확인했기 때문이다
// (node_modules/next/cache.d.ts 참조). admin이 이 webhook을 한 번이라도 쏘면
// 그 태그가 걸린 라우트가 최대 30일짜리 캐시로 재고정되는 심각한 버그였다
// (실측: /webtoon 이 s-maxage=31536000으로 나온 원인). 콘텐츠 fetch는 전부
// cache:'no-store'로 바꿔서 애초에 무효화할 캐시가 없다(cmsPostsApi.ts 등
// 상단 주석 참조) — 이 라우트는 이제 순수 no-op이지만, admin/backend/shared/
// notify.py가 여전히 이 경로를 호출하므로 엔드포인트 자체는 유지해 200을
// 준다(admin 쪽 코드를 안 건드리기 위함).
function isAuthorized(request: Request): boolean {
  const provided = request.headers.get('x-revalidate-secret') ?? '';
  const expected = process.env.REVALIDATE_SECRET ?? '';
  if (!expected) return false; // 시크릿 미설정이면 항상 거부(fail-closed).
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  return Response.json({ ok: true, note: 'no-op — content fetches are no-store, nothing to invalidate' });
}
