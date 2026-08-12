import type { Metadata } from 'next';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/cmsPostsApi';
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
  // layout.tsx의 title.template("%s | AI LENS")이 자동으로 브랜드명을 붙인다.
  const title = `${lens.headline} — 4가지 시선`;
  const description = trimDescription(lens.context || '오늘의 이슈를 4가지 시선으로 짚어드려요.');
  const url = `${SITE_URL}/lens/${slug}`;
  const image = lens.cover_image_url || `${SITE_URL}/og-image.png`;
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

function buildJsonLd(lens: CmsLens, slug: string) {
  const url = `${SITE_URL}/lens/${slug}`;
  const published = `${lens.date}T07:00:00+09:00`;
  const image = lens.cover_image_url || `${SITE_URL}/og-image.png`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: lens.headline,
    description: lens.context,
    datePublished: published,
    dateModified: published,
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
