import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MyLensPage } from './MyLensPage';

export const metadata: Metadata = {
  title: '나의 LENS',
  description: '뉴스 열람 분야와 키워드, 저장한 문장과 레터를 연결하는 개인 뉴스 공간.',
  robots: { index: false, follow: false },
};

export default function MyLensRoute() { return <Suspense fallback={<p role="status">나의 LENS를 불러오고 있어요.</p>}><MyLensPage /></Suspense>; }
