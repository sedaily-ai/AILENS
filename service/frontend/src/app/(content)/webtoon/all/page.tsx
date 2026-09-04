import type { Metadata } from 'next';
import { fetchWebtoons } from '@/shared/lib/api/cmsPostsApi';
import { SITE_URL } from '@/shared/constants/site';
import { AllWebtoonsClient } from './AllWebtoonsClient';

// 2026-09-04 — SITE_URL 로컬 재정의 제거(리팩토링 감사로 발견) — 2026-08-23에
// 21개 파일의 중복 정의를 shared/constants/site.ts로 통일했는데, 이 파일은
// 그 직후(2026-08-24)에 신설되며 그 규칙을 다시 어겼다.
const TITLE = '전체 웹툰 — AI LENS';
const DESCRIPTION = '서울경제 AI LENS가 연재 중인 모든 웹툰 시리즈를 한눈에 볼 수 있어요.';

// /webtoon(홈 목록)의 "최근 업데이트"·"전체 웹툰" 섹션 부제를 "더보기"
// 링크로 바꾸면서 신설한 전용 브라우징 페이지(2026-08-21). 히어로 캐러셀이
// 없다는 점만 빼면 /webtoon과 같은 서버 컴포넌트 패턴(fetchWebtoons()를
// 빌드타임에 미리 가져와 initialItems로 내려서 정적 HTML에 실제 카드가
// 바로 박히게 한다 — /webtoon/page.tsx 상단 주석과 같은 이유).
//
// robots noindex는 안 건다 — /webtoon과 콘텐츠가 겹치지만(카테고리로 거른
// 부분집합) 이 페이지가 "전체"를, /webtoon이 "최신+하이라이트"를 보여주는
// 서로 다른 진입점이라 중복 콘텐츠로 보기 어렵다. canonical도 자기 자신을
// 가리킨다.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/webtoon/all` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/webtoon/all`,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 웹툰' }],
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

export default async function AllWebtoonsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; cat?: string }>;
}) {
  const { page, cat } = await searchParams;
  const items = await fetchWebtoons();
  const initialPage = Math.max(1, parseInt(page ?? '1', 10) || 1);
  return <AllWebtoonsClient initialItems={items} initialPage={initialPage} initialCategory={cat} />;
}
