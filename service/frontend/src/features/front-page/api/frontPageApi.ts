/**
 * Front Page(지면 1면) API client.
 *
 * GET /api/v2/front-page?date=YYYY-MM-DD
 * (backend/v2/handlers/front_page.py 와 1:1 — envelope 없음)
 *
 * mock fallback 없음 — 저장소가 진실의 원천 (spec §5.3).
 */
import { API_URL } from '@/shared/config/api';

// 본문 블록 — S3 original.json 의 content_blocks 실물 shape (2026-07-23 실측)
export interface FrontPageBlockImage {
  type: 'image';
  url: string;
  alt?: string;
  caption?: string;
  width?: string;
}

export interface FrontPageBlockText {
  type: 'text';
  text_ko: string;
}

export type FrontPageBlock = FrontPageBlockImage | FrontPageBlockText;

export interface FrontPageArticle {
  news_id: string;
  title: string;
  sub_title: string;
  category: string;
  author_name: string;
  published_at: string | null;
  url: string;
  image_url: string;
  is_top: boolean;
  content: string;
  content_blocks: FrontPageBlock[];
}

export interface FrontPageResponse {
  requested_date: string;
  paper_date: string;
  is_fallback: boolean;
  articles: FrontPageArticle[];
}

// 날짜별 응답 캐시 — Promise 자체를 캐시해 동시 호출이 같은 fetch 공유
// (todayLettersApi 와 동일 패턴).
const cache = new Map<string, Promise<FrontPageResponse>>();

export async function fetchFrontPage(date?: string): Promise<FrontPageResponse> {
  const key = date ?? '__today__';
  const hit = cache.get(key);
  if (hit) return hit;

  const promise = (async () => {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    const res = await fetch(`${API_URL}/api/v2/front-page${qs}`);
    if (!res.ok) {
      throw new Error(`front-page API ${res.status}`);
    }
    return (await res.json()) as FrontPageResponse;
  })();

  // 실패 시 다음 호출에서 재시도되도록 cache 에서 제거.
  promise.catch(() => cache.delete(key));
  cache.set(key, promise);
  return promise;
}
