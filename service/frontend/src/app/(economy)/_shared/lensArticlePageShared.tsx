import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { fetchLensPosts, fetchLensBySlug, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { fetchFollowingLetters } from '@/shared/lib/api/todayLettersApi';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { buildSeoDescription } from '@/shared/lib/seo/sanitizeDescription';
import { clampModifiedIso } from '@/shared/lib/date/date';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { seoHeadline } from '@/shared/lib/content/displayHeadline';
import { ECON_CATEGORIES } from '@/shared/constants/econCategories';
import { pickLensPhoto } from '@/shared/constants/lensPerspectives';
import { LensViewClient } from './LensViewClient';
import type { ArticleNeighbor } from './components/article/ArticleNeighborNav';

import { SITE_URL } from '@/shared/constants/site';

// 카테고리+날짜 경로로 감싼 lens 상세. 7개(markets/property/industry/finance/international/culture/news) 카테고리 폴더가 이 모듈을 공유한다.
// 옛 경로 (content)/[slug]/page.tsx는 lensPath()로 계산한 정본 경로로 redirect만 하는 얇은 페이지다(letters/[id]/page.tsx의 lensPost 리다이렉트와 같은 패턴).
//
// generateStaticParams는 두지 않는다. 카테고리별로 복제하면 정적 생성 수가 7배로 늘고 이득(prefetch 분류)은 작다.
// dynamicParams 기본값(true)+revalidate로 항상 정상 렌더된다.
export const revalidate = 300;
export const dynamicParams = true;

type RouteParams = { year: string; month: string; day: string; slug: string };

async function fetchAllLens(): Promise<CmsLens[]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await fetchLensPosts();
      if (result.length > 0) return result;
    } catch {
      // 다음 시도로.
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return [];
}

async function findLens(slug: string): Promise<CmsLens | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await fetchLensBySlug(slug);
    if (result) return result;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return null;
}

// 하단 "{카테고리} 더 보기"(같은 카테고리 최신 3건)와 "관련 기사"(같은 하위 카테고리 최대 4건,
// 앞 3건과 겹치지 않게)를 한 번에 뽑는다 — 이미 받아온 전체 목록에서 거르므로 추가 API 호출 없음.
// 카테고리가 없는 글(미분류)은 카테고리 무관 최신으로 폴백.
async function findOtherLens(
  slug: string,
  current: CmsLens | null,
): Promise<{ more: CmsLens[]; related: CmsLens[] }> {
  const items = (await fetchAllLens()).filter((l) => l.id !== slug);
  if (!current?.category) return { more: items.slice(0, 3), related: [] };
  const sameCat = items.filter((l) => l.category === current.category);
  const more = sameCat.slice(0, 3);
  const taken = new Set(more.map((l) => l.id));
  const related = current.subcategory
    ? sameCat.filter((l) => l.subcategory === current.subcategory && !taken.has(l.id)).slice(0, 4)
    : [];
  return { more, related };
}

// 이전/다음 기사 — 같은 카테고리 안에서 발행 시각 순. "이전"=더 오래된 글, "다음"=더 최근 글.
// 카테고리가 없는 글은 전체 목록 기준. 이미 받아온 전체 목록에서 고르므로 추가 API 호출은 없다.
async function findNeighbors(slug: string, current: CmsLens | null): Promise<{ prev: ArticleNeighbor | null; next: ArticleNeighbor | null }> {
  if (!current) return { prev: null, next: null };
  const pool = (await fetchAllLens()).filter((l) => (current.category ? l.category === current.category : true));
  const stamp = (l: CmsLens) => l.published_at ?? l.date;
  const sorted = [...pool].sort((a, b) => (stamp(a) < stamp(b) ? 1 : stamp(a) > stamp(b) ? -1 : 0)); // 최신순
  const i = sorted.findIndex((l) => l.id === slug);
  if (i < 0) return { prev: null, next: null };
  const pick = (l: CmsLens | undefined): ArticleNeighbor | null =>
    l ? { id: l.id, date: l.date, category: l.category ?? null, headline: l.headline } : null;
  return { prev: pick(sorted[i + 1]), next: pick(sorted[i - 1]) };
}

const DEFAULT_COVER = `${SITE_URL}/lens/default-cover.webp`;

/** 검색·공유용 대표 이미지. 기사 원 사진(운영 CDN) → 카드/웹툰 컷 → 기본 커버 순이며 RSS(buildRssFeed)와 같은 우선순위다.
 *  cover_image_url만 쓰면 웹툰 컷이 들어가 검색·공유 미리보기가 만화 컷이 된다. */
function pickShareImages(lens: CmsLens): { primary: string; all: string[]; isDefault: boolean } {
  const abs = (u: string | null | undefined) => (u ? (u.startsWith('/') ? `${SITE_URL}${u}` : u) : '');
  const all = [...new Set([abs(pickLensPhoto(lens)), abs(lens.cover_image_url)].filter(Boolean))];
  return all.length > 0 ? { primary: all[0], all, isDefault: false } : { primary: DEFAULT_COVER, all: [DEFAULT_COVER], isDefault: true };
}

/** 빵부스러기용 분류 단계. 분류가 없거나 정본 분류 목록에 없으면 null(단계 생략) — 미분류 글 경로 /news 는 목록 페이지가 없어 링크하면 404. */
function breadcrumbCategory(lens: CmsLens): { name: string; url: string } | null {
  const cat = ECON_CATEGORIES.find((c) => c.label === lens.category);
  return cat ? { name: cat.label, url: `${SITE_URL}/${cat.slug}` } : null;
}

function faqItems(lens: CmsLens) {
  return lens.lenses
    .filter((l) => l.question && l.bullets.length > 0)
    .map((l) => ({
      '@type': 'Question',
      name: l.question,
      acceptedAnswer: { '@type': 'Answer', text: l.bullets.join(' ') },
    }));
}

/** 기사 키워드 — 분류·하위분류를 앞에 두고(검색어 매칭), 서비스 고정어를 뒤에 붙인다. */
function articleKeywords(lens: CmsLens): string[] {
  const headline = seoHeadline(lens.headline);
  return [...new Set([lens.category, lens.subcategory, headline, '경제 뉴스', '뉴스 해설', '오늘의 이슈', '4가지 시선', 'AI LENS', '서울경제'].filter((k): k is string => !!k))];
}

function buildJsonLd(lens: CmsLens) {
  const url = `${SITE_URL}${lensPath(lens)}`;
  const headline = seoHeadline(lens.headline);
  // 발행 시각(초 단위)이 있으면 쓴다(Google 날짜 가이드: 정확한 시각+타임존). 옛 글은 date로 폴백한다.
  const published = lens.published_at || `${lens.date}T07:00:00+09:00`;
  const shareImages = pickShareImages(lens);
  const category = breadcrumbCategory(lens);
  const bodyJoined = [
    lens.context,
    ...lens.lenses.flatMap((l) => [l.question, ...l.bullets]),
  ].join(' ');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'NewsArticle',
        '@id': `${url}#article`,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        headline,
        description: lens.context,
        articleBody: bodyJoined,
        articleSection: lens.category || '경제',
        // GEO·AEO 보강 — 분류·주제·요약·출처·저작권·읽기 동작을 기계가 읽도록 명시.
        abstract: lens.context,
        keywords: articleKeywords(lens),
        thumbnailUrl: shareImages.primary,
        genre: '뉴스 해설',
        about: [{ '@type': 'Thing', name: lens.category || '경제' }, ...(lens.subcategory ? [{ '@type': 'Thing', name: lens.subcategory }] : [])],
        copyrightHolder: { '@id': `${SITE_URL}/#organization` },
        copyrightYear: Number(lens.date.slice(0, 4)),
        creditText: '서울경제신문 AI LENS',
        potentialAction: { '@type': 'ReadAction', target: [url] },
        wordCount: bodyJoined.length,
        datePublished: published,
        dateModified: clampModifiedIso(lens.updated_at, published),
        inLanguage: 'ko-KR',
        author: {
          '@type': 'Organization',
          name: 'AI LENS 편집팀',
          description:
            '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 요약·재구성한 초안을 작성하고, 편집팀이 검수해 발행합니다.',
          url: `${SITE_URL}/about`,
          parentOrganization: { '@id': `${SITE_URL}/#organization` },
        },
        publisher: { '@id': `${SITE_URL}/#organization` },
        // 실제 크기를 모르는 이미지에 1200×800을 지정하지 않는다. 사진 + 카드/웹툰 컷을 함께 제공한다.
        image: shareImages.all.map((u) => ({ '@type': 'ImageObject', url: u })),
        ...(lens.source_url
          ? {
              citation: lens.source_url,
              // 이 글이 어느 원문 취재 기사를 바탕으로 했는지(서울경제 원문 링크) — 출처 신호.
              isBasedOn: { '@type': 'NewsArticle', url: lens.source_url, publisher: { '@id': `${SITE_URL}/#organization` } },
            }
          : {}),
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['[data-speakable="headline"]', '[data-speakable="summary"]', '[data-speakable="qa"]'],
        },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: lens.lenses.map((l, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: l.label,
            item: {
              '@type': 'Question',
              name: l.question,
              acceptedAnswer: { '@type': 'Answer', text: l.bullets.join(' ') },
            },
          })),
        },
        isAccessibleForFree: true,
      },
      // 질문-답변 구조를 FAQPage로도 노출 — 화면의 4가지 시선 Q&A와 같은 내용이라 AI 답변 엔진·리치 결과가 인용한다.
      ...(faqItems(lens).length > 0
        ? [
            {
              '@type': 'FAQPage',
              '@id': `${url}#faq`,
              url,
              inLanguage: 'ko-KR',
              mainEntity: faqItems(lens),
            },
          ]
        : []),
      {
        '@type': 'BreadcrumbList',
        // AI LENS > {분류} > 기사. 분류가 없으면 단계를 건너뛴다.
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
          ...(category ? [{ '@type': 'ListItem', position: 2, name: category.name, item: category.url }] : []),
          { '@type': 'ListItem', position: category ? 3 : 2, name: headline, item: url },
        ],
      },
    ],
  };
}

export async function buildLensArticleMetadata(
  expectedCategorySlug: string,
  paramsPromise: Promise<RouteParams>,
): Promise<Metadata> {
  const { slug: rawSlug } = await paramsPromise;
  const slug = decodeURIComponent(rawSlug);
  const lens = await findLens(slug);
  if (!lens) {
    return { title: '이슈를 찾을 수 없어요', robots: { index: false } };
  }
  // 제목은 정제한 헤드라인만 쓴다(부서 접두사·이모지·"— 4가지 시선" 제외). layout 템플릿이 " | AI LENS"를 붙여도 검색 결과에서 잘리지 않는 길이가 된다.
  const headline = seoHeadline(lens.headline);
  const title = buildPageTitle(headline);
  const description = buildSeoDescription(lens.context, '오늘의 이슈를 4가지 시선으로 짚어드려요.');
  const url = `${SITE_URL}${lensPath(lens)}`;
  const shareImages = pickShareImages(lens);
  return {
    title,
    description,
    keywords: articleKeywords(lens),
    authors: [{ name: 'AI LENS 편집팀', url: `${SITE_URL}/about` }],
    category: lens.category || '경제',
    alternates: { canonical: url, languages: { 'ko-KR': url } },
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      publishedTime: lens.published_at || `${lens.date}T07:00:00+09:00`,
      modifiedTime: clampModifiedIso(lens.updated_at, lens.published_at || `${lens.date}T07:00:00+09:00`),
      authors: ['AI LENS 편집팀'],
      section: '경제',
      tags: articleKeywords(lens),
      // 실제 크기를 모르는 이미지에 1200×800을 박지 않는다. 기본 커버만 알려진 크기를 쓴다.
      images: shareImages.isDefault ? [{ url: shareImages.primary, width: 1200, height: 800, alt: headline }] : [{ url: shareImages.primary, alt: headline }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [shareImages.primary],
    },
    // 검색·공유·서지 보강 메타: 뉴스 키워드, 수정 시각, 분류, Dublin Core, 슬랙·트위터 라벨.
    other: {
      news_keywords: articleKeywords(lens).join(', '),
      'og:updated_time': clampModifiedIso(lens.updated_at, lens.published_at || `${lens.date}T07:00:00+09:00`),
      'article:publisher': 'https://www.facebook.com/seouleconomydaily/',
      'DC.title': headline,
      'DC.creator': 'AI LENS 편집팀',
      'DC.subject': articleKeywords(lens).join(', '),
      'DC.description': description,
      'DC.date': lens.published_at || `${lens.date}T07:00:00+09:00`,
      'DC.identifier': url,
      'DC.source': lens.source_url || url,
      'twitter:label1': '분류',
      'twitter:data1': lens.category || '경제',
      'twitter:label2': '발행',
      'twitter:data2': lens.date,
    },
  };
}

export async function LensArticlePageContent(
  expectedCategorySlug: string,
  paramsPromise: Promise<RouteParams>,
) {
  const { year, month, day, slug: rawSlug } = await paramsPromise;
  const slug = decodeURIComponent(rawSlug);
  const [lens, hotLetters] = await Promise.all([findLens(slug), fetchFollowingLetters(10)]);
  const { more: otherLens, related: relatedLens } = await findOtherLens(slug, lens);
  const neighbors = await findNeighbors(slug, lens);

  // 요청 경로(카테고리/연/월/일)가 실제 글의 정본 경로와 다르면(재분류, 잘못된 카테고리 폴더 링크 등) 정본으로 리다이렉트한다.
  // letters/[id]/page.tsx의 lensPost 리다이렉트와 같은 원칙이며, 같은 글이 두 URL로 색인되는 것을 막는다.
  if (lens) {
    const canonical = lensPath(lens);
    // lensPath()가 마지막 세그먼트를 encodeURIComponent로 만들므로 비교 대상도 같은 인코딩으로 맞춘다. 아니면 정상 요청도 항상 다르다고 판정되어 매번 리다이렉트된다.
    const requested = `/${expectedCategorySlug}/${year}/${month}/${day}/${encodeURIComponent(slug)}`;
    if (requested !== canonical) {
      redirect(canonical);
    }
  }

  const jsonLd = lens ? buildJsonLd(lens) : null;
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <LensViewClient slug={slug} initialLens={lens} otherLens={otherLens} relatedLens={relatedLens} neighbors={neighbors} initialHotLetters={hotLetters} />
    </>
  );
}
