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

export async function fetchCmsPosts(
  channel: CmsChannel,
  date?: string,
  limit?: number,
): Promise<CmsLetter[]> {
  try {
    const qs = new URLSearchParams({ channel });
    if (date) qs.set('date', date);
    if (limit) qs.set('limit', String(limit));
    // API 응답의 Cache-Control(max-age=300)을 브라우저가 그대로 따르면 admin
    // 발행/수정/삭제가 최대 5분간 안 보인다 — no-store 로 우회.
    const res = await fetch(`${API_URL}/api/v2/posts?${qs}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { posts?: CmsLetter[] };
    return data.posts ?? [];
  } catch {
    return [];
  }
}

// trend_card 는 letters 와 모양이 달라 fetchCmsPosts 의 CmsLetter[] 반환 타입을
// 못 쓴다 — 같은 엔드포인트를 별도 함수로 감싼다.
export async function fetchTrendCards(): Promise<CmsTrendCard[]> {
  try {
    const res = await fetch(`${API_URL}/api/v2/posts?channel=trend_card`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { posts?: CmsTrendCard[] };
    return data.posts ?? [];
  } catch {
    return [];
  }
}

export async function fetchWebtoons(): Promise<CmsWebtoon[]> {
  try {
    const res = await fetch(`${API_URL}/api/v2/posts?channel=webtoon`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { posts?: CmsWebtoon[] };
    return data.posts ?? [];
  } catch {
    return [];
  }
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
  try {
    const res = await fetch(`${API_URL}/api/v2/posts?channel=video`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { posts?: CmsVideo[] };
    return data.posts ?? [];
  } catch {
    return [];
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
