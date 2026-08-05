import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SajuMatchClient } from './SajuMatchClient';

// 사주 궁합 — 이상형 역산 + 커플 궁합 (AI-saju 본가 엔진 포팅).
// useSearchParams 사용 — 정적 export 빌드에서 Suspense 경계 필수.

export const metadata: Metadata = {
  title: '사주로 보는 궁합 — 이상형 역산 + 커플 궁합',
  description:
    '내 사주 하나로 잘 맞는 이상형(일간·띠·생월)을 역산하고, 두 사람 생년월일시로 실제 커플 궁합을 풀어드려요. 명리학과 AI를 결합한 적합도 점수 + 근거.',
  alternates: { canonical: 'https://ailens.sedaily.ai/saju-match' },
  openGraph: {
    title: '사주로 보는 궁합 — 이상형 역산 + 커플 궁합',
    description: '내 사주로 이상형 역산, 두 사람 사주로 커플 궁합을 풀어드려요.',
    url: 'https://ailens.sedaily.ai/saju-match',
    type: 'website',
  },
};
export default function SajuMatchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <SajuMatchClient />
    </Suspense>
  );
}
