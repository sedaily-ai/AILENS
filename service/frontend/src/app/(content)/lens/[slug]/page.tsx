import type { Metadata } from 'next';
import { fetchLensPosts, fetchLensBySlug, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { fetchFollowingLetters } from '@/shared/lib/api/todayLettersApi';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { buildSeoDescription } from '@/shared/lib/seo/sanitizeDescription';
import { clampModifiedIso } from '@/shared/lib/date';
import { LensViewClient } from './LensViewClient';

import { SITE_URL } from '@/shared/constants/site';

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

// 2026-09-03 — 이전엔 fetchAllLens()(최근 100건)에서 .find()로 찾았다.
// lens는 하루 수십 건씩 나가는 채널이라 3일 정도만 지나도 그 100건
// 밖으로 밀려나 실제로 존재하는 글인데도 "이슈를 찾을 수 없어요"로
// 뜨는 걸 확인(사용자 질문 "오래된 레터들도 SEO 작업 됐나"에 답하려고
// 실제 3일 전 기사로 재현). generateMetadata·JSON-LD·canonical이 전부
// 이 함수 결과에 의존해서, 못 찾으면 SEO가 아예 무너진다(robots:
// noindex까지 박힘) — 클라이언트(LensViewClient.tsx)는 이미
// fetchLensBySlug()로 단건 조회해 스스로 복구하고 있었는데, 정작 SEO에
// 쓰이는 서버 렌더링만 이 버그를 안 피하고 있었다. 단건 조회 API로
// 교체 — 목록에 있든 없든 항상 정확히 찾는다.
async function findLens(slug: string): Promise<CmsLens | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await fetchLensBySlug(slug);
    if (result) return result;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return null;
}

// 상세 페이지 마감부에 보여줄 "다른 시선" 3개 — 별도 API 호출 없이
// fetchAllLens()의 in-flight coalescing(cmsPostsApi.ts의 cached() 참조)에
// 편승한다. 2026-08-16 — 마감부가 문구 한 줄 + 링크 하나뿐이라 "허전하다"는
// 피드백으로 신설.
async function findOtherLens(slug: string, limit = 3): Promise<CmsLens[]> {
  const items = await fetchAllLens();
  return items.filter((l) => l.id !== slug).slice(0, limit);
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
  const description = buildSeoDescription(lens.context, '오늘의 이슈를 4가지 시선으로 짚어드려요.');
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
  // 우측 사이드바(HomeSideBar) "요즘 가장 많이 읽힌 글" 서버 프리페치
  // (2026-08-23) — 홈/카테고리/lens 목록 페이지엔 이미 있었는데 이
  // 상세 페이지만 빠져 있었다. 없으면 HotLettersRail이 클라이언트
  // fetch가 끝날 때까지 아무것도 안 그려서 실사용자가 "느리게
  // 나타난다"고 느낀다(프로덕션에서 사용자가 직접 확인).
  const [lens, otherLens, hotLetters] = await Promise.all([
    findLens(slug),
    findOtherLens(slug),
    fetchFollowingLetters(5),
  ]);
  const jsonLd = lens ? buildJsonLd(lens, slug) : null;
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
