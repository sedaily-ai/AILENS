/**
 * 홈 화면 하단 플레이 카드("오늘의 핵심 뉴스")의 재생목록 — 기사와 무관하게
 * admin이 직접 "제목 + 유튜브 링크"로 만드는 독립 콘텐츠(2026-08-16).
 * cms_posts 테이블의 channels:["home_player"] 항목을 그대로 쓴다(관리 UI:
 * admin/frontend home-player 화면, shaping: service/backend/handlers/
 * cms_posts_public.py::_shape_home_player_item).
 */
import { API_URL } from '@/shared/config/api';

export interface HomePlayerItem {
  id: string;
  title: string;
  mediaEmbedUrl: string;
  order: number;
}

interface ApiHomePlayerItem {
  id: string;
  title: string;
  media_embed_url: string;
  display_order: number;
}

export async function fetchHomePlayerPlaylist(): Promise<HomePlayerItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/v2/posts?channel=home_player&limit=50`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { posts?: ApiHomePlayerItem[] };
    return (data.posts ?? [])
      .filter((i) => i.media_embed_url)
      .map((i) => ({ id: i.id, title: i.title, mediaEmbedUrl: i.media_embed_url, order: i.display_order ?? 0 }))
      .sort((a, b) => a.order - b.order);
  } catch {
    return [];
  }
}
