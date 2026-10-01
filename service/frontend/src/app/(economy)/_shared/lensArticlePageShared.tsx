import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { fetchLensPosts, fetchLensBySlug, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { fetchFollowingLetters } from '@/shared/lib/api/todayLettersApi';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { buildSeoDescription } from '@/shared/lib/seo/sanitizeDescription';
import { clampModifiedIso } from '@/shared/lib/date';
import { lensPath } from '@/shared/lib/lensUrl';
import { LensViewClient } from './LensViewClient';

import { SITE_URL } from '@/shared/constants/site';

// 카테고리+날짜 경로 감싼 lens 상세 — 7개(markets/property/industry/
// finance/international/culture/news) 카테고리 폴더가 전부 이 모듈
// 하나를 공유한다(2026-09-30). 원래 (content)/[slug]/page.tsx에 있던
// 로직을 그대로 옮겼고, 그 옛 경로는 이제 lensPath()로 계산한 정본
// 경로로 redirect만 하는 얇은 페이지로 남는다(letters/[id]/page.tsx의
// lensPost 리다이렉트와 같은 패턴).
//
// generateStaticParams는 의도적으로 안 둔다 — 원래(단일 세그먼트
// /lens/[slug]) "Link 프리페치 분류" 목적으로 최소 10건만 정적 생성했는데,
// 카테고리별로 나뉜 지금 그 값을 그대로 복제하면 7배로 불어나고
// 실질 이득(prefetch 분류)은 크지 않다 — dynamicParams 기본값(true)+
// revalidate로 항상 정상 렌더된다.
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

async function findOtherLens(slug: string, limit = 3): Promise<CmsLens[]> {
  const items = await fetchAllLens();
  return items.filter((l) => l.id !== slug).slice(0, limit);
}

function buildJsonLd(lens: CmsLens) {
  const url = `${SITE_URL}${lensPath(lens)}`;
  // 발행 시각(초 단위)이 있으면 그걸 쓴다(2026-10-01, Google 날짜 가이드 —
  // 정확한 시각+타임존). 옛 글은 date 폴백.
  const published = lens.published_at || `${lens.date}T07:00:00+09:00`;
  const image = lens.cover_image_url || `${SITE_URL}/lens/default-cover.webp`;
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
        headline: lens.headline,
        description: lens.context,
        articleBody: bodyJoined,
        articleSection: '경제',
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
        image: { '@type': 'ImageObject', url: image, width: 1200, height: 800 },
        ...(lens.source_url ? { citation: lens.source_url } : {}),
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
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '시선', item: `${SITE_URL}/lens` },
          { '@type': 'ListItem', position: 3, name: lens.headline, item: url },
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
  const title = buildPageTitle(lens.headline, '4가지 시선');
  const description = buildSeoDescription(lens.context, '오늘의 이슈를 4가지 시선으로 짚어드려요.');
  const url = `${SITE_URL}${lensPath(lens)}`;
  const image = lens.cover_image_url || `${SITE_URL}/lens/default-cover.webp`;
  return {
    title,
    description,
    keywords: ['오늘의 이슈', '4가지 시선', lens.headline, '뉴스 해설', 'AI LENS', '서울경제'],
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      publishedTime: lens.published_at || `${lens.date}T07:00:00+09:00`,
      modifiedTime: clampModifiedIso(lens.updated_at, lens.published_at || `${lens.date}T07:00:00+09:00`),
      authors: ['AI LENS 편집팀'],
      section: '경제',
      tags: ['오늘의 이슈', '4가지 시선', '뉴스 해설', 'AI LENS', '서울경제'],
      images: [{ url: image, width: 1200, height: 800, alt: lens.headline }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export async function LensArticlePageContent(
  expectedCategorySlug: string,
  paramsPromise: Promise<RouteParams>,
) {
  const { year, month, day, slug: rawSlug } = await paramsPromise;
  const slug = decodeURIComponent(rawSlug);
  const [lens, otherLens, hotLetters] = await Promise.all([
    findLens(slug),
    findOtherLens(slug),
    fetchFollowingLetters(5),
  ]);

  // 요청 경로(카테고리/연/월/일)가 실제 글의 정본 경로와 다르면(카테고리
  // 재분류, 다른 카테고리 폴더로 잘못 들어온 링크 등) 정본으로 리다이렉트
  // — letters/[id]/page.tsx의 lensPost 리다이렉트와 같은 원칙, 중복
  // URL로 같은 글이 두 경로에 색인되는 걸 막는다.
  if (lens) {
    const canonical = lensPath(lens);
    // lensPath()가 마지막 세그먼트를 encodeURIComponent로 만들어서, 비교
    // 대상도 같은 인코딩으로 맞춰야 한다 — 안 맞추면 정상 요청도 항상
    // "다르다"고 판정돼 매 요청마다 리다이렉트되는 버그가 난다.
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
      <LensViewClient slug={slug} initialLens={lens} otherLens={otherLens} initialHotLetters={hotLetters} />
    </>
  );
}
