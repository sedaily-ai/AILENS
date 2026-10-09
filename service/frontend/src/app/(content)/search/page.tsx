import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchPage } from '@/widgets/SearchPage';

// 검색 결과 페이지 — 조건마다 다른 주소가 무한히 생기는 얇은 페이지라 색인하지 않는다(사이트맵에도 넣지 않는다). 링크는 따라가게 둔다.
export const metadata: Metadata = {
  title: '검색',
  description: 'AI LENS의 이슈를 제목과 요약에서 찾아 보세요.',
  robots: { index: false, follow: true },
  alternates: { canonical: '/search' },
};

// useSearchParams를 쓰는 클라이언트 컴포넌트는 Suspense 경계가 필요하다(없으면 빌드가 실패한다).
export default function SearchRoute() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh' }} aria-hidden />}>
      <SearchPage />
    </Suspense>
  );
}
