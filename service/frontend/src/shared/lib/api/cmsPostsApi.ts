/**
 * CMS 공개 글 API client.
 *
 * GET /api/v2/posts?channel=&date=
 * (backend/v2/handlers/cms_posts_public.py 와 1:1 — envelope 없음)
 *
 * 실패해도 throw 하지 않는다 — 이 API 가 죽어도 기존 레터는 그대로 보여야 한다
 * (spec §8 fail-open). 호출부는 빈 배열만 다루면 된다.
 */
import { CMS_API_URL } from '@/shared/config/apiClient';
import type { CmsChannel, CmsLetter, CmsWebtoon, CmsVideo, CmsLens } from "./cmsPostTypes";
// 진행 중 요청 묶기(in-flight coalescing). 같은 파라미터의 요청이 진행 중인 동안만 Promise를 공유하고,
// 응답이 오면 즉시 캐시에서 지운다. 시간 기반 캐시가 아니므로 admin 발행/수정/삭제가 항상 즉시 반영된다.
const requestCache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, run: () => Promise<T>): Promise<T> {
  const inFlight = requestCache.get(key);
  if (inFlight) return inFlight as Promise<T>;

  const p = run().finally(() => requestCache.delete(key));
  requestCache.set(key, p);
  return p;
}

// 캐시 정책: 태그 캐시(revalidateTag)를 사용한다. 무효화는 두 번째 인자('max') 없이 revalidateTag(tag)만 호출한다
// (service/frontend/src/app/api/revalidate/route.ts). 'max'는 즉시 무효화가 아니라 cache-life 프로파일
// (stale 5분 / revalidate 30일 / expire 영구) 이름이라 태그 캐시가 최대 30일로 재고정된다.
// admin이 글을 발행/수정/삭제/발행취소할 때마다(admin/backend/shared/notify.py → routes/posts.py) 이 webhook이 호출되어
// 캐시 항목이 즉시 stale 처리되고, 그 사이 방문자는 EC2→API 왕복 없이 캐시된 응답을 받는다.
// [slug] page.tsx의 `export const revalidate`가 이 값을 그대로 참조하도록 export한다
// (라우트 레벨 선언과 fetch 레벨 안전망의 숫자 분기 방지).
const CACHE_TTL_FALLBACK_SECONDS = 300; // 웹훅이 유실돼도 5분 뒤 자동 갱신하는 안전망.

// 이 파일의 함수는 서버 컴포넌트(SSR)뿐 아니라 다수의 'use client' 컴포넌트가 useEffect로 브라우저에서도 호출한다.
// `cache: 'force-cache'` + `next.tags`는 SSR 중에만 해석되며, 브라우저 fetch()에서는 `next.tags`가 무시되고
// `force-cache`만 남아 /api/revalidate가 무효화할 수 없는 브라우저 HTTP 캐시가 켜진다.
// 따라서 브라우저 호출은 no-store로 캐시를 끄고, 서버(SSR) 호출에서만 태그 캐시를 쓴다.
function cacheOpts(tag: string): RequestInit {
  if (typeof window !== 'undefined') {
    return { cache: 'no-store' };
  }
  return { cache: 'force-cache', next: { tags: [tag], revalidate: CACHE_TTL_FALLBACK_SECONDS } };
}

export async function fetchCmsPosts(
  channel: CmsChannel,
  date?: string,
  limit?: number,
): Promise<CmsLetter[]> {
  return cached(`posts|${channel}|${date ?? ''}|${limit ?? ''}`, async () => {
    try {
      const qs = new URLSearchParams({ channel });
      if (date) qs.set('date', date);
      if (limit) qs.set('limit', String(limit));
      const res = await fetch(`${CMS_API_URL}/api/v2/posts?${qs}`, cacheOpts(`posts:${channel}`));
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: CmsLetter[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

// trend_card 채널은 백엔드 _VALID_CHANNELS에서 제거되었다. 호출부가 여전히 CmsTrendCard[] 형태를 기대하므로
// 시그니처는 유지하고 요청 없이 빈 배열을 돌려준다.

// 홈 웹툰 미리보기(WebtoonPreviewSection) 전용 축약본. 상위 4개와 cover_image_url만 쓰므로 panels 등 무거운 필드를 제외한다.
export function toWebtoonPreviewSummaries(webtoons: CmsWebtoon[]): CmsWebtoon[] {
  return webtoons.slice(0, 4).map((w) => ({ ...w, panels: [] }));
}

export async function fetchWebtoons(): Promise<CmsWebtoon[]> {
  return cached('webtoon', async () => {
    try {
      // limit=1000: 발행량 증가로 100건 상한에서 오래된 회차가 목록에서 사라졌다. 백엔드는 1000건까지 DB 읽기 비용 증가 없이
      // 지원한다(cms_posts_public.py: 항상 전체를 읽은 뒤 슬라이스).
      const res = await fetch(`${CMS_API_URL}/api/v2/posts?channel=webtoon&limit=1000`, cacheOpts('posts:webtoon'));
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: CmsWebtoon[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

export async function fetchWebtoonBySlug(slug: string): Promise<CmsWebtoon | null> {
  try {
    const res = await fetch(`${CMS_API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=webtoon`, cacheOpts('posts:webtoon'));
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CmsWebtoon };
    return data.post ?? null;
  } catch {
    return null;
  }
}

// 홈 영상 미리보기(VideoPreviewSection) 전용 축약본. 상위 4개만 쓰며 CmsVideo에는 무거운 필드가 없어 개수만 줄인다.
export function toVideoPreviewSummaries(videos: CmsVideo[], lens: CmsLens[] = []): CmsVideo[] {
  // 영상 id는 같은 이슈 lens 글의 id(슬러그 동일)이며, 기사 사진을 포스터로 붙인다.
  const photoById = new Map(lens.map((l) => [l.id, pickPhoto(l)] as const));
  return videos.slice(0, 4).map((v) => ({ ...v, poster_url: photoById.get(v.id) ?? null }));
}

function pickPhoto(l: CmsLens): string | null {
  return l.photo_image_url || l.cover_image_url || null;
}

export async function fetchVideos(): Promise<CmsVideo[]> {
  return cached('video', async () => {
    try {
      // limit=1000: fetchWebtoons()와 같은 이유.
      const res = await fetch(`${CMS_API_URL}/api/v2/posts?channel=video&limit=1000`, cacheOpts('posts:video'));
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: CmsVideo[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

// 홈 "오늘의 이슈, 4가지 시선"(LensPreviewSection) 전용 축약본. 이 컴포넌트는 포맷당 question 한 줄만 쓰므로
// 본문(bullets·paragraphs·transcript 등)을 initialItems로 직렬화하지 않는다(홈 HTML 크기 축소).
// buildArchiveItems()는 lenses[]를 읽지 않으므로 영향이 없다(archiveItems.ts 참조).
export function toLensPreviewSummaries(lenses: CmsLens[]): CmsLens[] {
  return lenses.map((l) => ({
    ...l,
    lenses: (l.lenses ?? []).map((f) => ({ label: f.label, question: f.question, bullets: [] })),
  }));
}

// limit 파라미터화: 기본 1000(전체 목록: sitemap·카테고리·/lens 목록). 홈 미리보기·사이드바처럼 최신 몇 건만 쓰는 호출부는
// 작은 값을 넘긴다. 전체 목록 응답(~3MB)은 Next 데이터 캐시 한도(2MB)를 넘어 캐시되지 않기 때문이다. 캐시 키·URL이 limit별로 갈린다.
// 큰 목록(limit≥200, 1,000건이면 ~3MB)은 Next 데이터 캐시에 들어가지 않아 기사 첫 렌더·RSS·뉴스 사이트맵·사이트맵·분류 목록이 렌더마다 오리진에서 다시 받았다.
// 봇이 서로 다른 글을 훑으면 오리진 응답이 폭주하므로, 서버(SSR) 프로세스 메모리에 5분 보관한다. 갱신이 실패하면 오래된 값을 대신 돌려준다(빈 목록보다 낫다).
// admin 발행·수정·삭제 webhook(/api/revalidate)이 clearLensListMemo()로 즉시 비우므로 반영 속도는 그대로다.
const BIG_LIST_MIN = 200;
const lensListMemo = new Map<number, { at: number; posts: CmsLens[] }>();
export function clearLensListMemo(): void {
  lensListMemo.clear();
  allMemo.clear();
}

export async function fetchLensPosts(limit: number = 1000): Promise<CmsLens[]> {
  const server = typeof window === 'undefined';
  if (server && limit >= BIG_LIST_MIN) {
    const hit = lensListMemo.get(limit);
    if (hit && Date.now() - hit.at < CACHE_TTL_FALLBACK_SECONDS * 1000) return hit.posts;
    const fresh = await fetchLensPostsFromApi(limit);
    if (fresh.length > 0) {
      lensListMemo.set(limit, { at: Date.now(), posts: fresh });
      return fresh;
    }
    return hit?.posts ?? fresh;
  }
  return fetchLensPostsFromApi(limit);
}

async function fetchLensPostsFromApi(limit: number): Promise<CmsLens[]> {
  return cached(`lens:${limit}`, async () => {
    // limit=1000: 목록(다건) 응답은 백엔드가 축약판(label/question/bullets만)을 돌려주므로(cms_posts_shaping.py의
    // shape_lens_summary) 상한을 올려도 Lambda 동기 응답 한도(6MB)를 넘지 않는다. webtoon/video와 동일하다.
    const url = `${CMS_API_URL}/api/v2/posts?channel=lens&limit=${limit}`;
    // 이 fetch가 간헐적으로 실패해 빈 배열이 조용히 반환되면 홈 히어로가 통째로 사라진다.
    // 재시도 1회와 실패 로그로 일시적 실패의 영향을 줄이고 원인을 CloudWatch에서 추적할 수 있게 한다.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, cacheOpts('posts:lens'));
        if (!res.ok) {
          console.error(`fetchLensPosts: HTTP ${res.status} (attempt ${attempt}/2)`);
          continue;
        }
        const data = (await res.json()) as { posts?: CmsLens[] };
        return data.posts ?? [];
      } catch (e) {
        console.error(`fetchLensPosts: fetch threw (attempt ${attempt}/2):`, e);
      }
    }
    return [];
  });
}

/** 특정 날짜(KST)에 발행된 글 목록 — 채널별 1,000건 상한 밖 과거 글을 이어 받는 데 쓴다(lens·webtoon·video 공통). */
async function fetchChannelOnDate<T>(channel: 'lens' | 'webtoon' | 'video', date: string): Promise<T[]> {
  return cached(`${channel}:date:${date}`, async () => {
    try {
      const res = await fetch(`${CMS_API_URL}/api/v2/posts?channel=${channel}&date=${date}&limit=1000`, cacheOpts(`posts:${channel}`));
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: T[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

function shiftDay(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * 최신 1,000건 상한 밖 과거 글 이어 받기(sitemap 전용).
 *
 * 목록 API는 채널당 최신 1,000건에서 잘린다(offset·cursor 없음, 다음 페이지는 `date=` 조회뿐).
 * 상한에 닿았을 때만 가장 오래된 날짜(그날은 중간에 잘렸을 수 있어 다시 포함)부터 6일씩 병렬로 거슬러 내려가며 받는다.
 * 연속으로 비는 날이 20일 이어지거나 서비스 시작 전(2026-07-01)이면 멈춘다.
 * 카테고리·/lens 목록·이전/다음 이동은 여전히 최신 1,000건 기준이다(HTML 크기 때문).
 */
async function extendBeyondCap<T extends { id: string; date: string }>(channel: 'lens' | 'webtoon' | 'video', recent: T[]): Promise<T[]> {
  if (recent.length < 1000) return recent;
  const byId = new Map(recent.map((p) => [p.id, p]));
  let day = recent.reduce((m, p) => (p.date < m ? p.date : m), recent[0].date);
  let emptyRun = 0;
  while (day >= '2026-07-01' && emptyRun < 20) {
    const batchDays = Array.from({ length: 6 }, (_, i) => shiftDay(day, -i));
    const batches = await Promise.all(batchDays.map((d) => fetchChannelOnDate<T>(channel, d)));
    for (const posts of batches) {
      if (posts.length === 0) emptyRun += 1;
      else emptyRun = 0;
      for (const p of posts) if (!byId.has(p.id)) byId.set(p.id, p);
    }
    day = shiftDay(day, -6);
  }
  return [...byId.values()];
}

/** 특정 날짜(KST) lens 글. "지난 지면" 페이지(/paper/[date])용. */
export async function fetchLensPostsOnDate(date: string): Promise<CmsLens[]> {
  return fetchChannelOnDate<CmsLens>('lens', date);
}

/** 홈 지면 탭이 쓰는 paper_section 값 — features/news-feed LensPreviewSection의 SECTIONS와 같은 값(그쪽이 이 값으로 탭별 기사를 거른다). */
export const PAPER_SECTION_VALUES = ['전체', '증권', '산업', '시그널'] as const;

/**
 * 지면이 편성된 날짜 목록(최신순, YYYY-MM-DD). 4개 지면 중 하나라도 기사가 있는 날이며 최신 1,000건 안에서 구한다.
 * 지면(paper_section) 데이터는 2026-09-29부터 있어 상한 문제가 없다.
 */
export async function fetchPaperDates(): Promise<string[]> {
  // 최신 1,000건 응답(~3MB)은 Next 데이터 캐시 한도(2MB)를 넘어 캐시되지 않으므로, 날짜 목록(수십 바이트)만 서버 메모리에 5분 보관한다.
  const now = Date.now();
  if (paperDatesMemo && now - paperDatesMemo.at < CACHE_TTL_FALLBACK_SECONDS * 1000) return paperDatesMemo.dates;
  if (paperDatesInFlight) return paperDatesInFlight;
  paperDatesInFlight = (async () => {
    const posts = await fetchLensPosts(1000);
    const sections = new Set<string>(PAPER_SECTION_VALUES);
    const dates = new Set<string>();
    for (const p of posts) {
      if (p.paper_section && sections.has(p.paper_section)) dates.add(p.date);
    }
    const list = [...dates].sort().reverse();
    // 빈 결과(API 일시 실패)는 보관하지 않는다 — 다음 요청이 바로 다시 시도한다.
    if (list.length > 0) paperDatesMemo = { at: Date.now(), dates: list };
    return list;
  })().finally(() => {
    paperDatesInFlight = null;
  });
  return paperDatesInFlight;
}
let paperDatesMemo: { at: number; dates: string[] } | null = null;
let paperDatesInFlight: Promise<string[]> | null = null;

// 상한(1,000건) 밖 과거 글까지 이어 받는 전체 목록은 날짜별 호출이 수십 번이라 사이트맵·검색 색인이 요청마다 다시 만들면 오리진을 압박한다.
// 서버 메모리에 5분 보관하고(실패한 빈 결과는 보관하지 않는다) webhook이 clearLensListMemo()로 함께 비운다.
const allMemo = new Map<string, { at: number; posts: unknown[] }>();
async function memoAll<T extends { id: string; date: string }>(key: 'lens' | 'video', build: () => Promise<T[]>): Promise<T[]> {
  if (typeof window !== 'undefined') return build();
  const hit = allMemo.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_FALLBACK_SECONDS * 1000) return hit.posts as T[];
  const fresh = await build();
  if (fresh.length > 0) allMemo.set(key, { at: Date.now(), posts: fresh });
  return fresh.length > 0 ? fresh : ((hit?.posts as T[] | undefined) ?? fresh);
}

export async function fetchAllLensPosts(): Promise<CmsLens[]> {
  return memoAll('lens', async () => extendBeyondCap('lens', await fetchLensPosts(1000)));
}
export async function fetchAllVideos(): Promise<CmsVideo[]> {
  return memoAll('video', async () => extendBeyondCap('video', await fetchVideos()));
}

export async function fetchLensBySlug(slug: string): Promise<CmsLens | null> {
  try {
    const res = await fetch(`${CMS_API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=lens`, cacheOpts('posts:lens'));
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CmsLens };
    return data.post ?? null;
  } catch {
    return null;
  }
}

// mbti_group 없이 발행된 CMS 글(letterHref가 slug를 id로 씀)을 /letters/view?id=<slug>로 열 때 사용한다.
// 날짜/그룹 기반 목록 조회로는 찾을 수 없다.
export async function fetchCmsPostBySlug(
  channel: CmsChannel,
  slug: string,
): Promise<CmsLetter | null> {
  try {
    const res = await fetch(`${CMS_API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=${channel}`, cacheOpts(`posts:${channel}`));
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CmsLetter };
    return data.post ?? null;
  } catch {
    return null;
  }
}

export type { CmsChannel, CmsLetter, CmsTrendCard, CmsWebtoon, CmsVideo, CmsLensItem, CmsLens } from "./cmsPostTypes";
