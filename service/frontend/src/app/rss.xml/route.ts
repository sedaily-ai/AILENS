import { fetchCmsPosts } from '@/shared/lib/cmsPostsApi';
import { letterHref } from '@/shared/lib/letterHref';

// AI LENS RSS 2.0 피드 — en.sedaily.com/rss/newsall 패턴 참고(2026-08-07).
// AI 크롤러/뉴스 애그리게이터가 sitemap 외에 RSS로도 신규 콘텐츠를 빠르게
// 발견할 수 있게 한다. 정적 export이므로 빌드타임에 한 번 생성되는 정적
// Route Handler — 요청별 동적 데이터에 의존하지 않는다(request 미사용).
export const dynamic = 'force-static';

const BASE = 'https://ailens.sedaily.ai';
const FEED_LIMIT = 30;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toRfc822(dateStr: string | null | undefined): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  return isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

export async function GET() {
  const letters = await fetchCmsPosts('letters', undefined, FEED_LIMIT);

  const items = letters
    .map((l) => {
      const url = `${BASE}${letterHref(l.id)}`;
      const description =
        l.subtitle?.trim() ||
        (l.body_html ? stripHtml(l.body_html) : (l.body ?? []).join(' ')).slice(0, 300);
      return `  <item>
    <title>${escapeXml(l.headline)}</title>
    <link>${url}</link>
    <guid isPermaLink="true">${url}</guid>
    <pubDate>${toRfc822(l.publish_date)}</pubDate>
    <description>${escapeXml(description)}</description>
  </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>AI LENS — 서울경제신문</title>
  <link>${BASE}</link>
  <atom:link href="${BASE}/rss.xml" rel="self" type="application/rss+xml" />
  <description>서울경제신문이 만드는 AI 경제 뉴스. 그날의 핵심 이슈를 매일 정리해 전합니다.</description>
  <language>ko-KR</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
