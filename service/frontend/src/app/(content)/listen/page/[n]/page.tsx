import type { Metadata } from 'next';
import { fetchHomePlayerPosts } from '@/shared/lib/api/homePlayerApi';
import { CACHE_TTL_FALLBACK_SECONDS } from '@/shared/lib/api/cmsPostsApi';
import { ListenListClient } from '../../ListenListClient';
import {
  SITE_URL,
  LISTEN_LIST_TITLE,
  LISTEN_LIST_DESCRIPTION,
  buildListenJsonLd,
} from '../../listenListShared';

// 2026-09-03 — generateStaticParams 제거(SSR 전환, 빌드 시간 감사).
// /lens/page/[n]과 같은 이유 — 아카이브 뒷장은 실사용자가 거의 안
// 들어가는데도 빌드 때마다 전부 미리 구워서 낭비였다.
// export const revalidate 명시(2026-09-30) — generateMetadata가 동적
// 함수라는 이유만으로 캐시가 전혀 안 걸리던 문제 수정(카테고리
// 페이지네이션에서 실측 확인).
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
  const url = `${SITE_URL}/listen/page/${n}`;
  const title = `${LISTEN_LIST_TITLE} — ${n}페이지`;
  return {
    title,
    description: LISTEN_LIST_DESCRIPTION,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: LISTEN_LIST_DESCRIPTION,
      url,
      type: 'website',
      images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 오디오' }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: LISTEN_LIST_DESCRIPTION,
      images: [`${SITE_URL}/og-image.png`],
    },
  };
}

export default async function ListenListPageN({ params }: { params: Promise<{ n: string }> }) {
  const { n: rawN } = await params;
  // n<=1 리다이렉트는 middleware.ts가 처리(redirect()를 여기 두면 캐시
  // 불가 판정됨 — 상단 revalidate 주석 참조), 여기선 안전하게 clamp만.
  const parsedN = parseInt(rawN, 10);
  const n = Number.isFinite(parsedN) && parsedN > 1 ? parsedN : 1;

  const items = await fetchHomePlayerPosts();
  const jsonLd = buildListenJsonLd(items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ListenListClient initialItems={items} initialPage={n} />
    </>
  );
}
