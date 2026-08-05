import type { Metadata } from 'next';
import { TodayLensClient } from './TodayLensClient';

export const metadata: Metadata = {
  title: '오늘의 LENS — 당신만의 큐레이션',
  description:
    'MBTI × 사주 기반 개인화 추천. 4명의 AI 에디터가 골라준 오늘의 1편, 다양한 시선 비교, 나의 누적 데이터까지 — AI LENS만의 양방향 뉴스 경험.',
  alternates: { canonical: '/today' },
};

export default function TodayLensPage() {
  return <TodayLensClient />;
}
