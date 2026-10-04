import { Suspense } from 'react';
import { LetterViewClient } from './LetterViewClient';

export const metadata = {
  title: '오늘의 한 통',
  description: '에디터가 그날의 뉴스를 한 통으로 정리해 전합니다.',
  // ?id=로 내용이 바뀌는 구 공유 링크 별칭 — 실제 콘텐츠는 경로 기반 /letters/[id]가 정본이다.
  // 정적 export라 id별 canonical을 서버에서 만들 수 없으므로 이 라우트를 색인에서 빼 중복 콘텐츠를 막는다. 링크 자체는 계속 동작한다.
  robots: { index: false, follow: true },
};

// 정적 export — 동적 세그먼트 없는 단일 페이지. ?id= 는 클라이언트에서 읽는다.
export default function LettersViewPage() {
  return (
    <Suspense fallback={null}>
      <LetterViewClient />
    </Suspense>
  );
}
