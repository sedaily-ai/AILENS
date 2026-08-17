/**
 * CMS 공개 글 API client.
 *
 * GET /api/v2/posts?channel=&date=
 * (backend/v2/handlers/cms_posts_public.py 와 1:1 — envelope 없음)
 *
 * 실패해도 throw 하지 않는다 — 이 API 가 죽어도 기존 레터는 그대로 보여야 한다
 * (spec §8 fail-open). 호출부는 빈 배열만 다루면 된다.
 */
import { API_URL } from '@/shared/config/apiClient';
import type { ApiLetter } from './todayLettersApi';
import { letterHref } from './letterHref';

export type CmsChannel = 'letters' | 'paper' | 'feed' | 'webtoon' | 'video' | 'lens';

/** letters/feed 채널 응답은 ApiLetter 와 같은 모양 + is_cms 표식. */
export type CmsLetter = ApiLetter & { is_cms: true };

/**
 * "trend"/"column" 태그 카드 모양 — letters 와 달리 리치텍스트 본문이 없는
 * 가벼운 카드. 원래는 별도 trend_card 채널(2026-08-17 폐기, 실사용 0건)
 * 응답 모양이었는데, fetchSectionCards()가 letters+section 태그를 이
 * 모양으로 변환해서 계속 쓴다 — 타입 이름은 레거시지만 계약 자체는 유효.
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

// 캐시 정책 v2(2026-08-16, "홈 속도가 느리다" 피드백으로 재도입) — 2026-08-09에
// 태그 캐시를 완전히 껐던 이유는 캐싱 자체가 문제가 아니라 무효화 호출 한 줄이
// 버그였다: revalidateTag(tag, 'max')의 'max'는 "즉시·완전 무효화"가 아니라
// Next 내장 cache-life 프로파일(stale:5분/revalidate:30일/expire:영구) 이름이라
// admin이 webhook을 한 번만 쏴도 그 태그 캐시가 최대 30일짜리로 재고정되는
// 사고였다(node_modules/next/cache.d.ts 참조, 실측: /webtoon 이
// s-maxage=31536000으로 나옴). "그때부터 admin 발행이 반영 안 됨" 재발을 막으려
// 아예 캐시를 껐던 건데, 그 대가로 매 방문마다 EC2→API(us-east-1) 왕복을
// 그대로 겪어 홈 TTFB가 1.5~1.7초까지 늘어났다(2026-08-16 실측, CloudWatch
// 확인 결과 Lambda 실행 자체는 150~300ms로 빠름 — 병목은 no-store로 캐시가
// 아예 없다는 것 자체).
// 이번엔 두 번째 인자('max') 없이 revalidateTag(tag)만 호출한다(service/frontend/
// src/app/api/revalidate/route.ts) — 이건 Next 표준 on-demand 무효화로, 프로파일을
// 재설정하는 게 아니라 그 태그가 걸린 캐시 항목을 즉시 stale 처리한다. admin이
// 글을 발행/수정/삭제/발행취소할 때마다(admin/backend/shared/notify.py →
// admin/backend/routes/posts.py 4곳) 이 webhook이 호출되므로 "즉시 반영"은
// 캐시를 껐을 때와 동일하게 유지되고, 그 사이 방문자들은 캐시된 응답을 받아
// EC2→API 왕복 없이 즉시 렌더링된다.
const CACHE_TTL_FALLBACK_SECONDS = 300; // 웹훅이 유실돼도 5분 뒤엔 자동 갱신(안전망).

// 이 파일의 함수들은 서버 컴포넌트(app/page.tsx의 SSR Promise.all)뿐 아니라
// TrendingEconomySection/ColumnPreviewSection 등 다수의 'use client' 컴포넌트가
// useEffect로 브라우저에서 직접 호출한다(2026-08-16, "요즘 화제의 경제 이슈
// 이미지가 항상 늦게 최신화" 피드백으로 발견). cache:'force-cache' + next.tags는
// Next.js가 SSR 중에만 해석하는 확장 옵션이고, 브라우저의 fetch()에서는
// `next.tags`를 그냥 무시하고 표준 RequestCache 값인 `cache:'force-cache'`만
// 살아남아 **브라우저 자체 HTTP 캐시**를 켜버린다 — 이건 /api/revalidate가
// 전혀 손댈 수 없는 별개의 캐시라, admin이 발행해도 그 브라우저에서는 계속
// 옛 응답이 나온다. 그래서 브라우저에서 호출될 때는 예전처럼 no-store로
// 완전히 캐시를 끄고, 서버(SSR)에서 호출될 때만 태그 캐시를 쓴다.
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
      const res = await fetch(`${API_URL}/api/v2/posts?${qs}`, cacheOpts(`posts:${channel}`));
      if (!res.ok) return [];
      const data = (await res.json()) as { posts?: CmsLetter[] };
      return data.posts ?? [];
    } catch {
      return [];
    }
  });
}

// trend_card 채널 폐기(2026-08-17) — "요즘 화제의 경제 이슈" 섹션을 "이슈
// 톡톡"에 흡수 통합하면서, 백엔드 _VALID_CHANNELS에서도 trend_card를 뺐다
// (실사용 데이터 0건 확인됨). 이 함수를 호출하는 6곳(archive/column/trend
// 아카이브 페이지들)은 여전히 CmsTrendCard[] 모양을 기대하므로 시그니처는
// 남기고 몸통만 즉시 빈 배열 — 이제 존재하지 않는 채널로 매 방문마다 400을
// 받는 대신, 애초에 요청을 보내지 않는다.
export async function fetchTrendCards(): Promise<CmsTrendCard[]> {
  return [];
}

export type CmsSectionCard = CmsTrendCard & { href?: string | null; imageUrl?: string | null };

// ColumnPreviewSection("이번 주 인사이트")이 쓰던 fetch 로직 — "trend" 섹션도
// 같이 지원했었으나(TrendingEconomySection) 그 섹션 자체가 2026-08-17
// "이슈 톡톡"에 흡수 통합되며 삭제됐다. section 파라미터를 'column' 하나로
// 좁힌다 — 원래도 trend_card 채널 병합은 실사용 데이터 0건이라 순수 오버헤드였다.
export async function fetchSectionCards(section: 'column'): Promise<CmsSectionCard[]> {
  const letters = await fetchCmsPosts('letters', undefined, 100);
  const tagged: CmsSectionCard[] = letters
    .filter((l) => l.section === section)
    .map((l) => ({
      id: l.id,
      section,
      category: l.category || l.editor_id || 'AI LENS',
      title: l.headline,
      excerpt: l.subtitle ?? '',
      date: l.publish_date ?? '',
      is_cms: true as const,
      href: letterHref(l.id),
      imageUrl: l.cover_image_url || null,
    }));
  return tagged.sort((a, b) => b.date.localeCompare(a.date));
}

export async function fetchWebtoons(): Promise<CmsWebtoon[]> {
  return cached('webtoon', async () => {
    try {
      // limit=100 명시(2026-08-11) — 안 넘기면 백엔드 기본값(20)에서 조용히
      // 잘려서, 21화가 올라가는 순간 가장 오래된 화가 목록에서 사라지는
      // 버그가 있었다(cms_posts_public.py 의 limit 기본값 확인 후 발견).
      const res = await fetch(`${API_URL}/api/v2/posts?channel=webtoon&limit=100`, cacheOpts('posts:webtoon'));
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
    const res = await fetch(`${API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=webtoon`, cacheOpts('posts:webtoon'));
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
      const res = await fetch(`${API_URL}/api/v2/posts?channel=video&limit=100`, cacheOpts('posts:video'));
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
    const res = await fetch(`${API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=video`, cacheOpts('posts:video'));
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
  /** 원문 기사 URL — 서울경제 원본 취재 기사 링크(2026-08-13, SEO/GEO/AEO 감사). */
  source_url: string | null;
  lenses: CmsLensItem[];
  is_cms: true;
}

export async function fetchLensPosts(): Promise<CmsLens[]> {
  return cached('lens', async () => {
    try {
      // limit=100 명시(2026-08-12) — webtoon/video 와 같은 이유. 안 넘기면
      // 백엔드 기본값(20)에서 조용히 잘려 오래된 글이 목록에서 사라진다.
      const res = await fetch(`${API_URL}/api/v2/posts?channel=lens&limit=100`, cacheOpts('posts:lens'));
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
    const res = await fetch(`${API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=lens`, cacheOpts('posts:lens'));
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
    const res = await fetch(`${API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=${channel}`, cacheOpts(`posts:${channel}`));
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: CmsLetter };
    return data.post ?? null;
  } catch {
    return null;
  }
}
