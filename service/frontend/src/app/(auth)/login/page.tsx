import type { Metadata } from 'next';
import { LoginClient } from './LoginClient';

export const metadata: Metadata = {
  title: '로그인',
  description: 'AI LENS에 로그인하고 오늘의 경제 뉴스를 받아보세요.',
  alternates: { canonical: '/login' },
  // 로그인 화면은 색인 대상이 아니다(robots.txt에서도 막혀 있다).
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return <LoginClient />;
}
