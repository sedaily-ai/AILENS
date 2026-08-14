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

// 사주매칭(AI-saju) 원본 레포를 AILENS 웹사이트 안에 실제 라우트로 병합한 버전
// (2026-08-14). 예전엔 CloudFront 경로 마운트(별도 배포 + CDN에서만 하나로
// 묶기)였는데 로컬 dev에서 /saju가 항상 404였던 문제 때문에 코드 자체를 이
// Next 앱 라우트로 들여왔다. 원본은 sedaily-ai/AI-saju, docs/worklog/2026-08/
// 2026-08-09-saju-cdn-mount.md 참고. 이 레이아웃은 원본 app/layout.tsx에서
// <html>/<body>를 걷어내고(AILENS 루트 레이아웃이 이미 갖고 있음) .saju-scope
// 로 감싼 nested layout이다 — 전역 CSS 변수(--color-primary 등) 충돌 방지용.
export const metadata: Metadata = {
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

export default function SajuLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className={`saju-scope min-h-screen flex flex-col ${notoSerifKR.variable}`}
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
    </div>
  );
}
