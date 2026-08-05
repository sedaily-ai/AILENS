import type { Metadata } from 'next';
import type { ApiLetter, ApiTodayLettersResponse } from '@/shared/lib/todayLettersApi';
import { LetterDetailClient } from './LetterDetailClient';

const SITE_URL = 'https://ailens.sedaily.ai';

// 빌드타임 라이브 seed — mock 레터 제거(2026-07-24) 후 prerender·메타데이터는
// 최근 발행 레터를 today-letters API 에서 직접 가져온다. 빌드 시 API 가 닿지
// 않으면 각 함수가 빈 결과로 degrade(클라이언트 이동은 /letters/view 로 동작).
const API_BASE = 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev';
const SEED_DAYS = 14;

async function fetchLettersForDate(date: string): Promise<ApiLetter[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v2/today-letters?date=${date}`);
    if (!res.ok) return [];
    const data = (await res.json()) as ApiTodayLettersResponse;
    return data.letters ?? [];
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

const EDITOR_INFO: Record<string, { name: string; archetype: string; mbti: string }> = {
  NT: { name: '민철', archetype: '전략 분석가', mbti: 'INTJ' },
  NF: { name: '하은', archetype: '가치 탐색가', mbti: 'INFP' },
  ST: { name: '준서', archetype: '실용 큐레이터', mbti: 'ISTJ' },
  SF: { name: '소율', archetype: '공감 캐스터', mbti: 'ESFP' },
};

// 정적 export — 최근 SEED_DAYS 일의 라이브 발행 레터를 prerender (빌드타임 fetch).
export async function generateStaticParams() {
  const ids = new Set<string>();
  for (const date of recentDatesISO(SEED_DAYS)) {
    const letters = await fetchLettersForDate(date);
    // mbti_group 없는 CMS 글은 이 id 스킴(group-date)에 안 들어가서 여기선 스킵 —
    // /letters/view 라우트로 접근한다.
    for (const l of letters) {
      if (l.mbti_group) ids.add(`${l.mbti_group.toLowerCase()}-${date}`);
    }
  }
  // output:'export' 는 동적 라우트에 param 이 0개면 빌드 자체를 실패시킨다.
  // daily_letters 가 전부 비어있는 기간(현재 — RDS 삭제로 Editor Pick 자동생성
  // 중단) 에도 빌드가 죽지 않도록 최소 1개는 확보한다. 실존하지 않는 id 라
  // findLetter() 가 null 반환 → "레터를 찾을 수 없어요" 로 정상 degrade.
  if (ids.size === 0) ids.add('nt-1970-01-01');
  return [...ids].map((id) => ({ id }));
}

function parseLetterId(id: string): { group: string; date: string } | null {
  const m = id.match(/^(nt|nf|st|sf)-(\d{4}-\d{2}-\d{2})$/i);
  if (!m) return null;
  return { group: m[1].toUpperCase(), date: m[2] };
}

async function findLetter(id: string): Promise<(ApiLetter & { date: string }) | null> {
  const parsed = parseLetterId(id);
  if (!parsed) return null;
  const letters = await fetchLettersForDate(parsed.date);
  const l = letters.find((x) => x.mbti_group === parsed.group);
  return l ? { ...l, date: parsed.date } : null;
}

// 검색결과 줄임표 방지를 위한 description 트리밍 (Google 기준 ~160자).
function trimDescription(s: string, max = 160): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:·\s]+$/, '') + '…';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const letter = await findLetter(id);
  if (!letter) {
    return { title: '레터를 찾을 수 없어요', robots: { index: false } };
  }
  const ed = EDITOR_INFO[letter.mbti_group ?? ''] ?? { name: '에디터', archetype: '', mbti: '' };
  const title = `${letter.headline} — ${ed.name} (${ed.archetype})`;
  const rawDesc = letter.subtitle ?? `${ed.name}이 풀어낸 ${letter.date} 한 통.`;
  const description = trimDescription(rawDesc);
  const url = `${SITE_URL}/letters/${id}`;
  // letter 자체의 5개 keyword (term) + 페르소나·발행처 — 검색엔진과 SNS 양쪽에 노출.
  // ApiLetter 외 fallback letter 는 keywords 가 없을 수 있어 옵셔널.
  const letterKeywords =
    (letter as { keywords?: Array<{ term: string }> }).keywords?.map((k) => k.term).filter(Boolean) ?? [];
  const baseTags = [ed.archetype, 'AI LENS', '서울경제', `${letter.mbti_group} 에디터`, '경제 뉴스레터'].filter(
    Boolean,
  );
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

async function buildArticleJsonLd(id: string) {
  const letter = await findLetter(id);
  if (!letter) return null;
  const ed = EDITOR_INFO[letter.mbti_group ?? ''] ?? { name: '에디터', archetype: '', mbti: '' };
  const url = `${SITE_URL}/letters/${id}`;
  const published = `${letter.date}T07:00:00+09:00`;
  const abstract = letter.subtitle ?? (letter.body[0] ?? '').slice(0, 200);
  const bodyJoined = (letter.body ?? []).join('\n\n');
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
        description: letter.subtitle,
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
          { '@type': 'ListItem', position: 2, name: `${ed.name} (${ed.archetype})`, item: `${SITE_URL}/editors` },
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
  const { id } = await params;
  const jsonLd = await buildArticleJsonLd(id);
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <LetterDetailClient letterId={id} />
    </>
  );
}
