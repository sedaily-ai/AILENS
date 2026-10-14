import { ApiError, getPost, listPosts, type LensPost, type LetterPost } from '@ailens/api-client';
import { useAsync } from '../../lib/useAsync';

interface Extras {
  /** 같은 분류의 다른 글(최대 4건). */
  related: LensPost[];
  /** 발행순 이웃 글(최신 100건 안에 있을 때만). prev = 더 오래된 글, next = 더 최근 글. */
  prev: LensPost | null;
  next: LensPost | null;
}
export type Article =
  | ({ kind: 'lens'; post: LensPost } & Extras)
  | ({ kind: 'letter'; post: LetterPost } & Extras);

/**
 * 같은 글이 lens·letters 등 여러 채널로 발행되므로 lens 형태를 먼저 시도하고, 없으면(404) letters 형태로 읽는다.
 * "같은 분류 다른 글"은 최신 lens 100건에서 같은 분류만 골라 4건(실패해도 본문은 보여 준다).
 */
export function useArticle(slug: string) {
  return useAsync<Article>(async (signal) => {
    const relatedAll = listPosts<LensPost>('lens', { limit: 100, signal }).catch(() => [] as LensPost[]);
    let article: Article;
    try {
      const post = await getPost<LensPost>(slug, { channel: 'lens', signal });
      article = post && Array.isArray(post.lenses) ? { kind: 'lens', post, related: [], prev: null, next: null } : { kind: 'letter', post: post as unknown as LetterPost, related: [], prev: null, next: null };
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
      article = { kind: 'letter', post: await getPost<LetterPost>(slug, { signal }), related: [], prev: null, next: null };
    }
    const category = article.post.category;
    const all = await relatedAll;
    article.related = all.filter((l) => l.id !== slug && category && l.category === category).slice(0, 4);
    const at = all.findIndex((l) => l.id === slug);
    if (at >= 0) {
      article.next = all[at - 1] ?? null; // 목록은 최신순이라 앞이 더 최근
      article.prev = all[at + 1] ?? null;
    }
    return article;
  }, [slug]);
}
