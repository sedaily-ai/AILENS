import type { Metadata } from "next";
import { Noto_Serif_KR } from "next/font/google";
import "./saju-globals.css";

// 명패(목재) 타일 갑자 서예체 — /saju/saju (원국 페이지) UnCard 전용
const notoSerifKR = Noto_Serif_KR({
  weight: ["700", "900"],
  subsets: ["latin"],
  variable: "--font-serif-kr",
  display: "swap",
});

import { Providers } from "./saju-providers";
import { GoogleAnalytics } from "@saju/shared/lib/GoogleAnalytics";
import { ClarityAnalytics } from "@saju/shared/lib/ClarityAnalytics";
import { TopNav } from "@saju/shared/ui/TopNav";

// 사주매칭(AI-saju) — 독립 Next.js 앱 (2026-08-15, 완전 프로세스 분리).
// 2026-08-14 하루 동안 CDN 마운트 → AILENS 네이티브 라우트 vendoring을
// 거쳤는데, vendoring은 같은 dev 프로세스·같은 .next 캐시를 AILENS 본체와
// 공유해서 사주 쪽 캐시 오염이 본체 dev 서버 전체를 폭주시키는 사고로
// 이어졌다(docs/worklog/2026-08/2026-08-14-saju-native-route-merge.md).
// 그래서 다시 완전히 독립된 앱으로 분리 — service/frontend는 로컬 dev에서
// rewrite로, 프로덕션에선 기존 CloudFront 경로 마운트로 이 앱을 가리킬 뿐
// 프로세스는 완전히 별개다. 원본은 sedaily-ai/AI-saju,
// docs/worklog/2026-08/2026-08-09-saju-cdn-mount.md 참고.
export const metadata: Metadata = {
  metadataBase: new URL("https://saju.sedaily.ai"),
  title: {
    default: "사주매칭 — 사주·오늘의 운세·궁합 추천 (무료)",
    template: "%s | 사주매칭",
  },
  description:
    "생년월일 하나로 사주팔자 원국·오늘의 운세·대운·재운·커리어·궁합까지 한 화면에. 궁통보감·삼명통회·자평진전 3대 고전과 KASI 만세력을 결합한 데이터 기반 무료 사주 서비스.",
  keywords: [
    "사주", "사주팔자", "무료사주", "오늘의 운세", "운세", "궁합",
    "사주 궁합", "커플 궁합", "재운", "대운", "세운", "십성",
    "명리학", "만세력", "KASI 만세력", "일간", "오행",
  ],
  alternates: {
    canonical: "/saju",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={notoSerifKR.variable}>
      <body
        className="saju-scope min-h-screen flex flex-col"
        style={{
          background: 'var(--saju-paper)',
          color: 'var(--saju-ink)',
        }}
      >
        <Providers>
          <TopNav />
          {children}
          <footer className="mt-auto py-4 text-center text-[11px] text-gray-400 font-medium">
            Copyright ⓒ Sedaily, All right reserved
          </footer>
        </Providers>
        <GoogleAnalytics />
        <ClarityAnalytics />
      </body>
    </html>
  );
}
