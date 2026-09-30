import type { Metadata } from 'next';
import { fetchCmsPosts, fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { fetchFollowingLetters } from '@/shared/lib/api/todayLettersApi';
import { buildArchiveItems, PAGE_SIZE } from '@/shared/lib/archiveItems';
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
    fetchFollowingLetters(5),
  ]);
  const items = buildArchiveItems(letters, [], [], lens).filter((it) => it.category === config.label);
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
