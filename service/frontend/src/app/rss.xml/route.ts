import { buildRssResponse } from '@/shared/lib/rss/buildRssFeed';

// AI LENS RSS 2.0 전체 피드 — 구현·변경 이력은 shared/lib/rss/buildRssFeed.ts
// (카테고리별 /{slug}/rss.xml 과 같은 빌더를 공유, 2026-10-01 분리).
export async function GET() {
  return buildRssResponse();
}
