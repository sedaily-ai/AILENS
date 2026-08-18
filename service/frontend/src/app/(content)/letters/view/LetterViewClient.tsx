'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LetterDetailClient } from '../[id]/LetterDetailClient';

/**
 * 쿼리 파라미터(`?id=`) 로 레터 상세를 여는 정적 라우트의 클라이언트 본체.
 * 라이브(비-prerender) letterId 도 안전하게 렌더 — letterHref() 참조.
 * LetterDetailClient 는 letterId 만으로 자체 fetch 한다.
 */
export function LetterViewClient() {
  const id = useSearchParams().get('id') ?? '';

  if (!id) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-[680px] px-5 py-20 text-center text-neutral-500">
          <p>레터를 찾을 수 없습니다.</p>
          <Link
            href="/?tab=feed"
            className="mt-4 inline-block text-sm underline underline-offset-4 hover:text-neutral-900"
          >
            레터 피드로
          </Link>
        </div>
      </div>
    );
  }

  return <LetterDetailClient letterId={id} />;
}
