import type { Metadata } from 'next';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { clampModifiedIso } from '@/shared/lib/date';
import { LensViewClient } from './LensViewClient';

const SITE_URL = 'https://ailens.sedaily.ai';

// 경로 기반(2026-08-12, webtoon/[slug]/page.tsx와 같은 패턴). fetchLensPosts()
// 단발 실패(API Gateway/Lambda 콜드스타트 등)에 바로 "찾을 수 없어요"로
// 떨어지지 않도록 가벼운 재시도를 유지한다.
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

// generateStaticParams — letters/webtoon과 동일 이유: 없으면 Next가 이
// 라우트를 ƒ Dynamic 취급해서 <Link> 프리페치가 안 붙는다.
export async function generateStaticParams() {
  const items = await fetchAllLens();
  return items.map((l) => ({ slug: l.id }));
}

async function findLens(slug: string): Promise<CmsLens | null> {
  const items = await fetchAllLens();
  return items.find((l) => l.id === slug) ?? null;
}

function trimDescription(s: string, max = 160): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:·\s]+$/, '') + '…';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const lens = await findLens(slug);
  if (!lens) {
    return { title: '이슈를 찾을 수 없어요', robots: { index: false } };
  }
  const title = buildPageTitle(lens.headline, '4가지 시선');
  const description = trimDescription(lens.context || '오늘의 이슈를 4가지 시선으로 짚어드려요.');
  const url = `${SITE_URL}/lens/${slug}`;
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
      publishedTime: `${lens.date}T07:00:00+09:00`,
      // letters/[id]/page.tsx는 이미 authors/section/tags를 채우고 있는데
      // 여기는 빠져 있었다(2026-08-18 GEO 점검 중 발견) — 같은 값으로 맞춤.
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

// Article → NewsArticle 전환(2026-08-13, GEO 감사) — lens는 브리핑(letters)과
// 똑같이 매일 발행되는 실제 뉴스 해설 콘텐츠인데 더 일반적인 Article 타입을
// 쓰고 있었다. schema.org "가장 구체적인 타입을 쓰라"는 원칙에 맞춰
// letters/[id]/page.tsx의 NewsArticle 패턴(articleSection·wordCount·
// BreadcrumbList)과 동일하게 맞춘다.
function buildJsonLd(lens: CmsLens, slug: string) {
  const url = `${SITE_URL}/lens/${slug}`;
  const published = `${lens.date}T07:00:00+09:00`;
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
        // 원문 기사 인용(2026-08-13, SEO/GEO/AEO 감사) — admin이 원문 URL을
        // 안 채운 글은 이 필드 자체가 빠진다.
        ...(lens.source_url ? { citation: lens.source_url } : {}),
        // Speakable(2026-08-14, GEO 감사) — 원래 Google Assistant TTS용으로
        // 나온 스펙이지만, 2026년 기준 Perplexity/ChatGPT/AI Overviews가
        // "우선순위로 읽을 콘텐츠"를 고르는 신호로도 쓴다(리서치 확인).
        // headline·핵심요약·시선 4개 Q&A 블록을 data-speakable 속성으로
        // 표시해두고 그 CSS selector를 그대로 가리킨다.
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['[data-speakable="headline"]', '[data-speakable="summary"]', '[data-speakable="qa"]'],
        },
        // 본문 4개 시선을 FAQPage 유사 구조 대신 mainEntity ItemList로 노출 —
        // 각 시선이 질문(question)+답(bullets)인 Q&A 형태라 GEO에 유리하다.
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

export default async function LensViewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const lens = await findLens(slug);
  const jsonLd = lens ? buildJsonLd(lens, slug) : null;
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <LensViewClient slug={slug} initialLens={lens} />
    </>
  );
}
