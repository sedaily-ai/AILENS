'use client';

import { useEffect } from 'react';

// 스크롤 리빌 — 아직 화면 아래에 있는 소제목·하단 구획이 보이는 순간 은은하게 나타난다(투명 + 10px 아래 → 제자리, .5초).
// 요약 박스의 항목은 CSS로 로드 때 순차 등장한다(.sum-item).
//
// 원칙:
//  · JS가 처음 그리는 시점에 이미 화면 안에 있는 요소는 숨기지 않는다(깜빡임 방지) — 아래에 있는 것만 대상.
//  · 숨김 처리는 이 컴포넌트가 mount된 뒤에만 한다 — JS가 없거나 실패해도 내용은 항상 보인다(SEO·접근성).
//  · 모션 줄이기 설정이면 아무것도 하지 않는다. 인쇄 시엔 전부 보이게.
//  · 탭 전환으로 나중에 보이는 요소(웹툰·팟캐스트 패널)는 대상이 아니다 — 처음 렌더 시점의 요소만.

const SELECTOR = '.lread > .lread-sub, .af-sec';

export function ArticleReveal() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;

    const targets = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR)).filter((el) => {
      const r = el.getBoundingClientRect();
      // 숨겨진 패널(display:none, rect 0)이나 이미 화면 안에 있는 요소는 제외.
      return r.height > 0 && r.top > window.innerHeight * 0.95;
    });
    if (targets.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).classList.add('rv-in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
    );
    targets.forEach((el) => {
      el.classList.add('rv');
      io.observe(el);
    });
    return () => {
      io.disconnect();
      // 정리 시 숨김 상태가 남지 않게 한다.
      targets.forEach((el) => el.classList.add('rv-in'));
    };
  }, []);

  return (
    <style>{`
      .rv { opacity: 0; transform: translateY(10px); transition: opacity .5s ease, transform .5s ease; }
      .rv.rv-in { opacity: 1; transform: none; }
      @media (prefers-reduced-motion: no-preference) {
        .sum-item { animation: rv-up .55s cubic-bezier(.22,.85,.2,1) both; }
        .sum-item:nth-child(1) { animation-delay: .05s; } .sum-item:nth-child(2) { animation-delay: .13s; }
        .sum-item:nth-child(3) { animation-delay: .21s; } .sum-item:nth-child(4) { animation-delay: .29s; }
        .sum-item:nth-child(5) { animation-delay: .37s; }
        @keyframes rv-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      }
      @media print { .rv { opacity: 1 !important; transform: none !important; } }
    `}</style>
  );
}
