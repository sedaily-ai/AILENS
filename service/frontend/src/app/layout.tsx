import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { ConditionalFooter } from "@/widgets/SiteFooter";
import { AnnouncementBar } from "@/widgets/AnnouncementBar";
import { ConditionalTodayNewsPlayer } from "@/widgets/TodayNewsPlayer";

// GA4 Measurement ID — ailens.sedaily.ai 전용 속성.
const GA_ID = "G-BJZ09B6PB6";

// globals.css의 --font-sans가 'Pretendard Variable'을 가리키고 있었지만
// 실제로 로드하는 코드가 어디에도 없어(웹폰트 미적용) 브라우저가 계속
// 시스템 폰트로 폴백하고 있었다(2026-08-06 디자인 감사에서 발견) — 토스·
// 배민 등이 쓰는 그 폰트인데 안 쓰이고 있던 것. next/font/local로 self-host
// (CDN 왕복 없음, layout shift 없음, font-display:swap). 가변 폰트 TTF(6.7MB)
// 대신 실제 쓰는 굵기만 정적 woff2 5종(굵기당 ~770KB, 브라우저가 실제 렌더링에
// 쓰는 굵기만 지연 로드)으로 용량을 줄였다.
const pretendard = localFont({
  src: [
    { path: "./fonts/Pretendard-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Pretendard-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Pretendard-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Pretendard-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Pretendard-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-pretendard",
  display: "swap",
});

import { SITE_URL } from "@/shared/constants/site";
const SITE_TITLE = "AI LENS — 서울경제신문의 AI 경제 뉴스";
const SITE_DESC = "서울경제신문이 만드는 AI 경제 뉴스 서비스. 그날의 핵심 경제 이슈를 매일 정리해 전합니다.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | AI LENS",
  },
  description: SITE_DESC,
  keywords: [
    "AI LENS", "AI 경제뉴스", "맞춤 경제뉴스", "서울경제", "오늘의 한 통",
    "이슈 브리핑", "사주", "오늘의 운세", "사주 궁합", "이상형 역산",
    "경제뉴스", "투자", "증권", "AI 뉴스레터",
  ],
  authors: [{ name: "서울경제신문", url: "https://www.sedaily.com" }],
  publisher: "서울경제신문",
  alternates: {
    canonical: SITE_URL,
  },
  // 파비콘 + Apple touch + PWA 매니페스트 — 4분할 컬러 원형(AI LENS 마크)
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESC,
    url: SITE_URL,
    type: "website",
    locale: "ko_KR",
    siteName: "AI LENS",
    // 1200x630 OG 이미지 (Kakao/Twitter/Facebook 표준)
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: SITE_TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
    images: [`${SITE_URL}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  // KakaoTalk 공유 — Kakao 는 OG 표준 따르되 og:image 가 1200x630 필수
  other: {
    "msapplication-TileColor": "#3B82F6",
    "theme-color": "#3B82F6",
  },
};

// JSON-LD 구조화 데이터 — 검색엔진/AI 크롤러에 사이트 정체성·검색 기능 명시.
// en.sedaily.com AEO 보고서 패턴.
const SITE_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "AI LENS",
      alternateName: "AI LENS · 서울경제",
      description: SITE_DESC,
      inLanguage: "ko-KR",
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "NewsMediaOrganization",
      "@id": `${SITE_URL}/#organization`,
      name: "서울경제신문",
      alternateName: "Seoul Economic Daily",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/lens.png` },
      foundingDate: "1960-08-01",
      // 60+ 년 경제 보도 경험을 E-E-A-T 신호로 명시
      founder: { "@type": "Person", name: "손동영", jobTitle: "대표이사·발행인" },
      address: {
        "@type": "PostalAddress",
        streetAddress: "율곡로 6 트윈트리타워 B동 14~16층",
        addressLocality: "종로구",
        addressRegion: "서울특별시",
        addressCountry: "KR",
      },
      telephone: "+82-2-724-8600",
      hasMap: "https://map.naver.com/p/search/서울경제신문/place/38281793",
      parentOrganization: { "@type": "Organization", name: "서울경제신문", url: "https://www.sedaily.com" },
      sameAs: [
        "https://www.sedaily.com",
        "https://en.sedaily.com",
        "https://www.instagram.com/seoul_economic/",
        "https://www.instagram.com/moneycut_._/",
        "https://www.instagram.com/lens.sedaily/",
        "https://www.youtube.com/@서울경제신문",
        "https://tv.naver.com/sed.thumb",
        "https://www.facebook.com/seouleconomydaily/",
        "https://x.com/sedaily_com",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "editorial",
        email: "webmaster@sedaily.com",
        telephone: "+82-2-724-8600",
        availableLanguage: ["Korean"],
      },
      // en.sedaily.com(참고 사이트)의 NewsMediaOrganization과 비교해 빠져있던
      // 두 필드(2026-08-18 GEO 점검) — /about이 "AI가 초안, 편집팀이 검수"
      // 운영방식을 이미 설명하고 있어 그 페이지를 그대로 가리킨다. 별도
      // 정정보도 페이지가 없어 correctionsPolicy는 추가하지 않음(있지도
      // 않은 페이지를 가리키면 오히려 신뢰 신호가 아니라 깨진 링크가 된다).
      publishingPrinciples: `${SITE_URL}/about`,
      ethicsPolicy: `${SITE_URL}/about`,
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`antialiased ${pretendard.variable}`}>
      <head>
        {/* Noto Serif KR — 세리프 헤딩에 여러 컴포넌트가 인라인 fontFamily로
            그대로 참조 중이라(문자열 다 안 바꿈, 위험 대비 최소 diff) 문자열은
            유지하고 로딩 방식만 고친다. 3개 파일(NewsFeedTab/FrontPageView/
            FrontPageArticleView)이 각자 컴포넌트 <style> 안에서 렌더 블로킹
            @import를 중복 실행하던 걸(2026-08-06 폰트 감사에서 발견) 여기
            <link> 하나로 통합 — preconnect로 왕복도 줄인다. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;600;700;900&display=swap"
        />
        {/* RSS — en.sedaily.com/rss/newsall 패턴 참고(2026-08-07). AI 크롤러·
            뉴스 애그리게이터가 sitemap 외에 이 링크로도 신규 글을 발견한다. */}
        <link rel="alternate" type="application/rss+xml" title="AI LENS RSS" href="/rss.xml" />
        {/* JSON-LD — WebSite + NewsMediaOrganization (E-E-A-T) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSONLD) }}
        />
        {/* GA4 — afterInteractive 로 페이지 인터랙티브 후 로드, FCP 영향 최소화 */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* 사이트가 color-scheme을 선언하지 않으면, 시스템이 다크 모드일 때
            크롬의 "웹 콘텐츠 자동 다크 테마"가 페이지 전체 색을 강제로
            반전시킨다(2026-08-25, 실기기 캡처로 확인 — 흰 배경 스플래시까지
            검게 뒤집혔다). 이 사이트는 라이트 전용으로 설계돼 있어 자동
            다크 반전을 끈다. */}
        <meta name="color-scheme" content="light" />
        {process.env.NODE_ENV === 'development' && (
          <>
            <meta httpEquiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0" />
            <meta httpEquiv="Pragma" content="no-cache" />
            <meta httpEquiv="Expires" content="0" />
          </>
        )}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(regs) {
                  regs.forEach(function(reg) { reg.unregister(); });
                });
                if (window.caches) {
                  caches.keys().then(function(names) {
                    names.forEach(function(name) { caches.delete(name); });
                  });
                }
              }
            `,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col" suppressHydrationWarning>
        <Providers>
          <a href="#main-content" className="skip-link">
            본문 바로가기
          </a>
          <AnnouncementBar />
          {children}
          <ConditionalFooter />
          <ConditionalTodayNewsPlayer />
        </Providers>
      </body>
    </html>
  );
}
