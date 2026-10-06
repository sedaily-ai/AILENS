import { buildRssResponse } from '@/shared/lib/rss/buildRssFeed';
import { ECON_CATEGORIES } from '@/shared/constants/econCategories';

// /international/rss.xml — 카테고리별 RSS. 구현은 shared/lib/rss/buildRssFeed.ts.
export async function GET() {
  const category = ECON_CATEGORIES.find((c) => c.slug === 'international');
  return buildRssResponse(category);
}
