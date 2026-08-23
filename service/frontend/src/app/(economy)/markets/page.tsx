import type { Metadata } from 'next';
import { buildEconomyCategoryMetadata, EconomyCategoryPage } from '@/widgets/CategoryArchiveClient';

// 카테고리 아카이브 7개 중 하나 — 공통 로직은 shared/lib/economyCategoryPage.tsx
// 하나에 모아뒀다(2026-08-20 리팩토링). 이 파일은 slug만 넘기는 wrapper.
export const metadata: Metadata = buildEconomyCategoryMetadata('markets');

export default function MarketsPage() {
  return <EconomyCategoryPage slug="markets" />;
}
