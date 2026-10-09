import { sitemapIds } from '@/shared/lib/seo/sitemapIds';
import { SITE_URL } from '@/shared/constants/site';

// 사이트맵 색인(/sitemap.xml 로 다시 쓰여 서비스된다 — next.config.ts rewrites). 실제 URL은 /sitemap/{id}.xml(core, YYYY-MM)에 나눠 담겨 있다(app/sitemap.ts 참조).
// CDN이 캐시하도록 s-maxage를 명시한다(봇이 자주 가져가도 오리진에는 시간당 한 번 수준).
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const ids = await sitemapIds();
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    ids
      .map(({ id, lastModified }) => `  <sitemap><loc>${SITE_URL}/sitemap/${id}.xml</loc><lastmod>${new Date(lastModified).toISOString()}</lastmod></sitemap>`)
      .join('\n') +
    `\n</sitemapindex>\n`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
