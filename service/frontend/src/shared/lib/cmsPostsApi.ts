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

export type CmsChannel = 'letters' | 'paper' | 'feed' | 'trend_card' | 'webtoon' | 'video' | 'lens';

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

// 캐시 정책(2026-08-09, "새로고침하면 예외 없이 즉시 반영" 요구로 전면 재검토) —
// 태그+revalidate:5 캐싱을 썼었는데, /api/revalidate 가 부르는
// revalidateTag(tag, 'max')의 'max'가 "즉시·완전 무효화"가 아니라 Next 내장
// cache-life 프로파일(stale:5분/revalidate:30일/expire:영구)이라는 걸 뒤늦게
// 확인했다(node_modules/next/cache.d.ts 문서 주석 참조) — admin이 webhook을
// 한 번이라도 쏘고 나면 그 태그가 걸린 라우트가 최대 30일짜리 캐시로 재고정되는
// 심각한 버그였다(실측: /webtoon 이 s-maxage=31536000으로 나온 원인). Next의
// 캐시-라이프 프로파일 의미론에 다시 기대는 대신 캐시 자체를 껐다 — Link
// 프리페치 이점은 잃지만("클릭 즉시 이동"과 "새로고침하면 예외 없이 최신"이
// 충돌할 때 후자를 우선), 이 트래픽 규모에서 성능 비용은 무시할 수준이다.

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
        cache: 'no-store',
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
        cache: 'no-store',
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
      // limit=100 명시(2026-08-11) — 안 넘기면 백엔드 기본값(20)에서 조용히
      // 잘려서, 21화가 올라가는 순간 가장 오래된 화가 목록에서 사라지는
      // 버그가 있었다(cms_posts_public.py 의 limit 기본값 확인 후 발견).
      const res = await fetch(`${API_URL}/api/v2/posts?channel=webtoon&limit=100`, {
        cache: 'no-store',
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
      cache: 'no-store',
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
      // limit=100 명시(2026-08-11) — fetchWebtoons()와 같은 이유. 안 넘기면
      // 백엔드 기본값(20)에서 조용히 잘려 오래된 영상이 목록에서 사라진다.
      const res = await fetch(`${API_URL}/api/v2/posts?channel=video&limit=100`, {
        cache: 'no-store',
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: CmsVideo[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

export async function fetchVideoBySlug(slug: string): Promise<CmsVideo | null> {
  try {
    const res = await fetch(`${API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=video`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CmsVideo };
    return data.post ?? null;
  } catch {
    return null;
  }
}

/**
 * lens 채널 응답 — "오늘의 이슈, 4가지 시선"(2026-08-12). 하루 하나의 이슈를
 * 원인/사람/내 일/숫자, 4개 고정 렌즈로 훑는 포맷. Instagram @ailens
 * 카드뉴스를 그대로 웹으로 옮긴다 (backend cms_posts_public.py _shape_lens 와 1:1).
 */
export interface CmsLensItem {
  label: string;
  question: string;
  bullets: string[];
}

export interface CmsLens {
  id: string;
  editor_id: string;
  headline: string;
  context: string;
  date: string;
  /**
   * 인스타 카드뉴스용 완성형 그래픽(1080x1350) — 사진 위에 "lens" 라벨,
   * 헤드라인, 날짜가 **픽셀로 박혀** 있다. 웹 카드의 사진 칸에 쓰면 우리 HTML
   * 헤드라인과 텍스트가 중복되고, 원본에 있던 광고 문구·인포그래픽 표까지
   * 같이 노출된다. 카드 전체를 통으로 보여주는 용도에만 쓸 것.
   */
  cover_image_url: string | null;
  /**
   * 텍스트가 없는 순수 기사 사진(2026-08-14 신설, backend _shape_lens 가
   * body_inline.photo_image_url 을 그대로 내려준다). 웹의 "사진 칸"은 이 값만
   * 쓴다 — pickLensPhoto() 참조.
   */
  photo_image_url?: string | null;
  /**
   * 원본 기사(sedaily.com) 링크. 발행된 글 대부분에 들어있다(48건 중 47건).
   * 뉴스 서비스에서 원문 출처는 신뢰의 핵심이라 상세 화면에 노출한다.
   */
  source_url?: string | null;
  lenses: CmsLensItem[];
  is_cms: true;
}

export async function fetchLensPosts(): Promise<CmsLens[]> {
  return cached('lens', async () => {
    try {
      // limit=100 명시(2026-08-12) — webtoon/video 와 같은 이유. 안 넘기면
      // 백엔드 기본값(20)에서 조용히 잘려 오래된 글이 목록에서 사라진다.
      const res = await fetch(`${API_URL}/api/v2/posts?channel=lens&limit=100`, {
        cache: 'no-store',
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: CmsLens[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

export async function fetchLensBySlug(slug: string): Promise<CmsLens | null> {
  try {
    const res = await fetch(`${API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=lens`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CmsLens };
    return data.post ?? null;
  } catch {
    return null;
  }
}

// mbti_group 없이 발행된 CMS 글(letterHref 가 slug 를 그대로 id 로 씀)을
// /letters/view?id=<slug> 로 열 때 사용 — 날짜/그룹 기반 목록 조회로는 못 찾는다.
export async function fetchCmsPostBySlug(
  channel: CmsChannel,
  slug: string,
): Promise<CmsLetter | null> {
  try {
    const res = await fetch(`${API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=${channel}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CmsLetter };
    return data.post ?? null;
  } catch {
    return null;
  }
}
