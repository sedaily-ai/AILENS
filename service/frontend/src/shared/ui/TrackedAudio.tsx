'use client';

import { useRef } from 'react';
import { useMediaProgress } from '@/shared/lib/tracking/useMediaProgress';

// lens/[slug]/LensViewClient.tsx에 갇혀있던 걸 shared/ui로 추출(2026-08-24,
// God 파일 분해). KPI 계측(2026-08-23) — 팟캐스트 완주율. AutoPlayVideo와
// 같은 이유로 별도 컴포넌트로 뺐다(hooks는 .map() 루프 안에서 못 씀).
export function TrackedAudio({ src, articleId }: { src: string; articleId?: string | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useMediaProgress(ref, articleId, 'podcast');
  return <audio ref={ref} controls preload="none" src={src} style={{ width: '100%' }} />;
}
