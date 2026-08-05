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

export type CmsChannel = 'letters' | 'paper' | 'feed';

/** letters/feed 채널 응답은 ApiLetter 와 같은 모양 + is_cms 표식. */
export type CmsLetter = ApiLetter & { is_cms: true };

export async function fetchCmsPosts(
  channel: CmsChannel,
  date?: string,
): Promise<CmsLetter[]> {
  try {
    const qs = new URLSearchParams({ channel });
    if (date) qs.set('date', date);
    // API 응답의 Cache-Control(max-age=300)을 브라우저가 그대로 따르면 admin
    // 발행/수정/삭제가 새로고침해도 최대 5분간 안 보인다 — no-store 로 우회.
    const res = await fetch(`${API_URL}/api/v2/posts?${qs}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { posts?: CmsLetter[] };
    return data.posts ?? [];
  } catch {
    return [];
  }
}
