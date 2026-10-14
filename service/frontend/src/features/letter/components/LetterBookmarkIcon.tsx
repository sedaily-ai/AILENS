import { Bookmark } from 'lucide-react';

/** 레터 목록·상세·대시보드의 저장 상태를 같은 모양으로 표시한다. */
export function LetterBookmarkIcon({ saved }: { saved: boolean }) {
  return <Bookmark size={22} strokeWidth={1.8} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />;
}
