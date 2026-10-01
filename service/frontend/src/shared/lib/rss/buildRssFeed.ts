import { fetchCmsPosts, fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { letterHref } from '@/shared/lib/letterHref';
import { lensPath } from '@/shared/lib/lensUrl';
import { pickLensPhoto } from '@/shared/constants/lensPerspectives';
import type { EconCategoryConfig } from '@/shared/constants/econCategories';
import { SITE_URL as BASE } from '@/shared/constants/site';

// AI LENS RSS 2.0 피드 — 전체 피드(/rss.xml)와 카테고리별 피드
// (/{slug}/rss.xml)가 이 빌더 하나를 공유한다(2026-10-01 분리).
//
// 배경: en.sedaily.com/rss/newsall 패턴 참고(2026-08-07). 뉴스 애그리게이터·
// 피드 리더가 sitemap 외에 RSS로도 신규 콘텐츠를 빠르게 발견할 수 있게
// 한다. SSR(2026-08-08)로 요청마다 동적 생성 — admin 발행이 재빌드 없이
// 바로 반영된다.
//
// 2026-10-01 1차(사용자 요청 "AI나 구글 엔진이 선호하는 rss 형식"):
//  1. pubDate를 날짜 자정 고정에서 published_at(초 단위)으로 — 같은 날
//     발행된 글이 전부 같은 타임스탬프라 신선도 신호·정렬이 무의미했다.
//  2. content:encoded로 "30초 핵심"까지 풍부한 본문 — 전체 4포맷 본문은
//     아니다(피드 용량, cmsPostsApi.ts의 2MB 캐시 한도 사례 참조).
//  3. category·대표 이미지(media RSS) 추가.
// 2026-10-01 2차:
//  4. description을 30초 핵심 앞 두 항목으로 — 기존엔 context(수십 자,
//     예: "영업이익률 年 20~30% 수준")라 스니펫이 무슨 기사인지 못 알렸다.
//  5. lastBuildDate를 요청 시각이 아니라 가장 최신 글의 발행 시각으로 —
//     요청 시각이면 피드가 매번 "방금 갱신"으로 보여 신선도 신호가 거짓이 된다.
//  6. content:encoded 하단에 4가지 시선 페이지·원문 기사 링크 — 인용·역링크용.
//  7. 채널 메타(image·ttl)와 카테고리별 피드.
// (WebSub 허브 알림은 외부 호출이 필요해 이번 범위에서 제외.)

const FEED_LIMIT = 30;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(html: string): string {
  // CDATA 안에 "]]>"가 그대로 들어가면 섹션이 조기 종료된다 — 사실상
  // 나올 일 없는 시퀀스지만 방어적으로 끊어둔다(표준 관례).
  return `<![CDATA[${html.replace(/]]>/g, ']]&gt;')}]]>`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function toRfc822(dateStr: string | null | undefined): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  return isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

interface FeedEntry {
  title: string;
  url: string;
  date: string | null | undefined;
  description: string;
  contentHtml: string;
  categories: string[];
  imageUrl?: string | null;
  /** 서울경제 원문 기사 URL — dc:source(원본 자료)로 싣는다. */
  sourceUrl?: string | null;
}

function linksHtml(url: string, sourceUrl?: string | null): string {
  const lens = `<a href="${escapeXml(url)}">레터·웹툰·팟캐스트·영상 4가지 시선으로 보기</a>`;
  const source = sourceUrl ? ` · <a href="${escapeXml(sourceUrl)}">서울경제 원문 기사</a>` : '';
  return `<p>${lens}${source}</p>`;
}

export async function buildRssResponse(category?: EconCategoryConfig): Promise<Response> {
  const [letters, lensPosts] = await Promise.all([
    fetchCmsPosts('letters', undefined, FEED_LIMIT * (category ? 4 : 1)),
    fetchLensPosts(),
  ]);

  // v1.32 — channel=letters 조회는 admin_channel='letters'뿐 아니라 letter
  // 포맷 rendition이 있는 모든 글(=거의 모든 lens 글)을 같이 돌려준다
  // (cms_posts_repo.py — video/webtoon과 같은 설계). 걸러내지 않으면 같은
  // 글이 "제목"(레터 단독)과 "제목 — 4가지 시선"(lens) 두 항목으로 같이
  // 실린다 — lens 쪽만 남긴다.
  const lensIds = new Set(lensPosts.map((l) => l.id));
  const dedupedLetters = letters.filter((l) => !lensIds.has(l.id));

  // 카테고리 피드 필터 — 카테고리 아카이브 페이지와 같은 규칙: 일반은 글의
  // category(주제)로, "시그널"(filterBy:'paperSection')은 paper_section으로
  // 거른다(econCategories.ts 참조). 시그널은 lens 전용 코너라 letters는 제외.
  const lensFiltered = category
    ? lensPosts.filter((l) =>
        category.filterBy === 'paperSection' ? l.paper_section === category.label : l.category === category.label,
      )
    : lensPosts;
  const lettersFiltered = category
    ? category.filterBy === 'paperSection'
      ? []
      : dedupedLetters.filter((l) => l.category === category.label)
    : dedupedLetters;

  const letterEntries: FeedEntry[] = lettersFiltered.map((l) => {
    const description = clip(
      l.subtitle?.trim() || (l.body_html ? stripHtml(l.body_html) : (l.body ?? []).join(' ')),
      300,
    );
    const points = l.key_points ?? [];
    const url = `${BASE}${letterHref(l.id)}`;
    const contentHtml =
      `<p>${escapeXml(description)}</p>` +
      (points.length > 0 ? `<ul>${points.map((p) => `<li>${escapeXml(p)}</li>`).join('')}</ul>` : '') +
      `<p><a href="${escapeXml(url)}">전문 보기</a></p>`;
    return {
      title: l.headline,
      url,
      date: l.published_at ?? l.publish_date,
      description,
      contentHtml,
      categories: [l.category].filter((c): c is string => !!c),
      imageUrl: l.photo_image_url || l.cover_image_url,
    };
  });

  const lensEntries: FeedEntry[] = lensFiltered.map((l) => {
    const letterBullets = (l.lenses.find((x) => x.label === '레터')?.bullets ?? []).filter(Boolean);
    const url = `${BASE}${lensPath(l)}`;
    // 스니펫은 30초 핵심 앞 두 항목 — 없으면(옛 글) context 폴백.
    const description = clip(letterBullets.slice(0, 2).join(' ') || l.context, 300);
    const contentHtml =
      `<p>${escapeXml(l.context)}</p>` +
      (letterBullets.length > 0
        ? `<p><strong>30초 핵심</strong></p><ul>${letterBullets.map((b) => `<li>${escapeXml(b)}</li>`).join('')}</ul>`
        : '') +
      linksHtml(url, l.source_url);
    return {
      title: `${l.headline} — 4가지 시선`,
      url,
      date: l.published_at ?? l.date,
      description,
      contentHtml,
      categories: [l.category, l.subcategory].filter((c): c is string => !!c),
      imageUrl: pickLensPhoto(l) || l.cover_image_url,
      sourceUrl: l.source_url,
    };
  });

  const merged = [...letterEntries, ...lensEntries]
    .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
    .slice(0, FEED_LIMIT);

  const items = merged
    .map((e) => {
      const categoryTags = e.categories
        .map((c) => `\n    <category>${escapeXml(c)}</category>`)
        .join('');
      const imageTags = e.imageUrl
        ? `\n    <media:content url="${escapeXml(e.imageUrl)}" medium="image" />` +
          `\n    <media:thumbnail url="${escapeXml(e.imageUrl)}" />`
        : '';
      const sourceTag = e.sourceUrl ? `\n    <dc:source>${escapeXml(e.sourceUrl)}</dc:source>` : '';
      return `  <item>
    <title>${escapeXml(e.title)}</title>
    <link>${e.url}</link>
    <guid isPermaLink="true">${e.url}</guid>
    <pubDate>${toRfc822(e.date)}</pubDate>
    <dc:creator>서울경제신문 AI LENS 편집팀</dc:creator>
    <description>${escapeXml(e.description)}</description>
    <content:encoded>${cdata(e.contentHtml)}</content:encoded>${sourceTag}${categoryTags}${imageTags}
  </item>`;
    })
    .join('\n');

  const feedPath = category ? `/${category.slug}/rss.xml` : '/rss.xml';
  const title = category ? `AI LENS ${category.label} — 서울경제신문` : 'AI LENS — 서울경제신문';
  const description = category
    ? `서울경제신문 AI LENS ${category.label} — ${category.description}`
    : '서울경제신문이 만드는 AI 경제 뉴스. 그날의 핵심 이슈를 매일 정리해 전합니다.';
  // 가장 최신 글의 발행 시각 — 글이 없으면 요청 시각으로 폴백.
  const lastBuild = merged.length > 0 ? toRfc822(merged[0].date) : new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>${escapeXml(title)}</title>
  <link>${BASE}${category ? `/${category.slug}` : ''}</link>
  <atom:link href="${BASE}${feedPath}" rel="self" type="application/rss+xml" />
  <description>${escapeXml(description)}</description>
  <language>ko-KR</language>
  <copyright>Copyright 서울경제신문. All rights reserved.</copyright>
  <lastBuildDate>${lastBuild}</lastBuildDate>
  <ttl>30</ttl>
  <image>
    <url>${BASE}/icon-512.png</url>
    <title>${escapeXml(title)}</title>
    <link>${BASE}</link>
    <width>144</width>
    <height>144</height>
  </image>
${items}
</channel>
</rss>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
