/**
 * CMS 공개 글 조회(읽기 전용) — 웹·앱 공용, 플랫폼 중립(전역 fetch 만 사용).
 *
 * GET {cmsApiUrl}/api/v2/posts?channel=&date=&limit=      목록
 * GET {cmsApiUrl}/api/v2/posts/{slug}                      단건(slug = 글 id)
 * (backend cms_posts_public.py 와 1:1 — 인증 불필요)
 *
 * 웹의 shared/lib/api/cmsPostsApi.ts 는 실패 시 빈 배열을 돌려주는 fail-open 이지만,
 * 앱은 "비어 있음"과 "실패"를 구분해 재시도 UI 를 보여야 하므로 여기서는 실패 시 throw 한다.
 * 타입은 앱이 쓰는 필드만 담은 부분집합이다(웹 전체 계약은 service/frontend 의 letterTypes/cmsPostTypes).
 */
import { getApiConfig } from './config.js';

export type PostChannel = 'letters' | 'paper' | 'feed' | 'webtoon' | 'video' | 'lens';

export interface LetterPost {
  id: string;
  editor_id: string;
  headline: string;
  subtitle: string | null;
  body: string[];
  key_points: string[];
  cover_image_url?: string | null;
  photo_image_url?: string | null;
  source_url?: string | null;
  publish_date?: string | null;
  published_at?: string | null;
  category?: string | null;
}

export interface LensItem {
  label: string;
  question: string;
  bullets: string[];
  paragraphs?: string[];
}

export interface LensPost {
  id: string;
  editor_id: string;
  headline: string;
  context: string;
  date: string;
  cover_image_url: string | null;
  photo_image_url?: string | null;
  source_url: string | null;
  published_at?: string | null;
  category?: string | null;
  lenses: LensItem[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e;
    throw new ApiError('네트워크 오류');
  }
  if (!res.ok) throw new ApiError(`요청 실패 (${res.status})`, res.status);
  return (await res.json()) as T;
}

export interface ListPostsOptions {
  date?: string;
  limit?: number;
  signal?: AbortSignal;
}

/** 채널 목록 조회. channel=letters 는 lens 글도 섞여 올 수 있으니 호출부가 필요한 필드만 쓴다. */
export async function listPosts<T = LetterPost>(channel: PostChannel, opts: ListPostsOptions = {}): Promise<T[]> {
  const qs = new URLSearchParams({ channel });
  if (opts.date) qs.set('date', opts.date);
  if (opts.limit) qs.set('limit', String(opts.limit));
  const data = await getJson<{ posts?: T[] }>(`${getApiConfig().cmsApiUrl}/api/v2/posts?${qs}`, opts.signal);
  return data.posts ?? [];
}

/** 단건 조회. 없으면 ApiError(status=404). */
export async function getPost<T = LetterPost>(id: string, signal?: AbortSignal): Promise<T> {
  const data = await getJson<{ post: T }>(`${getApiConfig().cmsApiUrl}/api/v2/posts/${encodeURIComponent(id)}`, signal);
  return data.post;
}
