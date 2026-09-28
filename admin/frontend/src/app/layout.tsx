import type { Metadata } from "next";
import { Noto_Serif_KR, Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

/* 제목용 세리프. 사용자 사이트의 editorial-title 과 같은 얼굴이라
   도구와 제품의 브랜드가 이어진다. next/font 로 self-host — 정적 export 라
   외부 폰트 요청을 만들지 않는 편이 낫다.
   무게는 700 하나만 담는다: 한글 웹폰트는 unicode-range 서브셋이 많아 무게당
   ~3.6MB 가 붙는다. 실제로 .font-display 는 전부 font-bold 로만 쓰인다. */
const notoSerifKr = Noto_Serif_KR({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-display",
  display: "swap",
});

/* 브랜드 워드마크 전용 — AI LENS 공식 스플래시 핸드오프(docs/design-system/notes/
   2026-08-25-ai-lens-splash-handoff.md)가 지정한 얼굴은 Noto Sans KR 900이다.
   "LENS" 워드마크(로그인 화면, .font-brand 사용처)는 전부 라틴 문자라 위
   .font-display 와 같은 이유로 subsets는 latin 하나, weight도 900 하나만
   담는다(같은 용량 절감 원칙). 앱 전역 .font-display 를 이 얼굴로 바꾸지
   않은 건 그게 시압/StepTabs 등 이미 자리잡은 다른 화면까지 건드리기
   때문 — 이 폰트는 브랜드 워드마크 노출 지점(현재는 로그인 화면)에만
   .font-brand 로 스코프한다. */
const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["900"],
  variable: "--font-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AI LENS CMS",
    template: "%s · AI LENS CMS",
  },
  description: "AI LENS 콘텐츠 관리 시스템",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`h-full ${notoSerifKr.variable} ${notoSansKr.variable}`}>
      <body className="min-h-full flex flex-col antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
