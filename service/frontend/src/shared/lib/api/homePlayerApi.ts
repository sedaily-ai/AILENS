/**
 * 홈 화면 하단 플레이 카드("오늘의 핵심 뉴스")의 재생목록 — 기사와 무관하게
 * admin이 직접 "제목 + 유튜브 링크"로 만드는 독립 콘텐츠(2026-08-16).
 * cms_posts 테이블의 channels:["home_player"] 항목을 그대로 쓴다(관리 UI:
 * admin/frontend home-player 화면, shaping: service/backend/handlers/
 * cms_posts_public.py::_shape_home_player_item).
 */
import { API_URL } from '@/shared/config/apiClient';

export interface HomePlayerItem {
  id: string;
  title: string;
  mediaEmbedUrl: string;
  order: number;
}

/**
 * /listen 전용 목록·상세 페이지(2026-08-21, GEO 감사 — 이 재생목록이
 * 홈 위젯에만 있어서 고유 URL이 없어 검색엔진에 전혀 안 걸렸다)에서 쓰는
 * 확장 형태 — date/excerpt가 필요해 백엔드 shaper도 같이 확장했다.
 */
export interface HomePlayerPost extends HomePlayerItem {
  date: string;
  excerpt: string;
}

interface ApiHomePlayerItem {
  id: string;
  title: string;
  excerpt?: string;
  date?: string;
  media_embed_url: string;
  display_order: number;
}

function toItem(i: ApiHomePlayerItem): HomePlayerPost {
  return {
    id: i.id,
    title: i.title,
    excerpt: i.excerpt ?? '',
    date: i.date ?? '',
    mediaEmbedUrl: i.media_embed_url,
    order: i.display_order ?? 0,
  };
}

// 홈 하단 미니 플레이어 전용 — 브라우저에서만 호출되는 위젯이라 항상
// no-store(발행 즉시 반영, 위젯 자체엔 SSR 캐시가 필요 없다).
export async function fetchHomePlayerPlaylist(): Promise<HomePlayerItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/v2/posts?channel=home_player&limit=50`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { posts?: ApiHomePlayerItem[] };
    return data.posts?.filter((i) => i.media_embed_url).map(toItem).sort((a, b) => a.order - b.order) ?? [];
  } catch {
    return [];
  }
}

// SSR용 캐시 옵션 — cmsPostsApi.ts의 cacheOpts()와 동일한 이유로 각
// api 파일이 자체적으로 갖는다(브라우저 fetch에서 next.tags가 표준
// RequestCache 값으로 오인돼 브라우저 HTTP 캐시를 켜버리는 문제 회피,
// cmsPostsApi.ts 상단 주석 참조).
function ssrCacheOpts(tag: string): RequestInit {
  if (typeof window !== 'undefined') return { cache: 'no-store' };
  return { cache: 'force-cache', next: { tags: [tag], revalidate: 300 } };
}

/** /listen 목록 페이지용 — 발행일 순 정렬. */
export async function fetchHomePlayerPosts(): Promise<HomePlayerPost[]> {
  try {
    const res = await fetch(`${API_URL}/api/v2/posts?channel=home_player&limit=100`, ssrCacheOpts('posts:home_player'));
    if (!res.ok) return [];
    const data = (await res.json()) as { posts?: ApiHomePlayerItem[] };
    return (data.posts ?? []).filter((i) => i.media_embed_url).map(toItem);
  } catch {
    return [];
  }
}

/** /listen/{id} 상세 페이지용 단건 조회. */
export async function fetchHomePlayerBySlug(slug: string): Promise<HomePlayerPost | null> {
  try {
    const res = await fetch(`${API_URL}/api/v2/posts/${encodeURIComponent(slug)}`, ssrCacheOpts('posts:home_player'));
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: ApiHomePlayerItem };
    return data.post ? toItem(data.post) : null;
  } catch {
    return null;
  }
}
