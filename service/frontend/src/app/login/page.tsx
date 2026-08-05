import type { Metadata } from 'next';
import { LoginClient } from './LoginClient';

export const metadata: Metadata = {
  title: '로그인',
  description: 'AI LENS에 로그인하고 나만의 MBTI 큐레이션 뉴스를 받아보세요.',
  alternates: { canonical: '/login' },
};

export default function LoginPage() {
  return <LoginClient />;
}
