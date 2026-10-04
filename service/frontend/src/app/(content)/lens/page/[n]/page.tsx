import type { Metadata } from 'next';
import { fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { fetchFollowingLetters } from '@/shared/lib/api/todayLettersApi';
import { LensListClient } from '../../LensListClient';
import {
  SITE_URL,
  LENS_LIST_TITLE,
  LENS_LIST_DESCRIPTION,
  buildLensJsonLd,
} from '../../lensListShared';

// generateStaticParams는 두지 않는다(SSR). 아카이브 뒷장은 방문이 적어 미리 빌드하면 빌드 시간·릴리스 용량만 늘고, [slug] 상세와 달리 <Link> 프리페치 이득이 미미하다.
// export const revalidate를 명시한다. 없으면 generateMetadata가 동적 함수라는 이유만으로 Next가 이 라우트를 fully dynamic 처리해 캐시가 걸리지 않는다.
export const revalidate = 300; // = CACHE_TTL_FALLBACK_SECONDS(cmsPostsApi.ts). route segment config는 정적 분석되어 import한 상수를 쓸 수 없으므로 값 변경 시 함께 수정한다.

export const dynamicParams = true;

// generateStaticParams가 없으면 Next가 이 라우트를 fully dynamic(ƒ) 처리해 revalidate를 명시해도 무시되고 캐시가 걸리지 않는다.
// 빈 배열을 반환하면 빌드 시점엔 아무것도 만들지 않고 요청 시 렌더해 ISR로 캐시하는 표준 패턴이 된다(dynamicParams:true와 짝).
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
    // 뒷장(2페이지 이후)은 얇은 목록이라 색인에서 뺀다(링크는 따라가게 follow) — 기사는 사이트맵·내부 링크로 발견된다.
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
  // n<=1/비정상값 리다이렉트는 middleware.ts가 요청 단계에서 처리한다(redirect()를 여기 두면 Next가 이 라우트를 캐시 불가로 판정). 직접 들어오는 경우를 대비해 clamp만 한다.
  const parsedN = parseInt(rawN, 10);
  const n = Number.isFinite(parsedN) && parsedN > 1 ? parsedN : 1;

  const [items, hotLetters] = await Promise.all([fetchLensPosts(), fetchFollowingLetters(10)]);
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
