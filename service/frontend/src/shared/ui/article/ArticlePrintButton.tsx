'use client';

import { Printer } from 'lucide-react';

// 인쇄 버튼 — lens/[slug]/LensViewClient.tsx와 letters/[id]/
// LetterDetailClient.tsx가 완전히 동일한 코드를 각자 로컬 복제하고 있던 걸
// 하나로 합쳤다(2026-08-18). 테두리를 안 갖는다 — ArticleFontSizeControl과
// 함께 호출부가 하나의 테두리로 감싸 한 세트처럼 보이게 조립한다.
export function ArticlePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-gray-400 hover:text-gray-900 transition-colors"
      style={{ padding: 8 }}
      aria-label="기사 인쇄"
      title="인쇄"
    >
      <Printer className="w-4 h-4" />
    </button>
  );
}
