import type { Metadata } from 'next';
import type { ApiLetter } from '@/shared/lib/todayLettersApi';
import { withDisplayMeta } from '@/shared/lib/todayLettersApi';
import { LetterDetailClient } from './LetterDetailClient';

const SITE_URL = 'https://ailens.sedaily.ai';

// 콘텐츠·메타데이터는 CMS 글(channel=letters) API 에서 요청마다 직접 가져온다
// (SSR, 2026-08-08 — 재빌드 없이 admin 발행이 즉시 반영되게 하려고 전환).
// today-letters(구 AI 파이프라인 daily_letters)는 2026-08-04 RDS pgvector-v2
// 삭제로 영구히 빈 응답만 반환한다(CLAUDE.md 참조) — 실제 콘텐츠는 전부
// CMS(DynamoDB) 경로로 발행되고 있어 거기서 가져온다. API 가 안 닿으면 빈
// 결과로 degrade(클라이언트 이동은 /letters/view 로 동작).
const API_BASE = 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev';
const SEED_DAYS = 14;

async function fetchLettersForDate(date: string): Promise<ApiLetter[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v2/posts?channel=letters&date=${date}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { posts?: ApiLetter[] };
    return data.posts ?? [];
  } catch {
    return [];
  }
}

function recentDatesISO(days: number): string[] {
  const out: string[] = [];
  const t = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(t);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// 단일 명의 — MBTI 4-페르소나 에디터 체계 폐지(2026-08-07) 이후 모든 레터의
// 저작자 표시는 이 하나로 고정. todayLettersApi.ts 의 DEFAULT_META 와 같은 톤.
const DEFAULT_AUTHOR = { name: 'AI LENS', archetype: 'AI LENS 편집팀' };

// SSR(2026-08-08) — generateStaticParams 없음, 요청마다 서버가 렌더링한다.
// id 에 더 이상 날짜가 인코딩돼있지 않아(그룹-날짜 합성 id 스킴 폐지), 최근
// SEED_DAYS 일을 훑어 .id 가 일치하는 레터를 찾는다. 정적 export 시절엔
// 빌드타임 1회성이라 순차 스캔이었지만, 요청마다 도는 지금은 오래된 레터일수록
// 레이턴시가 쌓이므로 병렬로 가져와 찾는다. id 는 전역 유일이라 날짜 간
// 충돌 걱정 없이 안전하게 병렬화할 수 있다.
async function findLetter(id: string): Promise<(ApiLetter & { date: string }) | null> {
  const dates = recentDatesISO(SEED_DAYS);
  const results = await Promise.all(dates.map((date) => fetchLettersForDate(date)));
  for (let i = 0; i < dates.length; i += 1) {
    const l = results[i].find((x) => x.id === id);
    if (l) return { ...l, date: dates[i] };
  }
  return null;
}

// 검색결과 줄임표 방지를 위한 description 트리밍 (Google 기준 ~160자).
function trimDescription(s: string, max = 160): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:·\s]+$/, '') + '…';
}

// MBTI 4-페르소나 체계(폐지 f84fd06) 시절 admin 폼의 기본값으로 깔려있던
// subtitle — 실제 내용 없이 이 문구 그대로 발행된 레터가 다수 있다(2026-08-08
// 확인, 최근 45편 중 5편). 그대로 두면 검색결과 스니펫·OG 미리보기·JSON-LD
// description 이 전부 이 의미 없는 문구로 뜬다 — subtitle 로 안 쳐주고
// 본문 기반 요약으로 폴백시킨다.
const STALE_SUBTITLES = new Set(['같은 사실, 네 가지 관점으로']);

function usableSubtitle(subtitle: string | null | undefined): string | null {
  if (!subtitle) return null;
  const trimmed = subtitle.trim();
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
  const letter = await findLetter(id);
  if (!letter) {
    return { title: '레터를 찾을 수 없어요', robots: { index: false } };
  }
  const ed = DEFAULT_AUTHOR;
  // layout.tsx의 title.template("%s | AI LENS")이 자동으로 브랜드명을 붙인다 —
  // 여기서 또 붙이면 "...— AI LENS | AI LENS"로 중복된다(2026-08-08 발견).
  const title = letter.headline;
  const bodyExcerpt = letter.body?.length ? letter.body.join(' ') : stripHtml(letter.body_html ?? '');
  const rawDesc = usableSubtitle(letter.subtitle) ?? (bodyExcerpt || `${ed.name}이 풀어낸 ${letter.date} 한 통.`);
  const description = trimDescription(rawDesc);
  const url = `${SITE_URL}/letters/${id}`;
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

function buildArticleJsonLd(letter: ApiLetter & { date: string }) {
  const ed = DEFAULT_AUTHOR;
  const url = `${SITE_URL}/letters/${letter.id}`;
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
        dateModified: published,
        inLanguage: 'ko-KR',
        author: {
          '@type': 'Person',
          name: ed.name,
          jobTitle: ed.archetype,
          worksFor: { '@type': 'Organization', name: '서울경제신문 AI LENS' },
        },
        publisher: { '@id': `${SITE_URL}/#organization` },
        image: imageObj,
        about: [
          ...letterKeywords.map((k) => ({ '@type': 'Thing', name: k })),
          ...(letter.key_points ?? []).slice(0, 3).map((k) => ({ '@type': 'Thing', name: k })),
        ],
        isAccessibleForFree: true,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '레터', item: `${SITE_URL}/letters` },
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
  const letter = await findLetter(id);
  const jsonLd = letter ? buildArticleJsonLd(letter) : null;
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <LetterDetailClient letterId={id} initialLetter={letter ? withDisplayMeta(letter) : null} />
    </>
  );
}
