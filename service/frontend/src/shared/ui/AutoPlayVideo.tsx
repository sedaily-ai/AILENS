'use client';

import { useEffect, useRef } from 'react';
import { useMediaProgress } from '@/shared/lib/tracking/useMediaProgress';

// lens/[slug]/LensViewClient.tsx에 갇혀있던 걸 shared/ui로 추출(2026-08-24,
// 코드 리팩토링 감사 Track B — God 파일 분해 1번째 조각). 4가지 시선(레터/
// 웹툰/팟캐스트/영상) 탭을 전환할 때 비활성 탭의 영상을 자동으로 멈추기
// 위해 만들어진 컴포넌트라 — hooks는 .map() 루프 안에서 못 써서 별도
// 컴포넌트로 분리해야 했다 — "탭 전환에 반응해 재생/정지"가 핵심 동작이다.
// video/[slug]/VideoViewClient.tsx는 탭 전환 개념이 없는 단일 영상
// 페이지라 이 컴포넌트를 그대로 재사용하지 않는다(active=true 고정 시
// 페이지 로드 즉시 play() 시도가 붙는 게 지금과 다른 동작이라 이번
// 리팩토링 범위 밖으로 남김).
export function AutoPlayVideo({
  src,
  active,
  articleId,
}: {
  src: string;
  active: boolean;
  articleId?: string | null;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [active]);
  useMediaProgress(ref, articleId, 'video');
  return (
    <video ref={ref} controls preload="auto" src={src} className="w-full h-full" style={{ objectFit: 'contain' }} />
  );
}
