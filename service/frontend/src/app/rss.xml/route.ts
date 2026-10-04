import { buildRssResponse } from '@/shared/lib/rss/buildRssFeed';

// AI LENS RSS 2.0 전체 피드 — 구현은 shared/lib/rss/buildRssFeed.ts(카테고리별 /{slug}/rss.xml과 같은 빌더를 공유).
export async function GET() {
  return buildRssResponse();
}
