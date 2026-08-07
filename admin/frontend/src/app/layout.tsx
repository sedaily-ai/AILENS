import type { Metadata } from "next";
import { Noto_Serif_KR } from "next/font/google";
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
    <html lang="ko" className={`h-full ${notoSerifKr.variable}`}>
      <body className="min-h-full flex flex-col antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
