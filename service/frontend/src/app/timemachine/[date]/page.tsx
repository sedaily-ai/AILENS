import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { kstTodayStr } from '@/shared/lib/date';
import { fetchTimeMachineDay, isValidTimeMachineDate } from '../timemachine';
import { TimeMachineDayClient } from './TimeMachineDayClient';

// 날짜별 고유 URL(2026-08-12, /timeline과 같은 GEO 감사 결론 — "다른 페이지들도
// 이 패턴으로 검토해주시죠") — 예전엔 /timemachine이 입력 폼 하나뿐이고 실제
// 결과(그날 뉴스·같은 날 태어난 사람들·투자 시뮬레이션)는 사용자가 날짜를
// 입력해야만(클라이언트 fetch) 나타났다. 날짜마다 진짜 URL을 주면 각 페이지가
// 독립적으로 색인·공유 가능해진다(TimeMachineClient.tsx가 되감기 애니메이션
// 후 여기로 router.push한다).
const SITE_URL = 'https://ailens.sedaily.ai';

function kdate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map((s) => parseInt(s, 10));
  return `${y}년 ${m}월 ${d}일`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const todayIso = kstTodayStr();
  if (!isValidTimeMachineDate(date, todayIso)) return { robots: { index: false } };

  const label = kdate(date);
  const title = `${label} — 그날의 경제 뉴스 | 타임머신`;
  const description = `${label}, 그날의 뉴스와 같은 날 태어난 사람들, 그때 1억원을 투자했다면 지금 얼마가 됐을지를 AI LENS 타임머신으로 다시 봅니다.`;

  return {
    title,
    description,
    keywords: ['타임머신', '그날의 뉴스', '경제 뉴스 아카이브', `${label} 뉴스`, '투자 시뮬레이션', '서울경제', 'AI LENS'],
    alternates: { canonical: `${SITE_URL}/timemachine/${date}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/timemachine/${date}`,
      type: 'website',
      images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 타임머신' }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${SITE_URL}/og-image.png`],
    },
  };
}

function buildJsonLd(
  date: string,
  day: Awaited<ReturnType<typeof fetchTimeMachineDay>>,
) {
  const label = kdate(date);
  const [, mm, dd] = date.split('-');
  const newsItems = day.news
    .filter((n) => n.url)
    .slice(0, 20)
    .map((n, i) => ({ '@type': 'ListItem', position: i + 1, url: n.url, name: n.title }));

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/timemachine/${date}#collection`,
    url: `${SITE_URL}/timemachine/${date}`,
    name: `${label} — 그날의 경제 뉴스 | 타임머신`,
    description: `${label}, 그날의 뉴스와 같은 날 태어난 사람들, 그때 1억원을 투자했다면 지금 얼마가 됐을지를 AI LENS 타임머신으로 다시 봅니다.`,
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    author: {
      '@type': 'Organization',
      name: 'AI LENS 편집팀',
      description: '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 요약·재구성한 초안을 작성하고, 편집팀이 검수해 발행합니다.',
      url: `${SITE_URL}/about`,
      parentOrganization: { '@id': `${SITE_URL}/#organization` },
    },
    mainEntity: newsItems.length > 0 ? { '@type': 'ItemList', itemListElement: newsItems } : undefined,
    // 같은 날 태어난 사람들 — 페이지 본문(챕터 Ⅱ)에 실제로 보여주는 정보 그대로.
    mentions: day.birthdays.slice(0, 20).map((p) => ({
      '@type': 'Person',
      name: p.name,
      birthDate: `${p.birthYear}-${mm}-${dd}`,
      description: p.description,
    })),
  };
}

export default async function TimeMachineDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { date } = await params;
  const { mode } = await searchParams;
  const todayIso = kstTodayStr();
  if (!isValidTimeMachineDate(date, todayIso)) notFound();

  const day = await fetchTimeMachineDay(date);
  const jsonLd = buildJsonLd(date, day);

  // 인생 위치 카피("OO년 전"/"OOOO번째 아침")용 — 서버에서 한 번만 계산해 클라이언트에
  // props로 내려준다. 클라이언트 렌더 중 new Date()를 다시 부르면 서버가 만든 첫 페인트와
  // 하이드레이션 시점의 값이 미묘하게 달라질 수 있어(특히 daysSince, 시각 단위) 아예 이 값을
  // 다시 계산하지 않게 했다. 연도차는 kstTodayStr() 기준(KST 자정 경계 안전), 일수차는
  // Date.now()(절대 시각 차라 타임존 무관) — sitemap.ts의 KST 계산 원칙과 같은 이유.
  const [ty] = todayIso.split('-').map((s) => parseInt(s, 10));
  const [dy, dm, dd] = date.split('-').map((s) => parseInt(s, 10));
  const yearsSince = ty - dy;
  const daysSince = Math.floor((Date.now() - Date.UTC(dy, dm - 1, dd)) / 86400000);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <TimeMachineDayClient
        date={date}
        isBirthdayMode={mode === 'birthday'}
        daysSince={daysSince}
        yearsSince={yearsSince}
        day={day}
      />
    </>
  );
}
