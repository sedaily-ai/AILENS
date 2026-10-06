import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import type { ApiLetter } from '@/shared/lib/api/todayLettersApi';
import { withDisplayMeta, fetchFollowingLetters } from '@/shared/lib/api/todayLettersApi';
import { fetchCmsPosts, fetchCmsPostBySlug, fetchLensPosts, fetchLensBySlug } from '@/shared/lib/api/cmsPostsApi';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { trimToSnippetLength } from '@/shared/lib/seo/sanitizeDescription';
import { clampModifiedIso } from '@/shared/lib/date/date';
import { LetterDetailClient } from './LetterDetailClient';

import { SITE_URL } from '@/shared/constants/site';
import { lensPath } from '@/shared/lib/content/lensUrl';

// 단일 명의 — 모든 레터의 저작자 표시는 이 하나로 고정한다. todayLettersApi.ts의 DEFAULT_META와 같은 톤이다.
const DEFAULT_AUTHOR = { name: 'AI LENS', archetype: 'AI LENS 편집팀' };

// generateStaticParams로 최근 발행분의 실제 id만 정적 생성한다. 이 함수를 빼면 Next가 라우트를 통째로 Dynamic 취급해 <Link> 프리페치가 붙지 않는다.
// 여기 없는 오래된 id는 dynamicParams 기본값(true)에 따라 요청 시점에 온디맨드 렌더링 후 캐시된다(findLetter가 slug 단건 조회).
export async function generateStaticParams() {
  const [letters, lensPosts] = await Promise.all([
    fetchCmsPosts('letters', undefined, 100),
    fetchLensPosts(),
  ]);
  // channel=letters 조회는 letter 포맷 rendition이 있는 모든 글(거의 모든 lens 글)을 함께 돌려준다(cms_posts_repo.py).
  // lens에도 걸리는 id는 정적 생성에서 뺀다. 거르지 않으면 /lens/{slug}와 /letters/{slug}가 나란히 빌드·사이트맵/RSS에 노출되어 검색엔진이 후자를 색인한다.
  // 직접 URL로는 계속 열린다(dynamicParams 기본값 true).
  const lensIds = new Set(lensPosts.map((l) => l.id));
  return letters.filter((l) => l.id && !lensIds.has(l.id)).map((l) => ({ id: l.id }));
}

// slug(=letter.id)로 단건 조회하는 API(`GET /api/v2/posts/{slug}`, DynamoDB slug-index GSI)를 쓴다.
// id에 날짜가 인코딩되어 있지 않으므로 날짜별 스캔으로는 오래된 레터를 찾지 못한다.
async function findLetter(id: string): Promise<(ApiLetter & { date: string }) | null> {
  const post = await fetchCmsPostBySlug('letters', id);
  if (!post || !post.publish_date) return null;
  return { ...post, date: post.publish_date };
}

// 이전/다음 레터 내비게이션 — 상세 페이지에 다른 레터로 가는 내부 링크가 없으면 크롤링상 막다른 경로가 된다.
// webtoon/[slug]/page.tsx의 findNeighbors와 같은 패턴이다. fetchCmsPosts가 최신순(desc)이므로 index-1이 더 최신, index+1이 더 과거이다.
async function findNeighbors(id: string): Promise<{
  next: { id: string; headline: string; date: string } | null;
  prev: { id: string; headline: string; date: string } | null;
}> {
  const letters = await fetchCmsPosts('letters', undefined, 100);
  const idx = letters.findIndex((l) => l.id === id);
  if (idx === -1) return { next: null, prev: null };
  const toNeighbor = (l: (typeof letters)[number] | undefined) =>
    l && l.publish_date ? { id: l.id, headline: l.headline, date: l.publish_date } : null;
  return { next: toNeighbor(letters[idx - 1]), prev: toNeighbor(letters[idx + 1]) };
}

// 과거 admin 폼의 기본 subtitle 문구. 이 문구 그대로 발행된 레터가 있으며, 그대로 쓰면 검색 스니펫·OG 미리보기·JSON-LD description이
// 의미 없는 문구가 되므로 subtitle로 인정하지 않고 본문 기반 요약으로 폴백한다.
const STALE_SUBTITLES = new Set(['같은 사실, 네 가지 관점으로']);

function usableSubtitle(subtitle: string | null | undefined): string | null {
  if (!subtitle) return null;
  // 일부 subtitle에 본문 마커 문법("■", "[태그]")이 남아 있다. 제거하지 않으면 검색 스니펫·OG/Twitter 미리보기·JSON-LD에 노출되므로
  // 화면용 cleanSubtitle(LetterDetailClient.tsx)과 같은 규칙을 적용한다.
  const trimmed = subtitle
    .replace(/^■\s*/, '')
    .replace(/^\[[^\]]*\]\s*/, '')
    .trim();
  if (!trimmed || STALE_SUBTITLES.has(trimmed)) return null;
  return trimmed;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  // 정적 export 시 Next가 params.id를 URL-encode된 채로 넘긴다(한글 슬러그: %EC%8B%A0...). decode하지 않으면 findLetter가 항상 실패한다.
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const [letter, lensPost] = await Promise.all([findLetter(id), fetchLensBySlug(id)]);
  if (!letter) {
    return { title: '레터를 찾을 수 없어요', robots: { index: false } };
  }
  const ed = DEFAULT_AUTHOR;
  const title = buildPageTitle(letter.headline);
  const bodyExcerpt = letter.body?.length ? letter.body.join(' ') : stripHtml(letter.body_html ?? '');
  const rawDesc = usableSubtitle(letter.subtitle) ?? (bodyExcerpt || `${ed.name}이 풀어낸 ${letter.date} 한 통.`);
  const description = trimToSnippetLength(rawDesc, 160);
  // lens 글은 /letters/{id}가 아니라 4탭 페이지 /lens/{id}가 원본이다(generateStaticParams·news-sitemap.xml·rss.xml과 동일).
  // 맞추지 않으면 이 페이지가 직접 열릴 때 스스로를 canonical로 선언해 /lens/{id}와 경쟁한다.
  const url = lensPost ? `${SITE_URL}${lensPath(lensPost)}` : `${SITE_URL}/letters/${id}`;
  // letter 자체의 5개 keyword (term) + 발행처 — 검색엔진과 SNS 양쪽에 노출.
  // ApiLetter 외 fallback letter 는 keywords 가 없을 수 있어 옵셔널.
  const letterKeywords =
    (letter as { keywords?: Array<{ term: string }> }).keywords?.map((k) => k.term).filter(Boolean) ?? [];
  const baseTags = [ed.archetype, 'AI LENS', '서울경제', '경제 뉴스레터'].filter(Boolean);
  const allKeywords = [...letterKeywords, ...baseTags];
  // letter 에 대표 이미지가 있으면 OG 에 우선 사용 (SNS 미리보기 톤 차별화). 없으면 기본 og.
  const heroImg = (letter as { images?: Array<{ url: string; alt?: string }> }).images?.[0];
  const ogImage = heroImg?.url
    ? { url: heroImg.url.startsWith('http') ? heroImg.url : `${SITE_URL}${heroImg.url}`, width: 1200, height: 800, alt: heroImg.alt ?? title }
    : { url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS' };

  return {
    title,
    description,
    keywords: allKeywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      publishedTime: `${letter.date}T07:00:00+09:00`,
      authors: [ed.name],
      section: '경제',
      tags: allKeywords,
      images: [ogImage],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage.url],
    },
  };
}

// admin PostForm "post" 모드로 발행된 CMS 글은 body_html만 있고 body[]가 비어 있다.
// JSON-LD articleBody가 비지 않도록 HTML 태그를 제거한 평문으로 대체한다.
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildArticleJsonLd(letter: ApiLetter & { date: string }, canonicalUrl: string) {
  const ed = DEFAULT_AUTHOR;
  const url = canonicalUrl;
  const published = `${letter.date}T07:00:00+09:00`;
  const bodyJoined = letter.body?.length ? letter.body.join('\n\n') : stripHtml(letter.body_html ?? '');
  const subtitle = usableSubtitle(letter.subtitle);
  const abstract = subtitle ?? bodyJoined.slice(0, 200);
  // letter 의 5개 키워드 → 검색엔진이 본문 핵심을 인식하는 1순위 신호.
  const letterKeywords =
    (letter as { keywords?: Array<{ term: string }> }).keywords?.map((k) => k.term).filter(Boolean) ?? [];
  // 대표 이미지: letter.images 있으면 우선, 없으면 기본 og.
  const heroImg = (letter as { images?: Array<{ url: string; alt?: string }> }).images?.[0];
  const imageObj = heroImg?.url
    ? { '@type': 'ImageObject', url: heroImg.url.startsWith('http') ? heroImg.url : `${SITE_URL}${heroImg.url}`, width: 1200, height: 800 }
    : { '@type': 'ImageObject', url: `${SITE_URL}/og-image.png`, width: 1200, height: 630 };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'NewsArticle',
        '@id': `${url}#article`,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        headline: letter.headline,
        description: subtitle ?? abstract,
        abstract,
        articleBody: bodyJoined,
        articleSection: '경제',
        wordCount: bodyJoined.length,
        keywords: letterKeywords.join(', '),
        datePublished: published,
        dateModified: clampModifiedIso(letter.updated_at, published),
        inLanguage: 'ko-KR',
        // ed.name('AI LENS')은 개인이 아니라 팀이므로 Person이 아닌 Organization으로 표시한다(Person이면 지식그래프가 실존 인물로 오인).
        // description·url은 /about의 "AI가 돕고, 사람이 검수" 공개 문구와 일치시켜 AI 크롤러가 편집 프로세스를 정확히 인용하게 한다.
        author: {
          '@type': 'Organization',
          name: ed.archetype,
          description:
            '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 요약·재구성한 초안을 작성하고, 편집팀이 검수해 발행합니다.',
          url: `${SITE_URL}/about`,
          parentOrganization: { '@id': `${SITE_URL}/#organization` },
        },
        publisher: { '@id': `${SITE_URL}/#organization` },
        image: imageObj,
        about: [
          ...letterKeywords.map((k) => ({ '@type': 'Thing', name: k })),
          ...(letter.key_points ?? []).slice(0, 3).map((k) => ({ '@type': 'Thing', name: k })),
        ],
        isAccessibleForFree: true,
        // 원문 기사 인용 — author.description의 "취재한 원본 기사를 바탕으로" 주장을 검증 가능하게 하는 링크. 원문 URL이 없는 글은 이 필드를 생략한다.
        ...(letter.source_url ? { citation: letter.source_url } : {}),
        // Speakable — lens/[slug]/page.tsx와 같은 이유. 헤드라인·부제·핵심 정리 블록을 data-speakable로 표시하고 selector로 가리킨다(LetterDetailClient.tsx 참조).
        // key_points가 없는 레터는 마지막 selector가 매치되지 않고 넘어간다.
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['[data-speakable="headline"]', '[data-speakable="summary"]', '[data-speakable="qa"]'],
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
          // /letters 아카이브 목록은 /archive로 리다이렉트되므로 breadcrumb는 최종 목적지를 직접 가리켜 크롤러의 추가 리다이렉트를 피한다.
          { '@type': 'ListItem', position: 2, name: '전체 모아보기', item: `${SITE_URL}/archive` },
          { '@type': 'ListItem', position: 3, name: letter.headline, item: url },
        ],
      },
    ],
  };
}

export default async function LetterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  // 우측 사이드바(SideRail) "요즘 가장 많이 읽힌 글"을 서버에서 프리페치한다. 클라이언트 fetch 완료 전까지 비어 보이는 지연을 막는다.
  const [letter, hotLetters, lensPost] = await Promise.all([
    findLetter(id),
    fetchFollowingLetters(10),
    fetchLensBySlug(id),
  ]);
  // lens 글이 /letters/{id}로 직접 열리면 레터 탭만 보이고 나머지 3개(웹툰/팟캐스트/영상)에는 도달할 링크가 없다.
  // canonical(generateMetadata)은 크롤러용이라 사용자 내비게이션에 영향이 없으므로, 사람도 정본인 /lens/{id}로 보낸다.
  if (lensPost) {
    // 307 대신 308(영구) — 정본 경로가 /lens 계열이라는 영구 사실이다. 임시 이동이면 구글이 /letters/{id}를 별개 URL로 유지해 링크 신호가 갈라진다.
    permanentRedirect(lensPath(lensPost));
  }
  // generateMetadata()의 canonical 계산과 같은 규칙 — lens 글이면 JSON-LD의 @id/url도 lensPath()의 카테고리+날짜 경로와 일치해야 한다.
  const canonicalUrl = lensPost ? `${SITE_URL}${lensPath(lensPost)}` : `${SITE_URL}/letters/${id}`;
  const jsonLd = letter ? buildArticleJsonLd(letter, canonicalUrl) : null;
  const { next, prev } = letter ? await findNeighbors(id) : { next: null, prev: null };
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <LetterDetailClient
        letterId={id}
        initialLetter={letter ? withDisplayMeta(letter) : null}
        nextLetter={next}
        prevLetter={prev}
        initialHotLetters={hotLetters}
      />
    </>
  );
}
