import type { Metadata } from 'next';
import { buildEconomyCategoryMetadata, EconomyCategoryPage } from '@/widgets/CategoryArchiveClient';

// 카테고리 아카이브 — slug만 넘기는 wrapper. revalidate 등 라우트 설정이 파일마다 있는 이유는
// widgets/CategoryArchiveClient/EconomyCategoryPage.tsx의 clampCategoryPage 주석 참조.
export const metadata: Metadata = buildEconomyCategoryMetadata('signal');

export const revalidate = 300; // = CACHE_TTL_FALLBACK_SECONDS, 값 바뀌면 카테고리 라우트 전체를 같이 바꿀 것

export default function SignalPage() {
  return <EconomyCategoryPage slug="signal" />;
}
