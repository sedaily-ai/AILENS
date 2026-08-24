'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { useCutViewTracking } from '@/shared/lib/tracking/useCutViewTracking';

// lens/[slug]/LensViewClient.tsx에 갇혀있던 걸 shared/ui로 추출(2026-08-24,
// God 파일 분해). KPI 계측(2026-08-23) — 웹툰 완주율("컷 몇까지 봤는가").
// 컷 목록을 감싸는 컨테이너에 ref를 걸고 IntersectionObserver로 컷별
// 노출을 잡는다 — 역시 hooks는 .map() 루프 안에서 못 써서 별도 컴포넌트로
// 뺐다.
//
// 2026-08-24(웹툰 릴론치 PR #10 반영) — "이미지 + 그 아래 캡션"을 8번
// 반복하던 형태(컷마다 18px 여백으로 끊김 → 만화가 아니라 그림 목록을
// 스크롤하는 느낌, 컷 안 말풍선 대사와 캡션이 같은 말을 두 번 함)를
// **이어지는 한 줄기**로 바꿨다. 컷을 2px 간격으로만 붙여 세로로 이어
// 붙인다(웹툰의 기본 읽기 방식) — 캡션은 화면에서 사라진 게 아니라
// 호출부(LensFormatPanel의 "대사로 읽기" 접이식 목록)로 자리를 옮긴 것
// 뿐이라 접근성·SEO 손실이 없다. 그래서 이 컴포넌트는 이제 caption을
// 렌더하지 않는다 — alt 텍스트로만 남긴다.
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
    <div
      ref={containerRef}
      className="lm"
      style={{ display: 'flex', flexDirection: 'column', gap: 2, borderRadius: 14, overflow: 'hidden', background: '#f3f4f6' }}
    >
      {cuts.map((cut, ci) => (
        <figure key={ci} data-cut-index={ci + 1} style={{ margin: 0 }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 2', background: '#f3f4f6' }}>
            <Image
              src={cut.url}
              alt={cut.caption || `${ci + 1}번째 컷`}
              fill
              sizes="(min-width: 920px) 700px, 100vw"
              style={{ objectFit: 'contain' }}
            />
          </div>
        </figure>
      ))}
    </div>
  );
}
