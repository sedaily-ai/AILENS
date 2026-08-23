'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { useCutViewTracking } from '@/shared/lib/tracking/useCutViewTracking';

// lens/[slug]/LensViewClient.tsx에 갇혀있던 걸 shared/ui로 추출(2026-08-24,
// God 파일 분해). KPI 계측(2026-08-23) — 웹툰 완주율("컷 몇까지 봤는가").
// 컷 목록을 감싸는 컨테이너에 ref를 걸고 IntersectionObserver로 컷별
// 노출을 잡는다 — 역시 hooks는 .map() 루프 안에서 못 써서 별도 컴포넌트로
// 뺐다.
export function WebtoonCutGallery({
  cuts,
  articleId,
}: {
  cuts: { url: string; caption?: string }[];
  articleId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useCutViewTracking(containerRef, articleId, cuts.length);
  return (
    <div ref={containerRef} className="lm" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {cuts.map((cut, ci) => (
        <figure key={ci} data-cut-index={ci + 1} style={{ margin: 0 }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 2', borderRadius: 14, overflow: 'hidden', background: '#f3f4f6' }}>
            <Image src={cut.url} alt={cut.caption || ''} fill sizes="(min-width: 920px) 700px, 100vw" style={{ objectFit: 'contain' }} />
          </div>
          {cut.caption && (
            <figcaption style={{ marginTop: 8, fontSize: 13.5, color: '#374151', lineHeight: 1.6, wordBreak: 'keep-all' }}>
              {cut.caption}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
