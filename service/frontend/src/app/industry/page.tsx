import type { Metadata } from 'next';
import { fetchCmsPosts } from '@/shared/lib/api/cmsPostsApi';
import { buildArchiveItems, PAGE_SIZE } from '@/shared/lib/archiveItems';
import { buildCategoryMetadata, buildCategoryJsonLd } from '@/shared/lib/seo/buildCategoryPageMeta';
import { CategoryArchiveClient } from '@/shared/ui/CategoryArchiveClient';
import { ECON_CATEGORIES } from '@/shared/constants/econCategories';

// 카테고리 아카이브 6개 중 하나(2026-08-17, 상단 탭 개편) — 구조는
// shared/ui/CategoryArchiveClient.tsx·shared/lib/buildCategoryPageMeta.ts에
// 공유돼 있고, 이 파일은 설정값(slug/tabKey)만 다르다.
const CONFIG = ECON_CATEGORIES.find((c) => c.slug === 'industry')!;

export const metadata: Metadata = buildCategoryMetadata(CONFIG);

export default async function IndustryPage() {
  const letters = await fetchCmsPosts('letters', undefined, PAGE_SIZE);
  const items = buildArchiveItems(letters, [], []).filter((it) => it.category === CONFIG.label);
  const jsonLd = buildCategoryJsonLd(CONFIG, items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CategoryArchiveClient config={CONFIG} tabKey="industry" initialItems={items} />
    </>
  );
}
