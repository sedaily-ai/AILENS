'use client';

import { useEffect, useState } from 'react';

// 맨 위로 가기 — 기사를 한참 내려온 뒤 오른쪽 아래에 위 화살표 하나만 나타나고, 누르면 한 번에 맨 위로 올라간다.
// 네이버 웹툰·뉴스 뷰어처럼 조용한 흰 원형 버튼. 처음 한 화면 반 정도 내려오기 전에는 보이지 않는다(상단에서는 필요 없음).
// 스크롤 이벤트마다 리렌더하지 않도록 임계값을 넘는 순간에만 상태를 바꾼다.

const SHOW_AFTER = 900;

export function ArticleToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setShow(window.scrollY > SHOW_AFTER);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <>
      <style>{`
        .totop { position: fixed; right: clamp(16px, 2.4vw, 32px); bottom: clamp(16px, 2.4vw, 32px); z-index: 90;
          width: 48px; height: 48px; display: grid; place-items: center; border: none; border-radius: 50%; cursor: pointer;
          background: #fff; color: #111827; box-shadow: 0 6px 20px rgba(15,23,42,0.16), 0 1px 3px rgba(15,23,42,0.1);
          opacity: 0; transform: translateY(8px); pointer-events: none; transition: opacity .2s ease, transform .2s ease; }
        .totop[data-show='true'] { opacity: 1; transform: none; pointer-events: auto; }
        .totop:hover { box-shadow: 0 8px 24px rgba(15,23,42,0.2), 0 1px 3px rgba(15,23,42,0.1); }
        .totop:focus-visible { outline: 2px solid #111827; outline-offset: 3px; }
        @media (prefers-reduced-motion: reduce) { .totop { transition: none; } }
        @media print { .totop { display: none; } }
      `}</style>
      <button type="button" className="totop" data-show={show} onClick={toTop} aria-label="맨 위로" tabIndex={show ? 0 : -1}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 15 6-6 6 6" />
        </svg>
      </button>
    </>
  );
}
