import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { SITE_URL } from '@/shared/constants/site';
import { lensPath } from '@ailens/domain';
import { seoHeadline, displayHeadline, headlineSection } from '@ailens/domain';
import { LENS_ACCENT, pickLensPhoto } from '@/shared/constants/lensPerspectives';
import type { ArchiveItem } from '@/shared/lib/content/archiveItems';
import type { RailItem } from '@/shared/ui/list/HotLettersRail';

export { SITE_URL };

// /lens, /lens/page/[n] 공용 — 두 라우트가 메타데이터·JSON-LD·페이지 크기를 같은 값으로 써야 하므로 여기에 둔다.
export const LENS_PAGE_SIZE = 20;

export function toLensArchiveItem(l: CmsLens): ArchiveItem {
  return {
    key: l.id,
    kind: 'lens',
    title: displayHeadline(l.headline),
    excerpt: l.context ?? '',
    date: l.date,
    accent: LENS_ACCENT,
    href: lensPath(l),
    avatarUrl: pickLensPhoto(l) || l.cover_image_url || null,
    // 분류 값이 없는 글은 제목 접두어의 부서명(사회·경제 등)으로 대신한다.
    category: l.category ?? headlineSection(l.headline),
    subcategory: l.subcategory ?? null,
    publishedAt: l.published_at ?? null,
    paperSection: l.paper_section ?? null,
  };
}

export type LensListView = {
  featured: ArchiveItem[];
  pageItems: ArchiveItem[];
  railItems: RailItem[];
  currentPage: number;
  totalPages: number;
};

// 화면에 실제로 그리는 조각(히어로·카드 4 + 목록 20 + 레일 10)만 계산한다.
// 예전에는 서버가 CmsLens 전체(최대 1,000건, 4형식 본문 포함)를 클라이언트 props로 넘겨 /lens HTML이 2~3MB였다(2026-11-18).
export function buildLensListView(items: CmsLens[], page: number): LensListView {
  const all = items.map(toLensArchiveItem);
  // 사진이 있는 최신 4건 = 히어로 1 + 카드 3(1페이지만). 나머지는 날짜별 목록.
  const featured = all.filter((it) => it.avatarUrl && it.href).slice(0, 4);
  const used = new Set(featured.map((it) => it.key));
  const rest = all.filter((it) => !used.has(it.key));
  const totalPages = Math.max(1, Math.ceil(rest.length / LENS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = rest.slice((currentPage - 1) * LENS_PAGE_SIZE, currentPage * LENS_PAGE_SIZE);
  const railItems: RailItem[] = all
    .filter((it) => it.href && it.category)
    .slice(0, 10)
    .map((it) => ({ key: it.key, href: it.href as string, title: it.title, thumb: it.avatarUrl, label: it.category ?? '' }));
  return { featured: currentPage === 1 ? featured : [], pageItems, railItems, currentPage, totalPages };
}

export const LENS_LIST_TITLE = '오늘의 이슈, 4가지 시선';
export const LENS_LIST_DESCRIPTION =
  '서울경제신문 기자가 취재한 매일의 경제 이슈를 레터·웹툰·팟캐스트·영상 네 가지 형식으로 담았습니다. 같은 뉴스도 읽고, 보고, 듣는 방식을 바꿔 고르면 더 쉽게 이해됩니다. 시그널·부동산·경제·금융·산업·정치·사회·국제·문화 이슈를 날짜순으로 모아 보세요.';

export function buildLensJsonLd(items: CmsLens[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/lens#collection`,
    url: `${SITE_URL}/lens`,
    name: LENS_LIST_TITLE,
    description: LENS_LIST_DESCRIPTION,
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    author: {
      '@type': 'Organization',
      name: 'AI LENS 편집팀',
      description: '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 레터·웹툰·팟캐스트·영상을 자동으로 만들어 발행하고, 편집팀이 발행 후 점검해 오류를 바로잡습니다.',
      url: `${SITE_URL}/about`,
      parentOrganization: { '@id': `${SITE_URL}/#organization` },
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.slice(0, 20).map((l, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}${lensPath(l)}`,
        name: seoHeadline(l.headline),
      })),
    },
  };
}
