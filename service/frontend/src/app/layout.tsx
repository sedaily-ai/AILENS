import type { Metadata } from "next";
import Script from "next/script";
import "./pretendard.css";
import "./globals.css";
import { Providers } from "./providers";
import { ConditionalFooter } from "@/widgets/SiteFooter";
import { AnnouncementBar } from "@/widgets/AnnouncementBar";
import { ConditionalTodayNewsPlayer } from "@/widgets/TodayNewsPlayer";

// GA4 Measurement ID — ailens.sedaily.ai 전용 속성.
const GA_ID = "G-BJZ09B6PB6";

// Pretendard는 동적 서브셋 CSS(pretendard.css, 2026-10-01)로 로드한다 — 예전엔 next/font/local로 굵기당 약 780KB짜리 전체 글리프
// woff2 5종(3.9MB)을 모든 페이지에서 받았다. 이제 글자 조각별 약 12KB 파일을 화면에 필요한 만큼만 받는다(모바일 용량·LCP 개선).
import { SITE_URL } from "@/shared/constants/site";
const SITE_TITLE = "AI LENS — 서울경제신문의 AI 경제 뉴스";
// 2026-10-01 — 사용자 요청으로 보강("다양한 멀티소스를 실시간으로 구체적으로
// 심층적으로 전달"). 기존 문구는 "AI 경제 뉴스 서비스"라고만 해서 이
// 서비스의 실제 차별점(기자 취재 → AI가 레터/웹툰/팟캐스트/영상 4형식으로
// 재구성 → 편집팀 검수)이 메타디스크립션·WebSite JSON-LD 어디에도 안
// 드러났었다. meta description·OG·Twitter·WebSite 구조화 데이터가 전부 이
// 상수 하나를 공유해서(아래 4곳) 고치면 전체에 일괄 반영된다.
const SITE_DESC = "서울경제신문 기자가 취재한 경제 뉴스를 AI가 레터·웹툰·팟캐스트·영상 4가지 형식으로 매일 재구성하고 편집팀이 검수합니다. 증시·산업·부동산·금융 등 다양한 분야의 이슈를 구체적인 숫자와 맥락까지 담아 깊이 있게 전합니다.";

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
    // Bing Webmaster Tools 사이트 소유 확인(2026-10-01, 사용자 제공 코드).
    // Google은 public/google*.html 파일 방식으로 따로 인증돼 있다.
    "msvalidate.01": "16F11CE1835D2FA5F841CACCB3713A55",
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
    <html lang="ko" className="antialiased">
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
            다크 반전을 끈다.

            2026-08-26 — `light`만으로는 TWA(앱) 세션에서 여전히 반전되는
            게 실기기로 재확인됐다(일반 크롬 탭으로 같은 주소를 열면 정상
            흰색이라 사이트/서버 문제는 아니고, TWA가 붙이는 Custom Tabs
            세션이 사이트별로 다크 설정을 따로 기억·적용하는 것으로 보임).
            `light only`는 명세상 브라우저의 다크 오버라이드 자체를 막는
            더 강한 선언이라 이걸로 올린다. */}
        <meta name="color-scheme" content="light only" />
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
        {/* 앱(TWA) 전용 스플래시 완전 삭제(2026-10-01, 사용자 요청 — "스플래시
            자꾸 뜨는것좀 빼주시면 좋겠네") — referrer 정확 일치 판정 →
            el.remove() 대신 display:none → suppressHydrationWarning까지,
            세 차례 수정을 전부 로컬(dev 모드+standalone 프로덕션 빌드)에서
            재현 없이 검증하고 배포했는데도(리비전 24/25/26) 실제 프로덕션
            (ailens.sedaily.ai)에서는 React #418과 스플래시 고착이 계속
            재현됐다 — CloudFront 캐시를 invalidate한 직후 origin 직통
            요청에서도 재현돼 CDN 캐시 문제도 아니었고, 근본 원인을 못
            찾은 채 사용자 체감(웹에서 반복 노출)만 계속 나빠지고 있어
            기능 자체를 들어낸다. TWA(mobile/, mobile-capacitor/) 쪽
            네이티브 스플래시(Android 쉘이 웹뷰 로드 전에 그리는 것)는
            이 코드와 무관하게 그대로 동작 — 앱 첫 진입 시 "빈 화면"
            체감이 생기면 그건 네이티브 스플래시 지속시간 쪽에서 따로
            다룰 문제. 마크업·CSS(public/splash.css)도 다른 소비처가
            없어 같이 삭제했다. */}
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
