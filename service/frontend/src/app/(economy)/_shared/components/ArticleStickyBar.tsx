'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// 스크롤하면 상단 메뉴가 "카테고리 + 기사 제목 + 읽기 진행선"의 얇은 바로 바뀐다(2026-10-01,
// 영문 사이트 상세 동작을 따름). 헤드라인이 화면 위로 지나간 뒤에 나타나 sticky 헤더
// (z-100, 높이 약 57px)를 그대로 덮는다 — 아래 형식 탭 바(.fmt-bar)가 쓰는 top 오프셋이
// 그대로 유효하다. 진행선은 기사 본문(main) 기준으로 계산하고 리렌더 없이 transform으로만 갱신한다.

const BAR_HEIGHT = 57;

export function ArticleStickyBar({
  category,
  categoryHref,
  title,
}: {
  category: string | null;
  categoryHref: string | null;
  title: string;
}) {
  const [show, setShow] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h1 = document.getElementById('art-h1');
    const main = document.getElementById('main-content');
    if (!h1 || !main) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      setShow(h1.getBoundingClientRect().bottom < BAR_HEIGHT);
      const m = main.getBoundingClientRect();
      const total = m.height - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -m.top / total)) : 0;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <style>{`
        .sbar { position: fixed; top: 0; left: 0; right: 0; height: ${BAR_HEIGHT}px; z-index: 110; background: #fff;
          border-bottom: 1px solid #e5e7eb; transform: translateY(-100%); visibility: hidden;
          transition: transform .22s ease, visibility 0s linear .22s; }
        .sbar[data-show='true'] { transform: none; visibility: visible; transition: transform .22s ease; }
        .sbar-in { max-width: 720px; height: 100%; margin: 0 auto; display: flex; align-items: center; gap: 14px;
          padding: 0 clamp(20px, 4vw, 28px); }
        .sbar-cat { flex-shrink: 0; font-size: 13px; font-weight: 800; letter-spacing: 0.06em; color: #111827; text-decoration: none; }
        .sbar-title { min-width: 0; flex: 1; font-family: "Noto Serif KR", serif; font-size: 17px; font-weight: 700; color: #111827;
          letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: none; background: none;
          padding: 0; text-align: left; cursor: pointer; }
        .sbar-prog { position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: #111827;
          transform-origin: left; transform: scaleX(0); }
        @media (prefers-reduced-motion: reduce) { .sbar, .sbar[data-show='true'] { transition: none; } }
        @media print { .sbar { display: none; } }
      `}</style>
      <div className="sbar" data-show={show} aria-hidden={!show}>
        <div className="sbar-in">
          {category &&
            (categoryHref ? (
              <Link href={categoryHref} className="sbar-cat" tabIndex={show ? 0 : -1}>
                {category}
              </Link>
            ) : (
              <span className="sbar-cat">{category}</span>
            ))}
          <button
            type="button"
            className="sbar-title"
            tabIndex={show ? 0 : -1}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            title="맨 위로"
          >
            {title}
          </button>
        </div>
        <div ref={progressRef} className="sbar-prog" aria-hidden />
      </div>
    </>
  );
}
