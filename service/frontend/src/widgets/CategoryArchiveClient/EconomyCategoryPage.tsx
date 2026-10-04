import type { Metadata } from 'next';
import { fetchCmsPosts, fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { fetchFollowingLetters } from '@/shared/lib/api/todayLettersApi';
import { buildArchiveItems, PAGE_SIZE } from '@/shared/lib/content/archiveItems';
import { buildCategoryMetadata, buildCategoryPageNMetadata, buildCategoryJsonLd } from '@/shared/lib/seo/buildCategoryPageMeta';
import { CategoryArchiveClient } from './CategoryArchiveClient';
import { ECON_CATEGORIES } from '@/shared/constants/econCategories';
import type { HeaderTabKey } from '@/shared/lib/headerTabs';

// 카테고리 아카이브 6개(증시/부동산/산업/금융·정책/국제/문화)가
// fetch→filter→JSON-LD→렌더 로직이 완전히 동일하고 slug만 다른데, 예전엔
// 이 7줄짜리 본문을 7개 page.tsx 파일에 그대로 복붙했다(2026-08-17 카테고리
// 개편 때부터, 문화 추가 때 8번째 복사가 생길 뻔해서 2026-08-20에 여기로
// 뽑았다). 각 page.tsx는 이제 slug 하나만 넘기는 얇은 wrapper다.
function configFor(slug: string) {
  const config = ECON_CATEGORIES.find((c) => c.slug === slug);
  if (!config) {
    throw new Error(`economyCategoryPage: unknown slug "${slug}" — econCategories.ts에 없음`);
  }
  return config;
}

export function buildEconomyCategoryMetadata(slug: string, page = 1): Metadata {
  return page > 1 ? buildCategoryPageNMetadata(configFor(slug), page) : buildCategoryMetadata(configFor(slug));
}

export async function EconomyCategoryPage({ slug, page = 1 }: { slug: string; page?: number }) {
  const config = configFor(slug);
  // 우측 사이드바 "요즘 가장 많이 읽힌 글" 서버 프리페치(2026-08-23) —
  // app/page.tsx(홈)와 같은 이유: 이거 없이 클라이언트 fetch만 쓰면
  // 첫 페인트에 섹션 자체가 안 보여서 "없어진 것"처럼 보인다.
  const [letters, lens, hotLetters] = await Promise.all([
    fetchCmsPosts('letters', undefined, PAGE_SIZE),
    fetchLensPosts(),
    fetchFollowingLetters(10),
  ]);
  // "시그널"(filterBy:'paperSection')은 category가 아니라 paperSection으로
  // 거른다 — econCategories.ts 주석 참조.
  const items = buildArchiveItems(letters, [], [], lens).filter((it) =>
    config.filterBy === 'paperSection' ? it.paperSection === config.label : it.category === config.label,
  );
  const jsonLd = buildCategoryJsonLd(config, items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CategoryArchiveClient
        config={config}
        tabKey={slug as HeaderTabKey}
        initialItems={items}
        initialHotLetters={hotLetters}
        initialPage={page}
      />
    </>
  );
}

/**
 * /{slug}/page/[n]의 n 문자열 → 페이지 번호. n<=1 리다이렉트는 middleware.ts가 처리한다
 * (redirect()를 페이지에 두면 캐시 불가로 판정됨)이라 여기선 안전하게 1 이상으로만 맞춘다.
 *
 * 카테고리 라우트 파일(app/(economy)/{slug}/page.tsx, page/[n]/page.tsx) 공통 규칙 — 일부러 파일마다 둔 설정:
 * - `revalidate = 300`: CACHE_TTL_FALLBACK_SECONDS(cmsPostsApi.ts)와 같은 값. route segment config는 정적 분석돼
 *   import한 상수를 못 쓴다. 명시하지 않으면 빌드마다 s-maxage=31536000으로 굳거나(2026-09-30 실측)
 *   generateMetadata 때문에 fully dynamic(no-store)이 된다.
 * - `[n]`의 `generateStaticParams() => []` + `dynamicParams = true`: 빌드 때는 아무것도 미리 만들지 않지만
 *   요청이 오면 렌더해 ISR로 캐시하게 하는 표준 패턴. 없으면 라우트 전체가 ƒ(동적) 처리돼 캐시가 안 걸린다.
 */
export function clampCategoryPage(raw: string): number {
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}
