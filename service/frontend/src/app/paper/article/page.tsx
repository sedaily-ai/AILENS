import { Suspense } from 'react';
import { FrontPageArticleView } from '@/features/front-page';

export const metadata = {
  title: '1면 기사 | AI LENS',
  description: '서울경제 종이신문 1면 기사 본문.',
};

export default function PaperArticlePage() {
  return (
    <Suspense fallback={null}>
      <FrontPageArticleView />
    </Suspense>
  );
}
