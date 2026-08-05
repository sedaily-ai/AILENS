import type { Metadata } from 'next';
import { FortuneClient } from './FortuneClient';

export const metadata: Metadata = {
  title: '오늘의 운세 — MBTI별 AI 사주',
  description:
    '민철·하은·준서·소율 4명의 AI 에디터가 풀어주는 오늘의 운세. MBTI 성향에 맞춘 맞춤 사주 분석 — 매일 새로운 인사이트, 사주팔자·대운·세운·월운·일진 일괄 분석.',
  keywords: ['오늘의 운세', 'MBTI 운세', 'AI 사주', '사주팔자', '대운', '세운', '일진', '서울경제 AI LENS'],
  openGraph: {
    title: '오늘의 운세 — MBTI별 AI 사주 | AI LENS',
    description:
      '4명의 AI 에디터가 풀어주는 오늘의 운세. MBTI × 사주 결합한 맞춤 분석.',
    type: 'website',
    locale: 'ko_KR',
    siteName: 'AI LENS',
  },
  twitter: {
    card: 'summary_large_image',
    title: '오늘의 운세 — MBTI별 AI 사주 | AI LENS',
    description: '4명의 AI 에디터가 풀어주는 오늘의 운세. MBTI × 사주 결합한 맞춤 분석.',
  },
  alternates: {
    canonical: '/fortune',
  },
};

export default function FortunePage() {
  return <FortuneClient />;
}
