import { fetchCmsPosts, fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { letterHref } from '@/shared/lib/letterHref';
import { lensPath } from '@/shared/lib/lensUrl';

// AI LENS RSS 2.0 피드 — en.sedaily.com/rss/newsall 패턴 참고(2026-08-07).
// AI 크롤러/뉴스 애그리게이터가 sitemap 외에 RSS로도 신규 콘텐츠를 빠르게
// 발견할 수 있게 한다. SSR(2026-08-08)로 요청마다 동적 생성 — admin 발행이
// 재빌드 없이 바로 반영된다(force-static 이었던 이전엔 빌드 시점에 고정됐음).

import { SITE_URL as BASE } from '@/shared/constants/site';
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
  // lens("오늘의 시선") 채널도 포함(2026-08-14, GEO 감사) — 예전엔 letters만
  // 실어서 RSS를 보는 뉴스 애그리게이터/AI 크롤러가 최근 생긴 채널의 신규
  // 발행물을 못 봤다. 두 채널을 날짜 기준으로 합쳐 최신 FEED_LIMIT개만 노출.
  const [letters, lensPosts] = await Promise.all([
    fetchCmsPosts('letters', undefined, FEED_LIMIT),
    fetchLensPosts(),
  ]);

  type FeedEntry = { title: string; url: string; date: string | null | undefined; description: string };

  // v1.32 — channel=letters 조회는 admin_channel='letters'뿐 아니라 letter
  // 포맷 rendition이 있는 모든 글(=거의 모든 lens 글)을 같이 돌려준다
  // (cms_posts_repo.py — video/webtoon과 같은 설계). 걸러내지 않으면 같은
  // 글이 "제목"(레터 단독)과 "제목 — 4가지 시선"(lens) 두 항목으로 같이
  // 실린다 — lens 쪽만 남긴다.
  const lensIds = new Set(lensPosts.map((l) => l.id));
  const dedupedLetters = letters.filter((l) => !lensIds.has(l.id));

  const letterEntries: FeedEntry[] = dedupedLetters.map((l) => ({
    title: l.headline,
    url: `${BASE}${letterHref(l.id)}`,
    date: l.publish_date,
    description:
      l.subtitle?.trim() ||
      (l.body_html ? stripHtml(l.body_html) : (l.body ?? []).join(' ')).slice(0, 300),
  }));

  const lensEntries: FeedEntry[] = lensPosts.map((l) => ({
    title: `${l.headline} — 4가지 시선`,
    url: `${BASE}${lensPath(l)}`,
    date: l.date,
    description: l.context,
  }));

  const merged = [...letterEntries, ...lensEntries]
    .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
    .slice(0, FEED_LIMIT);

  const items = merged
    .map(
      (e) => `  <item>
    <title>${escapeXml(e.title)}</title>
    <link>${e.url}</link>
    <guid isPermaLink="true">${e.url}</guid>
    <pubDate>${toRfc822(e.date)}</pubDate>
    <description>${escapeXml(e.description)}</description>
  </item>`
    )
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
