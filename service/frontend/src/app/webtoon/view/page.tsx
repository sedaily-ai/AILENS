import { Suspense } from 'react';
import { WebtoonViewClient } from './WebtoonViewClient';

export const metadata = {
  title: '웹툰 | AI LENS',
  description: '요즘 이슈를 컷으로 이어 보여드려요.',
};

// 정적 export — 동적 세그먼트 없는 단일 페이지. ?id= 는 클라이언트에서 읽는다.
// /letters/view 와 동일 패턴 (letterHref.ts 주석 참조) — 라이브(비-prerender)
// slug 도 안전하게 client-side 라우팅하기 위함.
export default function WebtoonViewPage() {
  return (
    <Suspense fallback={null}>
      <WebtoonViewClient />
    </Suspense>
  );
}
