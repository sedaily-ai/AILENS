'use client';

import { useEffect, useRef } from 'react';
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
// 사진(LensViewClient PHOTO_SHADOW)과 같은 결의 그림자 — 컷 묶음이 페이지 위에 살짝 떠 있는 한 장처럼 보이게.
const WEBTOON_SHADOW =
  '0 1px 2px rgba(17,24,39,0.06), 0 6px 16px -4px rgba(17,24,39,0.12), 0 22px 44px -14px rgba(17,24,39,0.18)';

export function WebtoonCutGallery({
  cuts,
  articleId,
}: {
  cuts: { url: string; caption?: string }[];
  articleId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useCutViewTracking(containerRef, articleId, cuts.length);

  // 몰입(2026-10-01) — 컷이 화면에 들어올 때 살짝 떠오르며 나타난다. 한 번만, 모션 줄이기면 처음부터 보임.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !('IntersectionObserver' in window)) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const figs = Array.from(root.querySelectorAll<HTMLElement>('figure[data-cut-index]'));
    figs.forEach((f) => f.setAttribute('data-pre', ''));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // 화면에 들어왔거나, 이미 위로 지나친 컷(빠르게 건너뛴 경우)은 바로 보이게 한다 — 빈 공백이 남지 않도록.
          if (e.isIntersecting || e.boundingClientRect.bottom < 0) {
            (e.target as HTMLElement).removeAttribute('data-pre');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    figs.forEach((f) => io.observe(f));
    // IntersectionObserver는 화면을 거치지 않고 건너뛴(아래→위로 지나친) 컷엔 반응하지 않으므로, 스크롤 때 위로 지나친 컷도 보이게 한다.
    let raf = 0;
    const revealPassed = () => {
      raf = 0;
      figs.forEach((f) => {
        if (f.hasAttribute('data-pre') && f.getBoundingClientRect().bottom < 0) f.removeAttribute('data-pre');
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(revealPassed);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [cuts.length]);

  return (
    <div
      ref={containerRef}
      className="lm wcut"
      style={{ display: 'flex', flexDirection: 'column', gap: 0, borderRadius: 18, overflow: 'hidden', background: '#fff', boxShadow: WEBTOON_SHADOW }}
    >
      <style>{`
        /* 이미지에 집중(2026-10-01) — 웹툰은 본문 칼럼 폭을 벗어나 화면 가운데에서 넓게 보여 준다(최대 920px). */
        .lm.wcut { max-width: none; width: min(calc(100vw - 32px), 920px); margin-left: 50%; transform: translateX(-50%); }
        .wcut figure { transition: opacity .5s ease, transform .5s ease; }
        .wcut figure[data-pre] { opacity: 0; transform: translateY(14px); }
      `}</style>
      {cuts.map((cut, ci) => (
        <figure key={ci} data-cut-index={ci + 1} style={{ margin: 0 }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 2', background: '#fff' }}>
            <Image
              src={cut.url}
              alt={cut.caption || `${ci + 1}번째 컷`}
              fill
              sizes="(min-width: 952px) 920px, calc(100vw - 32px)"
              quality={85}
              style={{ objectFit: 'contain' }}
            />
          </div>
        </figure>
      ))}
    </div>
  );
}
