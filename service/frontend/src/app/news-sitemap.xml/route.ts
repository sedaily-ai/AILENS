import { fetchCmsPosts, fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { letterHref } from '@/shared/lib/letterHref';
import { kstTodayStr } from '@/shared/lib/date';

// Google News sitemap (news:news 확장, https://www.google.com/schemas/sitemap-news/0.9) —
// 2026-08-12, "실시간 뉴스가 검색엔진 노출이 어렵지 않나" 질문에서 시작.
// 일반 sitemap.ts는 구글이 페이지를 "보통 웹페이지"로 취급해 크롤링 우선순위가
// 낮다 — News/Top Stories/Discover가 신규 기사를 몇 분~수시간 단위로 잡아채는
// 건 이 전용 sitemap 형식이 신호를 준다. Google News 진입은 수동 신청 절차가
// 2019년경 폐지됐고, 이 sitemap + 콘텐츠 정책 준수만으로 자동 평가 대상이 된다.
//
// 스펙상 "최근 2일 이내에 발행된 기사만" 포함해야 한다(오래된 기사를 넣으면
// 무시되거나 경고 대상) — sitemap.ts의 일반 아카이브용 SEED_DAYS=14와는
// 성격이 다르다. NewsArticle 마크업이 있는 콘텐츠(letters + lens, 2026-08-13
// lens를 Article→NewsArticle로 전환하며 함께 포함)만 대상 — webtoon/video는
// 여전히 VideoObject/오락 콘텐츠라 뉴스 sitemap 성격이 아니다.

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
  const entries: Array<{ loc: string; headline: string; date: string; keywords: string[] }> = [];

  // v1.32 — lens 먼저 채운다. channel=letters 조회는 admin_channel='letters'
  // 뿐 아니라 letter 포맷 rendition이 있는 모든 글(=거의 모든 lens 글)을
  // 같이 돌려준다(cms_posts_repo.py — video/webtoon과 같은 설계). 예전엔
  // letters를 먼저 채워서 lens 글이 /letters/{slug} URL로 먼저 seen에
  // 들어가 버렸다 — 구글 뉴스에 4탭 페이지 대신 레터 단독 페이지가
  // 실렸다(사용자 신고: "4개 탭이 안 나온다"가 종종 있었던 원인 중 하나).
  // lens를 먼저 채우면 겹치는 글은 항상 /lens/{slug}가 이긴다.
  try {
    const lensPosts = await fetchLensPosts();
    for (const l of lensPosts) {
      if (!recentDates.includes(l.date) || seen.has(l.id)) continue;
      seen.add(l.id);
      entries.push({
        loc: `${BASE}/${encodeURIComponent(l.id)}`,
        headline: l.headline,
        date: l.date,
        keywords: [],
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
          keywords: (p.keywords ?? []).map((k) => k.term).filter(Boolean),
        });
      }
    } catch {
      /* 해당 날짜 조회 실패 — 다음 날짜로 계속 (rss.xml/sitemap.ts와 동일 원칙) */
    }
  }

  const urls = entries
    .map(({ loc, headline, date, keywords }) => {
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
      <news:publication_date>${date}T07:00:00+09:00</news:publication_date>
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
