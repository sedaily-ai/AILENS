import { ApiError, getPost, listPosts, type LensPost, type LetterPost } from '@ailens/api-client';
import { useAsync } from '../../lib/useAsync';

export type Article =
  | { kind: 'lens'; post: LensPost; related: LensPost[] }
  | { kind: 'letter'; post: LetterPost; related: LensPost[] };

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
      article = post && Array.isArray(post.lenses) ? { kind: 'lens', post, related: [] } : { kind: 'letter', post: post as unknown as LetterPost, related: [] };
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
      article = { kind: 'letter', post: await getPost<LetterPost>(slug, { signal }), related: [] };
    }
    const category = article.post.category;
    const all = await relatedAll;
    article.related = all.filter((l) => l.id !== slug && category && l.category === category).slice(0, 4);
    return article;
  }, [slug]);
}
