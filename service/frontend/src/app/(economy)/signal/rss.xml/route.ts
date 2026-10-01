import { buildRssResponse } from '@/shared/lib/rss/buildRssFeed';
import { ECON_CATEGORIES } from '@/shared/constants/econCategories';

// /signal/rss.xml — 카테고리별 RSS(2026-10-01). 구현은 shared/lib/rss/buildRssFeed.ts.
export async function GET() {
  const category = ECON_CATEGORIES.find((c) => c.slug === 'signal');
  return buildRssResponse(category);
}
