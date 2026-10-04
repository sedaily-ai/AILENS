import type { Metadata } from 'next';

// AuthCallbackPage는 'use client'라 자체 generateMetadata를 쓸 수 없다. OAuth 리다이렉트 중간 화면으로 콘텐츠가 없으므로 색인에서 뺀다.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthCallbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
