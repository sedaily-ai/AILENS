import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { pingIndexNow } from '@/shared/lib/seo/indexNow';

// admin이 글을 발행/수정/삭제하면 이 webhook을 호출한다(2026-08-08 신설).
//
// 2026-08-09: 태그 기반 캐시(revalidateTag) 자체를 걷어냈었다 — 원인은
// revalidateTag(tag, 'max')의 두 번째 인자 'max'였다. 이건 "즉시·완전 무효화"가
// 아니라 Next 내장 cache-life 프로파일 이름(stale:5분/revalidate:30일/
// expire:영구)이라, admin이 이 webhook을 한 번만 쏴도 그 태그가 걸린 캐시가
// 최대 30일짜리로 재고정되는 사고였다(node_modules/next/cache.d.ts 참조,
// 실측: /webtoon 이 s-maxage=31536000으로 나온 원인). 사고 경위 전체:
// docs/worklog/2026-08/2026-08-09-cache-ttl-tighten-sse-removal.md "후속 5".
//
// 2026-08-16: "홈 속도가 느리다" 피드백으로 캐시를 다시 켰다(cmsPostsApi.ts —
// cache:'force-cache' + tags). Next 16의 revalidateTag(tag, profile) 는 두 번째
// 인자가 필수다(타입: string | { expire?: number }) — 그런데 이전 사고의 원인이
// 정확히 이 두 번째 인자였다: 'max' 같은 이름은 CacheLifeProfiles(default/seconds/
// minutes/hours/days/weeks/max)라는 사전 정의 프로파일을 가리키고, "즉시 무효화"
// 라는 뜻이 아니다(node_modules/next/dist/server/use-cache/cache-life.d.ts 참조).
// 같은 함정을 또 밟지 않기 위해 이름 있는 프로파일 대신 `{ expire: 0 }`(=이미
// 만료된 것으로 처리, 즉시 무효화)을 명시적으로 넘긴다 — Next 소스
// (node_modules/next/dist/server/web/spec-extension/revalidate.js)의 updateTag()
// 가 "profile 없이 호출하면 즉시 만료"라고 주석에 써놓은 것과 동일한 의도를
// 타입 에러 없이 명시적으로 표현한 것. "CMS 발행은 무조건 즉시 반영"이라는 원래
// 요구는 그대로 지킨다 — 캐시가 있어도 발행 즉시 이 webhook이 그 캐시를
// 걷어내기 때문에, 방문자 입장에서는 2026-08-09 이전(캐시 도입 전 사고 시점)과
// 다르게 "발행이 반영 안 됨" 문제가 없다.
//
// payload에 어떤 채널이 바뀌었는지 정보가 없다(admin/backend/shared/notify.py가
// 매번 빈 바디 `{}`로 호출) — 그래서 posts 관련 채널 태그를 전부 무효화한다.
// 이 앱 트래픽 규모에서 "무효화 대상을 넓게 잡아 몇 개 더 다시 가져오는" 비용은
// 무시할 수준이고, 특정 채널만 골라 무효화하려다 하나 빠뜨리는 게(오늘 낮에
// admin/backend/routes/posts.py의 _VALID_CHANNELS 를 빠뜨렸던 것과 같은 종류의
// 실수) 훨씬 위험하다.
// 'posts:home_player' 추가(2026-08-21) — /listen 목록·상세 페이지 신설로
// 이 채널도 이제 SSR 캐시(force-cache + tags)를 쓴다(homePlayerApi.ts
// ssrCacheOpts 참조). 안 넣으면 admin 발행이 5분 안전망 TTL까지 지연됨.
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
