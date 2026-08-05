import { Suspense } from 'react';
import { FrontPageView } from '@/features/front-page';

export const metadata = {
  title: '오늘의 1면 | AI LENS',
  description: '서울경제 종이신문 1면 기사를 매일 그대로 전합니다.',
};

export default function PaperPage() {
  return (
    <Suspense fallback={null}>
      <FrontPageView />
    </Suspense>
  );
}
