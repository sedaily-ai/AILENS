import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import type { ApiLetter } from '@/shared/lib/api/todayLettersApi';
import { withDisplayMeta, fetchFollowingLetters } from '@/shared/lib/api/todayLettersApi';
import { fetchCmsPosts, fetchCmsPostBySlug, fetchLensPosts, fetchLensBySlug } from '@/shared/lib/api/cmsPostsApi';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { trimToSnippetLength } from '@/shared/lib/seo/sanitizeDescription';
import { clampModifiedIso } from '@/shared/lib/date';
import { LetterDetailClient } from './LetterDetailClient';

import { SITE_URL } from '@/shared/constants/site';
import { lensPath } from '@/shared/lib/lensUrl';

// 단일 명의 — MBTI 4-페르소나 에디터 체계 폐지(2026-08-07) 이후 모든 레터의
// 저작자 표시는 이 하나로 고정. todayLettersApi.ts 의 DEFAULT_META 와 같은 톤.
const DEFAULT_AUTHOR = { name: 'AI LENS', archetype: 'AI LENS 편집팀' };

// generateStaticParams 를 다시 붙인다(2026-08-08) — SSR 전환 때 "매 요청
// 서버가 렌더링" 방향으로 아예 뺐었는데, 그러면 Next가 이 라우트를 통째로
// ƒ Dynamic 취급해서 <Link> 프리페치가 안 붙는다(직접 빌드해서 확인함 —
// "클릭 즉시 이동" 요구와 충돌). 정적 export 시절의 "params 0개면 빌드
// 실패" 제약은 SSR에선 없으므로 그 우회 코드는 없이, 최근 발행분의 실제
// id만 돌려준다 — 여기 없는(더 오래된) id는 dynamicParams 기본값(true)에
// 따라 요청 시점에 온디맨드 렌더링 후 캐시된다(findLetter가 이제 날짜
// 스캔이 아니라 slug 단건 조회라 "여기 없으면 영영 못 찾는" 문제는 없다
// — 아래 findLetter 주석 참조).
export async function generateStaticParams() {
  const [letters, lensPosts] = await Promise.all([
    fetchCmsPosts('letters', undefined, 100),
    fetchLensPosts(),
  ]);
  // v1.32 — channel=letters 조회는 admin_channel='letters'뿐 아니라 letter
  // 포맷 rendition이 있는 모든 글(=거의 모든 lens 글)을 같이 돌려준다
  // (cms_posts_repo.py — video/webtoon과 같은 설계). 여기서 안 걸러내면
  // 최근 lens 글 대부분이 /lens/{slug}(4탭)와 나란히 /letters/{slug}
  // (레터 단독, 탭 없음) 정적 페이지로도 빌드·사이트맵/RSS에 노출돼
  // 구글이 후자를 인덱싱하는 사고가 났다(사용자 신고: "4개 탭이 안
  // 나온다"가 종종 있었던 원인). lens에도 걸리는 id는 정적 생성에서
  // 뺀다 — 직접 URL로는 여전히 열린다(dynamicParams 기본값 true), 다만
  // 더 이상 빌드 시점에 미리 만들거나 능동적으로 노출하지 않는다.
  const lensIds = new Set(lensPosts.map((l) => l.id));
  return letters.filter((l) => l.id && !lensIds.has(l.id)).map((l) => ({ id: l.id }));
}

// id 에 더 이상 날짜가 인코딩돼있지 않아(그룹-날짜 합성 id 스킴 폐지) 예전엔
// 최근 14일(SEED_DAYS)을 하루씩 14번 조회해 .id가 일치하는 레터를 찾았다 —
// 그보다 오래전에 발행된 레터는 직접 URL로 들어와도 "찾을 수 없어요"로
// 떴다(2026-08-18, GEO 점검 중 발견 — 사이트맵 14일 제한과 같은 근본 원인).
// slug(=letter.id)로 바로 단건 조회하는 API(`GET /api/v2/posts/{slug}`,
// DynamoDB slug-index GSI 단건 쿼리)가 이미 있었는데 이 페이지만 안 쓰고
// 있었다 — 그걸로 교체해 날짜 무관하게 한 번의 요청으로 찾는다.
async function findLetter(id: string): Promise<(ApiLetter & { date: string }) | null> {
  const post = await fetchCmsPostBySlug('letters', id);
  if (!post || !post.publish_date) return null;
  return { ...post, date: post.publish_date };
}

// 이전/다음 레터 내비게이션(2026-08-21, GEO 재감사 — 레터가 발행량이 가장
// 많은 콘텐츠인데 상세 페이지에 다른 레터로 가는 내부 링크가 전혀 없어
// 크롤링상 막다른 골목이었다. 옛 MBTI 페르소나 체계(l-YYYYMMDD-XX id,
// mbti_group 필드) 기반 구현은 그 체계 폐지로 이미 죽어있었음 — 지금 단일
// 저자 체계에 맞게 새로 짠다. webtoon/[slug]/page.tsx의 findNeighbors와
// 같은 패턴: fetchCmsPosts가 최신순(desc)으로 내려오므로 index-1이 더
// 최신, index+1이 더 과거.
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

// MBTI 4-페르소나 체계(폐지 f84fd06) 시절 admin 폼의 기본값으로 깔려있던
// subtitle — 실제 내용 없이 이 문구 그대로 발행된 레터가 다수 있다(2026-08-08
// 확인, 최근 45편 중 5편). 그대로 두면 검색결과 스니펫·OG 미리보기·JSON-LD
// description 이 전부 이 의미 없는 문구로 뜬다 — subtitle 로 안 쳐주고
// 본문 기반 요약으로 폴백시킨다.
const STALE_SUBTITLES = new Set(['같은 사실, 네 가지 관점으로']);

function usableSubtitle(subtitle: string | null | undefined): string | null {
  if (!subtitle) return null;
  // 일부 subtitle에 본문 마커 문법("■", "[태그]")이 그대로 들어있어(2026-08-18,
  // LetterDetailClient.tsx의 cleanSubtitle과 같은 문제) 안 걷어내면 검색결과
  // 스니펫·OG/Twitter 미리보기·JSON-LD description·abstract 에 마커가 그대로
  // 노출된다 — 화면 표시용 cleanSubtitle과 동일한 규칙을 여기서도 적용.
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
  // Next가 정적 export 시 이 동적 세그먼트의 params.id를 URL-encode된 채로
  // 넘긴다(한글 슬러그라 %EC%8B%A0... 형태) — decode 안 하면 findLetter가
  // 항상 못 찾아서 모든 레터 상세가 "찾을 수 없어요"로만 떴다(2026-08-07
  // 발견 — today-letters 데드 API 뒤에 가려 있던 두 번째 버그).
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
  // v1.32 — lens 글은 /letters/{id}가 아니라 4탭 페이지 /lens/{id}가 진짜
  // 원본이다(generateStaticParams·news-sitemap.xml·rss.xml에 이미 적용한
  // 것과 동일한 이유). 여기서 안 맞추면 이 페이지가 직접 URL로 열릴 때마다
  // (dynamicParams 기본값 true) 스스로를 canonical로 선언해 /lens/{id}와
  // 경쟁하게 된다.
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

// admin PostForm "post" 모드로 발행된 CMS 글은 body_html 만 있고 body[] 는
// 비어있다(2026-08-07 확인 — /letters/[id] 정적 생성이 today-letters 대신
// CMS API 를 보게 바꾸면서 body_html 기반 글이 대부분이 됨). JSON-LD 의
// articleBody 가 비어버리는 걸 막기 위해 HTML 태그를 벗겨 평문으로 대체.
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
        // ed.name('AI LENS')은 개인이 아니라 팀이라 Person이 아니라
        // Organization으로 표시한다(GEO 감사 2026-08-11 — Person 타입에
        // 팀 이름을 넣으면 지식그래프가 실존 인물로 오인). description·url은
        // /about의 "AI가 돕고, 사람이 검수" 공개 문구와 동일하게 맞춰서
        // AI 크롤러가 편집 프로세스를 정확히 인용할 수 있게 한다.
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
        // 원문 기사 인용 — author.description의 "취재한 원본 기사를 바탕으로"
        // 라는 주장을 실제로 검증 가능하게 만드는 링크(2026-08-13, SEO/GEO/AEO
        // 감사). admin이 원문 URL을 안 채운 글은 이 필드 자체가 빠진다.
        ...(letter.source_url ? { citation: letter.source_url } : {}),
        // Speakable(2026-08-14, GEO 감사) — lens/[slug]/page.tsx와 동일 이유.
        // 헤드라인·부제·핵심 정리 블록을 data-speakable 속성으로 표시해두고
        // 그 selector를 가리킨다(LetterDetailClient.tsx 참조). key_points가
        // 없는 레터는 마지막 selector가 그냥 매치 안 되고 넘어간다.
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['[data-speakable="headline"]', '[data-speakable="summary"]', '[data-speakable="qa"]'],
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
          // /letters 아카이브 목록 페이지 폐기(2026-08-18, /archive로 리다이렉트)
          // — breadcrumb는 최종 목적지를 바로 가리켜야 크롤러가 리다이렉트를
          // 한 번 더 안 타도 된다.
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
  // 우측 사이드바(SideRail) "요즘 가장 많이 읽힌 글" 서버 프리페치
  // (2026-08-23) — 없으면 클라이언트 fetch가 끝날 때까지 안 보여서
  // 실사용자가 "느리게 나타난다"고 느낀다(사용자가 프로덕션에서 직접
  // 발견, "letters도 모든 부분 마찬가지").
  const [letter, hotLetters, lensPost] = await Promise.all([
    findLetter(id),
    fetchFollowingLetters(10),
    fetchLensBySlug(id),
  ]);
  // lens 글(4탭 보유)이 /letters/{id}로 직접 열리면 레터 탭만 보이고 나머지
  // 3개(웹툰/팟캐스트/영상)는 화면 어디에도 링크가 없어 도달 불가였다 —
  // generateMetadata()의 canonical(v1.32)은 크롤러용이라 실사용자 내비게이션엔
  // 영향이 없었던 게 원인(사용자 신고 "레터만 있는데 4가지 유형은?", 2026-09-13).
  // /lens/{id}가 이미 canonical로 지정된 "진짜 원본"이므로 사람도 그리로 보낸다.
  if (lensPost) {
    // 307(임시) 대신 308(영구) — 이 이동은 "같은 글의 정본 경로가 /lens 계열"이라는 영구 사실이다. 임시 이동이면 구글이
    // /letters/{id}를 계속 별개 URL로 들고 있어 링크 신호가 갈라진다(2026-10-04 홈 링크 크롤에서 307로 확인).
    permanentRedirect(lensPath(lensPost));
  }
  // generateMetadata()의 canonical 계산과 동일한 규칙 — lens 글이면
  // JSON-LD의 @id/url도 lensPath()가 가리키는 카테고리+날짜 경로와
  // 일치해야 한다.
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
