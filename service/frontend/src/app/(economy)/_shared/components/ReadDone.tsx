'use client';

import { useEffect, useRef, useState } from 'react';

// 완독의 순간(2026-10-01) — 글 끝에 닿으면 체크 표시가 부드럽게 그려지고 "다 읽었어요" 한 줄이 나온다.
// 듀오링고·말해보카식 "해냈다"는 감각을 마스코트·요란한 효과 없이(Toss식으로) 작게 준다. 색은 형식 색(--lc).
// 화면에 60% 이상 들어올 때 한 번만 재생. 모션 줄이기 설정이면 처음부터 완성된 모습.

export function ReadDone({ minutes }: { minutes: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- IntersectionObserver 미지원 환경 폴백
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <style>{`
        .rdone { display: flex; align-items: center; gap: 16px; margin-top: 60px; }
        .rdone-ico { flex-shrink: 0; width: 52px; height: 52px; }
        .rdone-bg { fill: var(--lc, #6d28d9); fill-opacity: 0.12; transform-origin: center; transform: scale(0.6); opacity: 0; }
        .rdone-ck { fill: none; stroke: var(--lc, #6d28d9); stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 40; stroke-dashoffset: 40; }
        .rdone[data-on='true'] .rdone-bg { transform: none; opacity: 1; transition: transform .45s cubic-bezier(.34,1.56,.64,1), opacity .3s ease; }
        .rdone[data-on='true'] .rdone-ck { stroke-dashoffset: 0; transition: stroke-dashoffset .45s ease .25s; }
        .rdone-t { margin: 0; font-size: 19px; font-weight: 800; letter-spacing: -0.02em; color: #111827; }
        .rdone-s { margin: 3px 0 0; font-size: 14.5px; color: #6b7280; }
        .rdone-tx { opacity: 0; transform: translateY(6px); }
        .rdone[data-on='true'] .rdone-tx { opacity: 1; transform: none; transition: opacity .4s ease .35s, transform .4s ease .35s; }
        @media (prefers-reduced-motion: reduce) {
          .rdone-bg, .rdone-ck, .rdone-tx { transition: none !important; opacity: 1; transform: none; stroke-dashoffset: 0; }
        }
        @media print { .rdone { display: none; } }
      `}</style>
      <div ref={ref} className="rdone" data-on={on}>
        <svg className="rdone-ico" viewBox="0 0 52 52" aria-hidden>
          <path className="rdone-bg" d="M26 2.5 C 39.5 1.8, 50.4 12.5, 49.6 26.4 C 48.9 40, 38.2 50.6, 25.2 49.7 C 11.8 48.9, 2.2 38.6, 2.8 25.4 C 3.4 12.6, 13 3.2, 26 2.5 Z" />
          <path className="rdone-ck" d="M15.6 27.8 C 18 29.2, 20.6 31.8, 23 35 C 27 27.6, 31.6 22.4, 37 18.6" />
        </svg>
        <div className="rdone-tx">
          <p className="rdone-t">다 읽었어요</p>
          {minutes && <p className="rdone-s">약 {minutes}분 분량의 오늘 레터</p>}
        </div>
      </div>
    </>
  );
}
