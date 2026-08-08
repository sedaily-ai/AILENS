/**
 * CMS 공개 글 API client.
 *
 * GET /api/v2/posts?channel=&date=
 * (backend/v2/handlers/cms_posts_public.py 와 1:1 — envelope 없음)
 *
 * 실패해도 throw 하지 않는다 — 이 API 가 죽어도 기존 레터는 그대로 보여야 한다
 * (spec §8 fail-open). 호출부는 빈 배열만 다루면 된다.
 */
import { API_URL } from '@/shared/config/api';
import type { ApiLetter } from './todayLettersApi';

export type CmsChannel = 'letters' | 'paper' | 'feed' | 'trend_card' | 'webtoon' | 'video';

/** letters/feed 채널 응답은 ApiLetter 와 같은 모양 + is_cms 표식. */
export type CmsLetter = ApiLetter & { is_cms: true };

/**
 * trend_card 채널 응답 — 홈 피드 "요즘 화제의 경제 이슈"/"이번 주 인기 칼럼"
 * 카드. letters 와 달리 리치텍스트 본문이 없는 가벼운 카드라 모양이 다르다
 * (backend/v2/handlers/cms_posts_public.py _shape_trend_card 와 1:1).
 */
export interface CmsTrendCard {
  id: string;
  section: 'trend' | 'column';
  category: string;
  title: string;
  excerpt: string;
  date: string;
  is_cms: true;
}

/**
 * webtoon 채널 응답 — 연재 웹툰 파일럿(2026-08-06). 컷(이미지+캡션) 나열뿐인
 * 가벼운 포맷 (backend cms_posts_public.py _shape_webtoon 과 1:1).
 */
export interface CmsWebtoonPanel {
  url: string;
  caption: string;
}

export interface CmsWebtoon {
  id: string;
  editor_id: string;
  title: string;
  excerpt: string;
  date: string;
  cover_image_url: string | null;
  panels: CmsWebtoonPanel[];
  is_cms: true;
}

/**
 * video 채널 응답 — 영상 콘텐츠(2026-08-06). YouTube 등 외부 임베드 URL
 * 하나만 있는 가벼운 포맷 (backend cms_posts_public.py _shape_video 와 1:1).
 */
export interface CmsVideo {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  video_url: string;
  thumbnail_url: string | null;
  is_cms: true;
}

// 진행 중 요청 묶기(in-flight coalescing) — 홈 화면 섹션 다수(트렌드/칼럼/
// 단어퀴즈/미니헤드라인 등)가 같은 파라미터로 fetchCmsPosts/fetchTrendCards
// 를 각자 따로 불러서, 동일한 응답을 기다리는 중복 요청이 여러 개 동시에
// 나가고 있었다(2026-08-07, "섹션들이 한번에 안 뜨고 딜레이 있다" 피드백).
// **시간 기반 캐시가 아니다** — 요청이 "진행 중"인 동안만 같은 Promise 를
// 공유하고, 응답이 오는 즉시 캐시에서 지운다. 그 다음 호출은 무조건 새
// 네트워크 요청이라 admin 발행/수정/삭제가 항상 즉시 반영된다(2026-08-08,
// "무조건 실시간성" 요구 — sessionStorage 에 결과를 남겨뒀던 이전 버전은
// 탭을 새로고침해도 옛 값이 몇 분간 남아있어 삭제한 글이 계속 보이는 문제가
// 있었다).
const requestCache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, run: () => Promise<T>): Promise<T> {
  const inFlight = requestCache.get(key);
  if (inFlight) return inFlight as Promise<T>;

  const p = run().finally(() => requestCache.delete(key));
  requestCache.set(key, p);
  return p;
}

// 캐시 정책(2026-08-08, "클릭 즉시 이동 + admin CRUD 1초 반영" 요구) — 평소엔
// 태그로 캐시해서 Next <Link> 프리페치가 살아있게 하고(no-store였을 땐 캐시할
// 게 없어서 프리페치가 무력화돼 있었다), admin이 글을 쓰면 POST /api/revalidate
// (src/app/api/revalidate/route.ts)가 같은 태그를 revalidateTag()로 깬다.
// revalidate:60(상한)도 같이 걸어서 webhook을 놓쳐도(오늘 아침 "삭제한 글이
// 안 사라짐" 사고처럼) 최악 60초 안엔 스스로 회복한다 — 태그만 걸고 캐시
// 옵션을 안 주면 Next 15+ 기본값(fetch 무캐시)이라 캐싱 자체가 안 켜진다.
function tag(channel: CmsChannel): string {
  return `posts:${channel}`;
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
      const res = await fetch(`${API_URL}/api/v2/posts?${qs}`, {
        cache: 'force-cache',
        next: { tags: [tag(channel)], revalidate: 60 },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: CmsLetter[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

// trend_card 는 letters 와 모양이 달라 fetchCmsPosts 의 CmsLetter[] 반환 타입을
// 못 쓴다 — 같은 엔드포인트를 별도 함수로 감싼다.
export async function fetchTrendCards(): Promise<CmsTrendCard[]> {
  return cached('trend_card', async () => {
    try {
      const res = await fetch(`${API_URL}/api/v2/posts?channel=trend_card`, {
        cache: 'force-cache',
        next: { tags: [tag('trend_card')], revalidate: 60 },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: CmsTrendCard[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

export async function fetchWebtoons(): Promise<CmsWebtoon[]> {
  return cached('webtoon', async () => {
    try {
      const res = await fetch(`${API_URL}/api/v2/posts?channel=webtoon`, {
        cache: 'force-cache',
        next: { tags: [tag('webtoon')], revalidate: 60 },
      });
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
    const res = await fetch(`${API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=webtoon`, {
      cache: 'force-cache',
      next: { tags: [tag('webtoon')], revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CmsWebtoon };
    return data.post ?? null;
  } catch {
    return null;
  }
}

export async function fetchVideos(): Promise<CmsVideo[]> {
  return cached('video', async () => {
    try {
      const res = await fetch(`${API_URL}/api/v2/posts?channel=video`, {
        cache: 'force-cache',
        next: { tags: [tag('video')], revalidate: 60 },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: CmsVideo[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

// mbti_group 없이 발행된 CMS 글(letterHref 가 slug 를 그대로 id 로 씀)을
// /letters/view?id=<slug> 로 열 때 사용 — 날짜/그룹 기반 목록 조회로는 못 찾는다.
export async function fetchCmsPostBySlug(
  channel: CmsChannel,
  slug: string,
): Promise<CmsLetter | null> {
  try {
    const res = await fetch(`${API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=${channel}`, {
      cache: 'force-cache',
      next: { tags: [tag(channel)], revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CmsLetter };
    return data.post ?? null;
  } catch {
    return null;
  }
}
