import { fetchAllLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { kstTodayStr } from '@/shared/lib/date/date';

// 사이트맵 파일 목록의 단일 출처 — 색인 route(app/sitemap.xml/route.ts)와 generateSitemaps(app/sitemap.ts)가 같이 쓴다.
//   core    : 분류·정적 페이지·지면·타임라인·게임(작고 자주 쓰는 진입점)
//   YYYY-MM : 그 달에 발행된 기사(기사별 images·videos 확장 포함)
export const CORE_SITEMAP_ID = 'core';

export async function sitemapIds(): Promise<{ id: string; lastModified: string }[]> {
  const posts = await fetchAllLensPosts();
  const latestByMonth = new Map<string, string>();
  for (const l of posts) {
    const month = l.date.slice(0, 7);
    const stamp = l.published_at || `${l.date}T07:00:00+09:00`;
    if ((latestByMonth.get(month) ?? '') < stamp) latestByMonth.set(month, stamp);
  }
  const months = [...latestByMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return [{ id: CORE_SITEMAP_ID, lastModified: months[0]?.[1] ?? `${kstTodayStr()}T07:00:00+09:00` }, ...months.map(([id, lastModified]) => ({ id, lastModified }))];
}

