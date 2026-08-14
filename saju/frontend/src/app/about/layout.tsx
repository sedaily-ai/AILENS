import type { Metadata } from 'next';

/**
 * /about/ 는 / 로 통합됨 (2026-04-30).
 * static export 이므로 서버 301 대신 meta refresh + canonical로 처리.
 * 크롤러에게는 noindex + canonical=/ 로, 유저에게는 0초 refresh로 이동.
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://saju.sedaily.ai'),
  title: {
    absolute: '사주매칭 — 사주·오늘의 운세·궁합 추천',
  },
  alternates: {
    canonical: 'https://saju.sedaily.ai/',
  },
  robots: {
    index: false,
    follow: true,
  },
  other: {
    refresh: '0; url=/',
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
