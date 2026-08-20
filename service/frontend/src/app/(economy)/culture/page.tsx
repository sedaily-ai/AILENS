import type { Metadata } from 'next';
import { buildEconomyCategoryMetadata, EconomyCategoryPage } from '@/shared/lib/economyCategoryPage';

// 카테고리 아카이브 7개 중 하나 — 공통 로직은 shared/lib/economyCategoryPage.tsx
// 하나에 모아뒀다(2026-08-20 리팩토링). 이 파일은 slug만 넘기는 wrapper.
export const metadata: Metadata = buildEconomyCategoryMetadata('culture');

export default function CulturePage() {
  return <EconomyCategoryPage slug="culture" />;
}
