import { describe, expect, it } from 'vitest';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { pickTopArticle } from './topArticle';

const lens = (id: string, paper_section: string | undefined, display_order?: number | null) =>
  ({ id, paper_section, display_order }) as unknown as CmsLens;

describe('pickTopArticle', () => {
  it('지면 1면("전체")만 후보로 본다', () => {
    expect(pickTopArticle([lens('a', '증권'), lens('b', undefined)])).toBeNull();
  });

  it('display_order가 있는 기사를 먼저, 작은 값을 앞에 둔다', () => {
    const picked = pickTopArticle([lens('late', '전체'), lens('second', '전체', 2), lens('first', '전체', 1)]);
    expect(picked?.id).toBe('first');
  });

  it('display_order가 모두 없으면 API 순서(최신순)의 첫 건', () => {
    expect(pickTopArticle([lens('newest', '전체'), lens('older', '전체')])?.id).toBe('newest');
  });
});
