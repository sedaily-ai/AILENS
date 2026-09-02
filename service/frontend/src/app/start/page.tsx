import type { Metadata } from 'next';
import { OnboardingFlow } from '@/features/onboarding';

export const metadata: Metadata = {
  title: '시작하기',
  description: '오늘의 1면을 원하는 포맷으로 보고, 나에게 맞는 유형을 찾아보세요.',
  alternates: { canonical: '/start' },
  robots: { index: false }, // 개인화 플로우 — 색인 대상 아님(/onboarding이 검색엔 소개 페이지)
};

export default function StartPage() {
  return <OnboardingFlow />;
}
