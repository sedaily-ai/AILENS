import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { clearLensListMemo, fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { pingIndexNow } from '@/shared/lib/seo/indexNow';

// admin이 글을 발행/수정/삭제하면 이 webhook을 호출한다.
//
// 태그 기반 캐시(cmsPostsApi.ts의 cache:'force-cache' + tags)를 revalidateTag로 무효화한다.
// ⚠️ revalidateTag(tag, profile)의 두 번째 인자 'max'는 즉시 무효화가 아니라 Next 내장 cache-life 프로파일 이름(stale:5분/revalidate:30일/expire:영구)이다.
// 이름 있는 프로파일을 넘기면 webhook을 한 번만 호출해도 캐시가 최대 30일로 재고정된다(node_modules/next/cache.d.ts, cache-life.d.ts 참조).
// 그래서 `{ expire: 0 }`(이미 만료된 것으로 처리 = 즉시 무효화)을 명시적으로 넘겨 CMS 발행이 즉시 반영되게 한다.
//
// payload에 변경된 채널 정보가 없어(admin/backend/shared/notify.py가 빈 바디 `{}`로 호출) posts 관련 채널 태그를 전부 무효화한다.
// 무효화 대상을 넓게 잡아 몇 건 더 다시 가져오는 비용은 무시할 수준이고, 채널을 골라 무효화하다 하나를 빠뜨리는 쪽이 더 위험하다.
// 'posts:home_player'는 /listen 목록·상세가 SSR 캐시(force-cache + tags)를 쓰므로 포함한다(homePlayerApi.ts ssrCacheOpts 참조). 빠지면 admin 발행이 5분 안전망 TTL까지 지연된다.
const CONTENT_TAGS = ['posts:letters', 'posts:paper', 'posts:feed', 'posts:trend_card', 'posts:webtoon', 'posts:video', 'posts:lens', 'posts:home_player'];

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

  for (const tag of CONTENT_TAGS) {
    revalidateTag(tag, { expire: 0 });
  }
  // 서버 메모리에 보관한 큰 기사 목록도 함께 비운다(cmsPostsApi.ts의 lensListMemo).
  clearLensListMemo();

  // IndexNow — 최근 3시간 안에 발행·수정된 기사와 홈·지면을 검색엔진에 바로 알린다(응답을 기다리지 않는다).
  void notifyIndexNow();

  return Response.json({ ok: true, revalidated: CONTENT_TAGS });
}

async function notifyIndexNow(): Promise<void> {
  try {
    const since = Date.now() - 3 * 60 * 60 * 1000;
    const recent = (await fetchLensPosts(40)).filter((l) => {
      const t = Date.parse(l.updated_at || l.published_at || '');
      return Number.isFinite(t) && t >= since;
    });
    const latestDate = recent.map((l) => l.date).sort().pop();
    await pingIndexNow(['/', ...(latestDate ? [`/paper/${latestDate}`] : []), ...recent.map((l) => lensPath(l))]);
  } catch {
    // 무시 — 발행 흐름과 무관.
  }
}
