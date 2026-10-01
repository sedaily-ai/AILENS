import type { Metadata } from 'next';
import { fetchLensPosts, CACHE_TTL_FALLBACK_SECONDS } from '@/shared/lib/api/cmsPostsApi';
import { fetchFollowingLetters } from '@/shared/lib/api/todayLettersApi';
import { LensListClient } from '../../LensListClient';
import {
  SITE_URL,
  LENS_LIST_TITLE,
  LENS_LIST_DESCRIPTION,
  buildLensJsonLd,
} from '../../lensListShared';

// 2026-09-03 — generateStaticParams 제거(SSR 전환, 빌드 시간 감사).
// 아카이브 뒷장(예: /lens/page/15)은 실사용자가 거의 안 들어가는데도
// 빌드 때마다 전부 미리 구워서 빌드 시간·릴리스 용량을 불필요하게
// 늘리고 있었다 — [slug] 상세 페이지(<Link> 프리페치가 중요한 곳)와
// 달리 페이지네이션은 그 UX 이득이 미미해 완전 동적 렌더로 바꾼다.
// export const revalidate 명시(2026-09-30) — 없으면 generateMetadata가
// 동적 함수라는 이유만으로 Next가 이 라우트를 fully dynamic 처리해 캐시가
// 전혀 안 걸린다(카테고리 페이지네이션에서 실측 확인된 것과 같은 문제).
export const revalidate = 300; // = CACHE_TTL_FALLBACK_SECONDS(cmsPostsApi.ts) — route segment config는 정적 분석돼 import한 상수를 못 쓴다, 값 바뀌면 여기도 같이 바꿀 것

export const dynamicParams = true;

// generateStaticParams가 아예 없으면 Next가 이 라우트를 통째로 fully
// dynamic(ƒ) 처리해 캐시가 전혀 안 걸린다 — revalidate를 명시해도 무시됨
// (실측: 클린 빌드 결과 항상 ƒ, 배포 후 항상 no-store, 2026-09-30). 빈
// 배열을 반환해 "빌드 시점엔 아무 것도 미리 안 만들지만 요청이 오면 그때
// 렌더해서 ISR로 캐시해도 된다"는 걸 Next에 알려주는 표준 패턴
// (dynamicParams:true와 짝 — 빌드 시간·산출물 크기를 늘리지 않으면서도
// 캐싱은 정상 작동하게 한다).
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ n: string }>;
}): Promise<Metadata> {
  const { n } = await params;
  const url = `${SITE_URL}/lens/page/${n}`;
  const title = `${LENS_LIST_TITLE} — ${n}페이지`;
  return {
    title,
    description: LENS_LIST_DESCRIPTION,
    alternates: { canonical: url },
    // 뒷장(2페이지 이후)은 얇은 목록이라 색인에서 뺀다(링크는 따라가게 follow) — 기사는 사이트맵·내부 링크로 발견된다(2026-10-01, SEO 감사).
    robots: { index: false, follow: true },
    openGraph: {
      title,
      description: LENS_LIST_DESCRIPTION,
      url,
      type: 'website',
      images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS — 4가지 시선' }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: LENS_LIST_DESCRIPTION,
      images: [`${SITE_URL}/og-image.png`],
    },
  };
}

export default async function LensListPageN({ params }: { params: Promise<{ n: string }> }) {
  const { n: rawN } = await params;
  // n<=1/비정상값 리다이렉트는 middleware.ts가 요청 단계에서 처리한다
  // (redirect()를 여기 두면 Next가 이 라우트를 캐시 불가로 판정 — 위 주석
  // 참조). 그래도 혹시 직접 들어오는 경우를 대비해 안전하게 clamp만 한다.
  const parsedN = parseInt(rawN, 10);
  const n = Number.isFinite(parsedN) && parsedN > 1 ? parsedN : 1;

  const [items, hotLetters] = await Promise.all([fetchLensPosts(), fetchFollowingLetters(5)]);
  const jsonLd = buildLensJsonLd(items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LensListClient initialItems={items} initialPage={n} initialHotLetters={hotLetters} />
    </>
  );
}
