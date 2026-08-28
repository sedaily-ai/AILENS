import type { Metadata } from 'next';
import { fetchWebtoons, fetchVideos, fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { fetchHomePlayerPosts } from '@/shared/lib/api/homePlayerApi';
import { fetchFollowingLetters } from '@/shared/lib/api/todayLettersApi';
import { ArchiveHubClient, type FormatCardData } from './ArchiveHubClient';
import { SITE_URL } from '@/shared/constants/site';

// 2026-08-28 재설계 — letters/trend/video/lens를 날짜순으로 뭉쳐 페이지네이션
// 없이 한 목록에 다 보여주던 이전 버전은 발행량이 하루 100건대로 늘면서
// 두 가지 문제가 났다: (1) 한 화면에 너무 많다는 지적(사용자: "다 보여주긴
// 좀 그렇지 않나"), (2) letters/webtoon/video/home_player가 각자 이미
// /lens, /webtoon, /video, /listen 독립 목록 페이지를 갖고 있어서 여기서
// 다시 합치는 게 중복이었다. 그래서 이 페이지는 이제 "전체 목록"이 아니라
// 4개 형식 목록으로 가는 진입 디렉토리다. letters(이슈 톡톡)는 신규 발행이
// 끊겨서 독립 목록이 없다 — 범위에서 제외(홈/사이트맵/카테고리 페이지
// 노출은 그대로 유지, 여기서만 안 보임).
const TITLE = '지금까지의 모든 콘텐츠';
const DESCRIPTION = 'AI LENS가 매일 만드는 이슈를 레터·웹툰·팟캐스트·영상 네 형식으로 모아봅니다. 형식별로 골라 보세요.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ['AI LENS', '서울경제', '경제 뉴스 모음', 'AI 경제 뉴스', '웹툰', '팟캐스트', '영상'],
  alternates: { canonical: `${SITE_URL}/archive` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/archive`,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS' }],
    locale: 'ko_KR',
    siteName: 'AI LENS — 서울경제',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}/og-image.png`],
  },
};

function buildJsonLd(cards: FormatCardData[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/archive#collection`,
    url: `${SITE_URL}/archive`,
    name: TITLE,
    description: DESCRIPTION,
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: cards.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}${c.href}`,
        name: c.title,
      })),
    },
  };
}

export default async function ArchiveHubPage() {
  const [lens, webtoons, videos, homePlayer, hotLetters] = await Promise.all([
    fetchLensPosts(),
    fetchWebtoons(),
    fetchVideos(),
    fetchHomePlayerPosts(),
    fetchFollowingLetters(5),
  ]);

  const cards: FormatCardData[] = [
    {
      key: 'lens',
      href: '/lens',
      title: '4가지 시선',
      tagline: '형식 상관없이, 전부 다 보고 싶다면',
      count: lens.length,
      latest: lens[0]?.headline ?? null,
    },
    {
      key: 'webtoon',
      href: '/webtoon',
      title: '웹툰',
      tagline: '이야기로 스르륵 넘겨보고 싶다면',
      count: webtoons.length,
      latest: webtoons[0]?.title ?? null,
    },
    {
      key: 'podcast',
      href: '/listen',
      title: '팟캐스트',
      tagline: '이동 중이라 화면 볼 여유가 없다면',
      count: homePlayer.length,
      latest: homePlayer[0]?.title ?? null,
    },
    {
      key: 'video',
      href: '/video',
      title: '영상',
      tagline: '3초 안에 무슨 일인지 알고 싶다면',
      count: videos.length,
      latest: videos[0]?.title ?? null,
    },
  ];

  const jsonLd = buildJsonLd(cards);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ArchiveHubClient cards={cards} initialHotLetters={hotLetters} />
    </>
  );
}
