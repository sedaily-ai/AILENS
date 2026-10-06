/**
 * 홈 화면 하단 플레이 카드("오늘의 핵심 뉴스")의 재생목록. 기사와 무관하게 admin이 "제목 + 유튜브 링크"로 만드는 독립 콘텐츠이며,
 * cms_posts 테이블의 channels:["home_player"] 항목을 쓴다(관리 UI: admin/frontend home-player 화면,
 * shaping: service/backend/handlers/cms_posts_public.py::_shape_home_player_item).
 */
import { CMS_API_URL } from '@/shared/config/apiClient';

export interface HomePlayerItem {
  id: string;
  title: string;
  mediaEmbedUrl: string;
  order: number;
}

/** /listen 전용 목록·상세 페이지용 확장 형태. 고유 URL로 검색엔진에 노출되도록 date/excerpt를 포함한다(백엔드 shaper도 같이 확장). */
export interface HomePlayerPost extends HomePlayerItem {
  date: string;
  /** 발행 완료 시각(ISO, UTC). kstDateTimeLabel()이 시:분까지 표기하며 없으면(옛 글) date만 폴백한다. */
  publishedAt?: string | null;
  /** 팟캐스트 전체 대본(접근성 및 상세 페이지 보완). lens 팟캐스트 포맷의 transcript를 그대로 복제한다. */
  transcript?: string | null;
  excerpt: string;
  /** 경제 카테고리(ECON_CATEGORIES). admin/frontend home-player 화면에서 선택하며 없으면(미분류) null이다. lens/letters와 같은 body_inline.category 저장 위치를 재사용한다. */
  category: string | null;
}

interface ApiHomePlayerItem {
  id: string;
  title: string;
  excerpt?: string;
  date?: string;
  media_embed_url: string;
  display_order: number;
  category?: string | null;
  published_at?: string | null;
  transcript?: string | null;
}

function toItem(i: ApiHomePlayerItem): HomePlayerPost {
  return {
    id: i.id,
    title: i.title,
    excerpt: i.excerpt ?? '',
    date: i.date ?? '',
    publishedAt: i.published_at ?? null,
    transcript: i.transcript ?? null,
    mediaEmbedUrl: i.media_embed_url,
    order: i.display_order ?? 0,
    category: i.category ?? null,
  };
}

// 홈 하단 미니 플레이어 전용 — 브라우저에서만 호출되는 위젯이라 항상
// no-store(발행 즉시 반영, 위젯 자체엔 SSR 캐시가 필요 없다).
export async function fetchHomePlayerPlaylist(): Promise<HomePlayerItem[]> {
  try {
    const res = await fetch(`${CMS_API_URL}/api/v2/posts?channel=home_player&limit=50`, {
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

// 홈 "오늘의 뉴스를 귀로" 미리보기(AudioPreviewSection) 전용 축약본. 이 컴포넌트는 최대 4장만 보여주고
// 카드당 id/title/mediaEmbedUrl/category/date만 쓰므로, 서버가 넘기기 전에 4개로 자르고 안 쓰는 필드(팟캐스트 전체 대본 transcript 등)를 비워 홈 HTML 크기를 줄인다.
export function toAudioPreviewSummaries(posts: HomePlayerPost[]): HomePlayerPost[] {
  return posts.slice(0, 5).map((p) => ({ ...p, transcript: null, excerpt: '' }));
}

/** /listen 목록 페이지용 — 발행일 순 정렬. */
export async function fetchHomePlayerPosts(): Promise<HomePlayerPost[]> {
  try {
    // limit=1000: cmsPostsApi.ts의 lens/webtoon/video 목록 fetch와 같은 이유(발행량 증가로 100건 상한을 넘으면 오래된 글이 목록에서 사라진다).
    const res = await fetch(`${CMS_API_URL}/api/v2/posts?channel=home_player&limit=1000`, ssrCacheOpts('posts:home_player'));
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
    // channel=home_player를 명시한다. 한 slug가 여러 포맷 렌디션을 가질 수 있어(형제 채널이 같은 발행물로 묶임) 채널을 주지 않으면 백엔드가 임의의 렌디션을 반환할 수 있다.
    const res = await fetch(`${CMS_API_URL}/api/v2/posts/${encodeURIComponent(slug)}?channel=home_player`, ssrCacheOpts('posts:home_player'));
    if (!res.ok) return null;
    const data = (await res.json()) as { post?: ApiHomePlayerItem };
    return data.post ? toItem(data.post) : null;
  } catch {
    return null;
  }
}
