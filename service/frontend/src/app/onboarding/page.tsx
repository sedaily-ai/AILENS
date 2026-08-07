import type { Metadata } from 'next';
import { OnboardingClient } from './OnboardingClient';

export const metadata: Metadata = {
  title: 'AI LENS 소개',
  description: 'AI가 매일 아침 그날의 경제 뉴스를 정리해 한 통으로 전합니다.',
  alternates: { canonical: '/onboarding' },
};

export default function OnboardingAboutPage() {
  return <OnboardingClient />;
}
