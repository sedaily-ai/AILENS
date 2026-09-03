import type { Metadata } from 'next';
import { fetchWebtoons, fetchWebtoonBySlug, type CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { buildSeoDescription } from '@/shared/lib/seo/sanitizeDescription';
import { WebtoonViewClient } from './WebtoonViewClient';

import { SITE_URL } from '@/shared/constants/site';

// 경로 기반(2026-08-07) 그대로. fetchWebtoons() 단발 실패(API Gateway/Lambda
// 콜드스타트 등)에 바로 "찾을 수 없어요"로 떨어지지 않도록 가벼운 재시도를
// 유지한다.
async function fetchAllWebtoons(): Promise<CmsWebtoon[]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await fetchWebtoons();
      if (result.length > 0) return result;
    } catch {
      // 다음 시도로.
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return [];
}

// generateStaticParams 를 다시 붙인다(2026-08-08) — letters/[id]/page.tsx와
// 동일 이유: 이게 없으면 Next가 이 라우트를 ƒ Dynamic 취급해서 <Link>
// 프리페치가 안 붙는다("클릭 즉시 이동" 요구와 충돌, 직접 빌드해서 확인함).
//
// 최근 STATIC_PARAMS_LIMIT건만(2026-09-03) — lens/[slug]/page.tsx에서
// 실제 EC2 디스크풀 장애로 확인된 것과 같은 위험: fetchWebtoons()가
// limit=1000이라 여기서도 706건(실측) 전부를 정적 페이지로 미리
// 빌드하고 있었다. 목록 API의 limit은 그대로 두고(홈 미리보기·`/webtoon`
// 목록엔 필요), 빌드 시점에 미리 만드는 개수만 최근 것으로 줄인다 —
// 오래된 화는 findWebtoon()의 단건 조회(바로 아래)로 요청 시점에
// 정상 렌더링된다.
//
// 2026-09-03 후속(ISR 재설계 감사) — generateMetadata·JSON-LD·사이트맵이
// 전부 이 함수와 무관하다는 게 확인돼(findWebtoon 단건 조회, sitemap.ts도
// 별도 목록 호출) 100은 여전히 과하다는 결론 — 10으로 더 낮춘다.
const STATIC_PARAMS_LIMIT = 10;

export async function generateStaticParams() {
  const webtoons = await fetchAllWebtoons();
  return webtoons.slice(0, STATIC_PARAMS_LIMIT).map((w) => ({ slug: w.id }));
}

// 위 STATIC_PARAMS_LIMIT 밖 글도 항상 정상 렌더되도록 명시(App Router
// 기본값이 true라 원래도 동작했지만, ISR 재설계 의도를 코드로 남긴다).
export const dynamicParams = true;

// fetch 레벨(cmsPostsApi.ts의 cacheOpts)에 이미 걸려있던 안전망을 라우트
// 레벨에도 명문화. ⚠️ 리터럴이어야 함(lens/[slug]/page.tsx 주석 참조) —
// cmsPostsApi.ts의 CACHE_TTL_FALLBACK_SECONDS와 값이 반드시 같아야 한다.
export const revalidate = 300;

// 2026-09-03 — lens/[slug]/page.tsx와 같은 버그를 여기서도 발견(사용자
// 질문 "오래된 것들도 SEO 됐나"로 재현). fetchAllWebtoons()(현재 limit
// 1000)에서 .find()로 찾다 보니, 목록 상한을 넘어가는 순간 실제로 있는
// 화도 "찾을 수 없어요"가 된다 — 이미 한 번 100→1000으로 상한만 올려
// 땜질한 이력이 있고(위 주석 참조), 최근 발행량(하루 최대 96건)이면
// 1000건도 열흘 남짓이면 다시 뚫린다. 단건 조회 API(fetchWebtoonBySlug,
// WebtoonViewClient.tsx도 이미 클라이언트 폴백으로 쓰고 있었음)로
// 교체 — 목록 상한과 무관하게 항상 정확히 찾는다.
async function findWebtoon(slug: string): Promise<CmsWebtoon | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await fetchWebtoonBySlug(slug);
    if (result) return result;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return null;
}

// 목록은 최신순(desc)으로 내려온다 — index-1이 더 최신 화("다음 화"),
// index+1이 더 과거 화("이전 화").
async function findNeighbors(slug: string): Promise<{
  episodeLabel: string | undefined;
  next: CmsWebtoon | null;
  prev: CmsWebtoon | null;
}> {
  const webtoons = await fetchAllWebtoons();
  const idx = webtoons.findIndex((w) => w.id === slug);
  if (idx === -1) return { episodeLabel: undefined, next: null, prev: null };
  return {
    episodeLabel: `${webtoons.length - idx}화`,
    next: webtoons[idx - 1] ?? null,
    prev: webtoons[idx + 1] ?? null,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const webtoon = await findWebtoon(slug);
  if (!webtoon) {
    return { title: '웹툰을 찾을 수 없어요', robots: { index: false } };
  }
  const title = buildPageTitle(webtoon.title, '웹툰');
  const description = buildSeoDescription(webtoon.excerpt, '요즘 이슈를 컷으로 이어 보여드려요.');
  const url = `${SITE_URL}/webtoon/${slug}`;
  const image = webtoon.cover_image_url || webtoon.panels[0]?.url || `${SITE_URL}/og-image.png`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      publishedTime: `${webtoon.date}T07:00:00+09:00`,
      images: [{ url: image, width: 1200, height: 800, alt: webtoon.title }],
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

function buildJsonLd(webtoon: CmsWebtoon, slug: string) {
  const url = `${SITE_URL}/webtoon/${slug}`;
  const published = `${webtoon.date}T07:00:00+09:00`;
  const image = webtoon.cover_image_url || webtoon.panels[0]?.url || `${SITE_URL}/og-image.png`;
  // SEO/GEO 강화(2026-09-02) — 이전엔 대표 이미지 1장만 image에 담았다.
  // 실제로는 컷마다 별도 이미지+대사가 있는데 그 구조가 구조화 데이터에
  // 전혀 안 드러나서, 검색·AI 답변엔진이 이 페이지를 "이미지 1장짜리 기사"
  // 로만 이해할 수 있었다. panels 전체를 캡션 딸린 ImageObject 배열로,
  // 캡션을 이어붙인 텍스트를 articleBody로 노출해 실제 스토리 내용을
  // 구조화 데이터 레벨에서도 읽을 수 있게 한다(페이지 자체엔 이미
  // panel.caption이 텍스트로 렌더돼 있음 — WebtoonViewClient.tsx 참고,
  // 이건 그 신호를 JSON-LD에도 반영하는 것).
  const panelImages = webtoon.panels.length > 0
    ? webtoon.panels.map((p, i) => ({
        '@type': 'ImageObject' as const,
        url: p.url,
        caption: p.caption || `${webtoon.title} 컷 ${i + 1}`,
        position: i + 1,
      }))
    : [{ '@type': 'ImageObject' as const, url: image, width: 1200, height: 800 }];
  const articleBody = webtoon.panels
    .map((p) => p.caption)
    .filter(Boolean)
    .join('\n\n');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        headline: webtoon.title,
        description: webtoon.excerpt,
        ...(articleBody ? { articleBody } : {}),
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
        associatedMedia: panelImages,
        isAccessibleForFree: true,
      },
      // 2026-08-21 GEO 재감사 — letters/lens는 이미 있던 BreadcrumbList가
      // webtoon/video/listen엔 빠져있던 것을 발견해 같은 패턴으로 보강.
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '웹툰', item: `${SITE_URL}/webtoon` },
          { '@type': 'ListItem', position: 3, name: webtoon.title, item: url },
        ],
      },
    ],
  };
}

export default async function WebtoonViewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const webtoon = await findWebtoon(slug);
  const jsonLd = webtoon ? buildJsonLd(webtoon, slug) : null;
  const { episodeLabel, next, prev } = webtoon
    ? await findNeighbors(slug)
    : { episodeLabel: undefined, next: null, prev: null };
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <WebtoonViewClient
        slug={slug}
        initialWebtoon={webtoon}
        episodeLabel={episodeLabel}
        nextEpisode={next}
        prevEpisode={prev}
      />
    </>
  );
}
