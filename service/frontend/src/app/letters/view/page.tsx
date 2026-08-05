import { Suspense } from 'react';
import { LetterViewClient } from './LetterViewClient';

export const metadata = {
  title: '오늘의 한 통 | AI LENS',
  description: '에디터가 그날의 뉴스를 한 통으로 정리해 전합니다.',
};

// 정적 export — 동적 세그먼트 없는 단일 페이지. ?id= 는 클라이언트에서 읽는다.
export default function LettersViewPage() {
  return (
    <Suspense fallback={null}>
      <LetterViewClient />
    </Suspense>
  );
}
