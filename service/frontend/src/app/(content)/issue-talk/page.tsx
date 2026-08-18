import type { Metadata } from 'next';
import { fetchCmsPosts } from '@/shared/lib/api/cmsPostsApi';
import { buildArchiveItems, PAGE_SIZE, type ArchiveItem } from '@/shared/lib/archiveItems';
import { IssueTalkListClient } from './IssueTalkListClient';

// 2026-08-12 — "이슈 톡톡" 홈 섹션(FollowingFeed.tsx)의 더보기가 예전엔
// /letters로 갔는데, 그 아카이브는 channel=letters만 조회해서 이슈 톡톡
// 글(channel=issue_talk)이 하나도 안 보이는 버그였다(사용자 확인 후 신설).
// letters/trend/column과 같은 패턴 — 전용 URL + CollectionPage JSON-LD.
const SITE_URL = 'https://ailens.sedaily.ai';
const TITLE = '이슈 톡톡 — 실명 에디터가 짚는 오늘';
const DESCRIPTION = 'AI LENS 에디터가 이름을 걸고 직접 짚어드리는 오늘의 이슈. 지금까지의 이슈 톡톡을 한 곳에서 다시 볼 수 있습니다.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ['이슈 톡톡', 'AI LENS 에디터', '경제 이슈 브리핑', '실명 기자 글', '경제 뉴스 해설', '서울경제'],
  alternates: { canonical: `${SITE_URL}/issue-talk` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/issue-talk`,
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

function buildJsonLd(items: ArchiveItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/issue-talk#collection`,
    url: `${SITE_URL}/issue-talk`,
    name: TITLE,
    description: DESCRIPTION,
    keywords: '이슈 톡톡, AI LENS 에디터, 경제 이슈 브리핑, 실명 기자 글, 서울경제',
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
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items
        .filter((it) => it.href)
        .slice(0, 20)
        .map((it, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: it.external ? it.href! : `${SITE_URL}${it.href}`,
          name: it.title,
        })),
    },
  };
}

export default async function IssueTalkArchivePage() {
  // "이슈 톡톡"은 letters 채널의 분류(section="issue_talk")다(2026-08-12,
  // 재작업 — trend/page.tsx와 같은 패턴).
  const posts = await fetchCmsPosts('letters', undefined, PAGE_SIZE);
  const initialItems = buildArchiveItems(posts, [], []).filter((it) => it.kind === 'issue_talk');
  const jsonLd = buildJsonLd(initialItems);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <IssueTalkListClient initialItems={initialItems} />
    </>
  );
}
