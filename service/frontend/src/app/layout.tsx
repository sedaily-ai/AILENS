import type { Metadata } from "next";
import Script from "next/script";
import "./pretendard.css";
import "./globals.css";
import { Providers } from "./providers";
import { ConditionalFooter } from "@/widgets/SiteFooter";
import { ConditionalTodayNewsPlayer } from "@/widgets/TodayNewsPlayer";

// GA4 Measurement ID — ailens.sedaily.ai 전용 속성.
const GA_ID = "G-BJZ09B6PB6";

// Pretendard는 동적 서브셋 CSS(pretendard.css)로 로드한다. 글자 조각별 약 12KB 파일을 필요한 만큼만 받아, 전체 글리프 woff2(굵기당 약 780KB)를 받는 것보다 모바일 용량·LCP에 유리하다.
import { SITE_URL } from "@/shared/constants/site";
const SITE_TITLE = "AI LENS — 서울경제신문의 AI 경제 뉴스";
// 사이트 설명 상수 — 서비스의 차별점(기자 취재 → AI가 레터/웹툰/팟캐스트/영상 4형식으로 재구성 → 편집팀 검수)을 담는다.
// meta description·OG·Twitter·WebSite 구조화 데이터가 이 상수 하나를 공유한다.
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
    "이슈 브리핑",
    "경제뉴스", "투자", "증권", "AI 뉴스레터",
  ],
  authors: [{ name: "서울경제신문", url: "https://www.sedaily.com" }],
  creator: "서울경제신문 AI LENS 편집팀",
  publisher: "서울경제신문",
  // 검색·AI 크롤러용 사이트 신원 보강.
  applicationName: "AI LENS",
  generator: "Next.js",
  category: "news",
  classification: "경제 뉴스 · 뉴스 해설 · 금융 · 증권 · 산업 · 부동산",
  referrer: "origin-when-cross-origin",
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { capable: true, title: "AI LENS", statusBarStyle: "default" },
  alternates: {
    canonical: SITE_URL,
    // 한국어 단일 사이트임을 명시(hreflang) — 영문판은 별도 도메인(en.sedaily.com)이라 연결하지 않는다.
    languages: { "ko-KR": SITE_URL, "x-default": SITE_URL },
    types: { "application/rss+xml": [{ url: `${SITE_URL}/rss.xml`, title: "AI LENS RSS" }] },
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
    alternateLocale: ["en_US"],
    // 1200x630 OG 이미지 (Kakao/Twitter/Facebook 표준)
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: SITE_TITLE }],
  },
  twitter: {
    site: "@sedaily_com",
    creator: "@sedaily_com",
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
    images: [`${SITE_URL}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
    // 스니펫·이미지·영상 미리보기를 제한하지 않는다(AI 요약·검색 결과 카드에 최대한 노출).
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  // KakaoTalk 공유 — Kakao 는 OG 표준 따르되 og:image 가 1200x630 필수
  other: {
    "msapplication-TileColor": "#3B82F6",
    "theme-color": "#3B82F6",
    // Bing Webmaster Tools 사이트 소유 확인. Google은 public/google*.html 파일 방식으로 별도 인증되어 있다.
    "msvalidate.01": "16F11CE1835D2FA5F841CACCB3713A55",
    // 지역·언어·분류 신호(GEO) — 서울 소재 한국어 경제 뉴스.
    language: "ko",
    "content-language": "ko-KR",
    "geo.region": "KR-11",
    "geo.placename": "서울특별시 종로구",
    "geo.position": "37.5704;126.9830",
    ICBM: "37.5704, 126.9830",
    rating: "general",
    distribution: "global",
    // Dublin Core — 일부 학술·아카이브·AI 수집기가 읽는 서지 메타.
    "DC.language": "ko",
    "DC.publisher": "서울경제신문",
    "DC.rights": "© 서울경제신문. All rights reserved.",
    "DC.type": "Text",
    "DC.format": "text/html",
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": "AI LENS",
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
      copyrightHolder: { "@id": `${SITE_URL}/#organization` },
      isAccessibleForFree: true,
      keywords: "AI 경제뉴스, 경제 뉴스 해설, 증시, 산업, 부동산, 금융, 오늘의 이슈, 4가지 시선, 서울경제",
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
      // 쿡북 10.6 순서(Wikidata > Wikipedia > 공식 사이트·소셜). Wikidata·Wikipedia는 API로 실존을 확인한 항목이다.
      sameAs: [
        "https://www.wikidata.org/wiki/Q12601146",
        "https://en.wikipedia.org/wiki/Seoul_Economic_Daily",
        "https://ko.wikipedia.org/wiki/서울경제",
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
      // /about이 "AI가 초안, 편집팀이 검수" 운영방식을 설명하므로 해당 페이지를 가리킨다.
      // 별도 정정보도 페이지가 없어 correctionsPolicy는 두지 않는다(없는 페이지를 가리키면 깨진 링크가 된다).
      publishingPrinciples: `${SITE_URL}/about`,
      ethicsPolicy: `${SITE_URL}/about`,
      // GEO 보강 — AI 검색·답변 엔진이 이 매체가 무엇을 다루는 곳인지 한 번에 읽는 필드들.
      slogan: "그날의 핵심 경제 이슈를 매일 정리해 전합니다",
      description: SITE_DESC,
      areaServed: { "@type": "Country", name: "대한민국" },
      knowsAbout: ["경제 뉴스", "시그널", "부동산", "경제", "금융", "산업", "정치", "사회", "국제 경제", "경제 용어", "시사 해설"],
      masthead: `${SITE_URL}/about`,
      actionableFeedbackPolicy: `${SITE_URL}/contact`,
      isAccessibleForFree: true,
      award: "WAN-IFRA Digital Media Awards APAC 2026 — Best AI-driven News Product (Gold, AI LENS)",
      taxID: "208-81-10310",
    },
    {
      // 상단 내비게이션을 기계가 읽을 수 있게(사이트링크·AI 요약이 주요 섹션을 파악하는 데 쓴다).
      "@type": "ItemList",
      "@id": `${SITE_URL}/#navigation`,
      name: "AI LENS 주요 섹션",
      itemListElement: [
        ["시그널", "/markets"], ["부동산", "/property"], ["경제", "/economy"], ["금융", "/finance"], ["산업", "/industry"],
        ["정치", "/politics"], ["사회", "/national"], ["국제", "/international"], ["문화", "/culture"],
        ["오늘의 시선", "/lens"], ["용어 해설", "/words"],
      ].map(([name, path], i) => ({
        "@type": "SiteNavigationElement",
        position: i + 1,
        name,
        url: `${SITE_URL}${path}`,
      })),
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
        {/* Noto Serif KR — 세리프 헤딩이 여러 컴포넌트에서 인라인 fontFamily로 참조되므로 문자열은 유지하고 로딩 방식만 <link> 하나로 통합한다.
            컴포넌트별 렌더 블로킹 @import 중복을 없애고 preconnect로 왕복을 줄인다. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400..900&display=swap"
        />
        {/* RSS — AI 크롤러·뉴스 애그리게이터가 sitemap 외에 이 링크로도 신규 글을 발견한다. */}
        <link rel="alternate" type="application/rss+xml" title="AI LENS RSS" href="/rss.xml" />
        {/* llms.txt 명세(llmstxt.org) — 사이트를 설명하는 llms.txt 위치를 HTML에서도 알린다. */}
        <link rel="describedby" href="/llms.txt" type="text/plain" />
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
        {/* Microsoft Clarity — 세션 녹화·히트맵. 모바일 LCP를 지키려고 lazyOnload(브라우저가 한가할 때)로 늦게 불러온다.
            GA4 이벤트·세션 태그 연동은 shared/lib/tracking/trackEvent.ts(스니펫이 없으면 아무 일도 안 한다). */}
        <Script id="clarity-init" strategy="lazyOnload">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "x8tf88chwu");
          `}
        </Script>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* color-scheme: light only — 선언이 없으면 시스템 다크 모드에서 크롬의 "웹 콘텐츠 자동 다크 테마"가 페이지 색을 강제 반전한다. 이 사이트는 라이트 전용이다.
            `light`만으로는 TWA(앱)의 Custom Tabs 세션에서 여전히 반전되어, 브라우저의 다크 오버라이드를 명세상 막는 `light only`를 쓴다. */}
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
        <Providers>
          <a href="#main-content" className="skip-link">
            본문 바로가기
          </a>
          {/* 상단 공지 배너(AnnouncementBar)는 제거했다. 서버 HTML에는 없고 클라이언트 로드 후 나타나 본문을 약 36px 밀어 CLS를 유발한다.
              재도입 시 높이를 서버 HTML에서 예약하거나 본문을 밀지 않는 방식으로 구현해야 한다. */}
          {children}
          <ConditionalFooter />
          <ConditionalTodayNewsPlayer />
        </Providers>
      </body>
    </html>
  );
}
