import type { Metadata } from 'next';

// AuthCallbackPage는 'use client'라 자체 generateMetadata를 못 쓴다(2026-08-14,
// SEO 감사 — 이 라우트만 메타데이터가 전혀 없어서 발견). OAuth 리다이렉트
// 중간 화면일 뿐 콘텐츠가 없으니 색인에서 뺀다.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthCallbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
