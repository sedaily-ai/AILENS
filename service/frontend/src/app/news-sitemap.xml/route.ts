import { fetchCmsPosts, fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { displayCategoryLabel } from '@/shared/constants/econCategories';
import { letterHref } from '@/shared/lib/content/letterHref';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { seoHeadline } from '@/shared/lib/content/displayHeadline';
import { kstTodayStr } from '@/shared/lib/date/date';

// Google News sitemap(news:news 확장, https://www.google.com/schemas/sitemap-news/0.9).
// 일반 sitemap.ts는 구글이 "보통 웹페이지"로 취급해 크롤링 우선순위가 낮으므로, News/Top Stories/Discover가 신규 기사를 빠르게 잡도록 전용 형식을 둔다.
// 별도 수동 신청 없이 이 sitemap과 콘텐츠 정책 준수로 자동 평가 대상이 된다.
//
// 스펙상 최근 2일 이내 발행 기사만 포함한다(오래된 기사는 무시되거나 경고 대상). sitemap.ts의 일반 아카이브용 SEED_DAYS=14와 성격이 다르다.
// NewsArticle 마크업이 있는 콘텐츠(letters + lens)만 대상이며, webtoon/video는 VideoObject/오락 콘텐츠라 제외한다.

import { SITE_URL as BASE } from '@/shared/constants/site';
const NEWS_NS = 'http://www.google.com/schemas/sitemap-news/0.9';
const PUBLICATION_NAME = 'AI LENS';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map((s) => parseInt(s, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export async function GET() {
  const today = kstTodayStr();
  const recentDates = [today, shiftDate(today, -1)];

  const seen = new Set<string>();
  const entries: Array<{ loc: string; headline: string; date: string; publishedAt?: string | null; keywords: string[] }> = [];

  // lens를 먼저 채운다. channel=letters 조회는 letter 포맷 rendition이 있는 모든 글(거의 모든 lens 글)을 함께 돌려주므로(cms_posts_repo.py),
  // letters를 먼저 채우면 lens 글이 /letters/{slug}로 먼저 등록되어 구글 뉴스에 4탭 페이지 대신 레터 단독 페이지가 실린다.
  // lens를 먼저 채우면 겹치는 글은 항상 /lens/{slug}가 이긴다.
  try {
    const lensPosts = await fetchLensPosts();
    for (const l of lensPosts) {
      if (!recentDates.includes(l.date) || seen.has(l.id)) continue;
      seen.add(l.id);
      entries.push({
        loc: `${BASE}${lensPath(l)}`,
        headline: seoHeadline(l.headline), // news:title — 부서 접두사·이모지 제거
        date: l.date,
        publishedAt: l.published_at,
        // 카테고리·하위 카테고리(econSubcategories.ts)로 news:keywords를 채운다. lens에는 용어 키워드 필드가 없어 가장 가까운 신호(주제 분류)를 쓴다(letters 쪽은 실제 용어 키워드 사용).
        keywords: [displayCategoryLabel(l.category), l.subcategory].filter((k): k is string => !!k),
      });
    }
  } catch {
    /* lens API 불통이면 생략 */
  }

  for (const date of recentDates) {
    try {
      const posts = await fetchCmsPosts('letters', date);
      for (const p of posts) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        entries.push({
          loc: `${BASE}${letterHref(p.id)}`,
          headline: p.headline,
          date: p.publish_date ?? date,
          publishedAt: p.published_at,
          keywords: (p.keywords ?? []).map((k) => k.term).filter(Boolean),
        });
      }
    } catch {
      /* 해당 날짜 조회 실패 — 다음 날짜로 계속 (rss.xml/sitemap.ts와 동일 원칙) */
    }
  }

  const urls = entries
    .map(({ loc, headline, date, publishedAt, keywords }) => {
      // 발행 시각(초 단위)이 있으면 쓴다. 07:00 고정이면 같은 날 글이 모두 같은 시각으로 신고되어 신선도 신호가 사라진다(rss.xml pubDate와 같은 문제). 없으면 기존 폴백을 유지한다.
      const pubDate = publishedAt && !isNaN(new Date(publishedAt).getTime())
        ? new Date(publishedAt).toISOString()
        : `${date}T07:00:00+09:00`;
      const keywordsTag = keywords.length
        ? `\n      <news:keywords>${escapeXml(keywords.join(', '))}</news:keywords>`
        : '';
      return `  <url>
    <loc>${loc}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(PUBLICATION_NAME)}</news:name>
        <news:language>ko</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${escapeXml(headline)}</news:title>${keywordsTag}
    </news:news>
  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="${NEWS_NS}">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
