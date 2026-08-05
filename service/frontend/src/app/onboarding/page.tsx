import type { Metadata } from 'next';
import { OnboardingClient } from './OnboardingClient';

export const metadata: Metadata = {
  title: 'AI LENS 소개',
  description: 'MBTI 성향에 맞춘 AI 에디터가 매일 한 통, 다른 시선의 뉴스를 전합니다.',
  alternates: { canonical: '/onboarding' },
};

export default function OnboardingAboutPage() {
  return <OnboardingClient />;
}
