'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { displayHeadline } from '@/shared/lib/displayHeadline';

// 사진이 이끄는 기사 히어로(2026-10-01, "기사 느낌이 너무 강하다 — 사진 베이스의 인터랙티브
// 웹 페이지 느낌" 요청의 1단계).
//
// 해상도: 원본 사진은 서울경제 피드의 이미지(대부분 가로 1200px, 일부 630~720px)라 화면 전체로
// 늘리면 흐려진다. 그래서 선명한 사진은 최대 1200px로 가운데 두고(.hero-img), 같은 사진을 크게
// 블러해 뒤에 깔아(.hero-bg) 넓은 화면의 양옆을 채운다. 사진이 작은 글도 같은 방식으로 깨져 보이지 않는다.
//
// 제목·부제는 어두운 그라데이션 위 흰 글씨. h1#art-h1·data-speakable은 상세 페이지의 스크롤 바와
// 음성 읽기 마크업이 그대로 쓰므로 유지한다. 스크롤하면 사진이 천천히 따라 올라가는 패럴랙스(모션
// 줄이기 설정이면 끔).

export function ArticleHero({
  photo,
  headline,
  deck,
  category,
  categoryHref,
  subcategory,
  creditHref,
}: {
  photo: string;
  headline: string;
  deck?: string | null;
  category?: string | null;
  categoryHref?: string | null;
  subcategory?: string | null;
  creditHref?: string | null;
}) {
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const el = imgRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      // 히어로가 화면에 있는 동안만(약 한 화면 높이) 천천히 밀어 올린다.
      if (y < window.innerHeight * 1.2) el.style.transform = `translate3d(0, ${Math.round(y * 0.18)}px, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header className="hero">
      <style>{`
        /* 풀블리드 — 읽기 컬럼(.lw)·셸 패딩을 벗어나 화면 폭 전체를 쓴다. 헤더 바로 밑까지 붙인다. */
        .hero { position: relative; height: var(--hero-h); overflow: hidden; background: #111827; color: #fff;
          width: 100vw; margin-left: calc(50% - 50vw); margin-top: calc(-1 * clamp(8px, 2vw, 16px)); }
        .hero-bg { position: absolute; inset: -40px; filter: blur(34px) brightness(0.7) saturate(1.1); transform: scale(1.05); }
        .hero-bg img { object-fit: cover; }
        .hero-fg { position: absolute; inset: 0; will-change: transform; }
        .hero-img { position: absolute; top: 0; bottom: -12%; left: 50%; width: min(100%, 1200px); transform: translateX(-50%);
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); }
        @media (max-width: 1200px) { .hero-img { -webkit-mask-image: none; mask-image: none; } }
        .hero-img img { object-fit: cover; object-position: center 35%; }
        .hero-shade { position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0) 28%, rgba(0,0,0,0.20) 48%, rgba(0,0,0,0.78) 100%); }
        .hero-copy { position: absolute; left: 0; right: 0; bottom: 0; }
        .hero-copy-in { max-width: 720px; margin: 0 auto; padding: 0 clamp(20px, 4vw, 28px) clamp(28px, 5vh, 48px); }
        .hero-eyebrow { font-size: 13px; font-weight: 700; letter-spacing: 0.02em; color: rgba(255,255,255,0.82); margin: 0 0 12px; }
        .hero-eyebrow a { color: inherit; text-decoration: none; }
        .hero-eyebrow a:hover { color: #fff; text-decoration: underline; text-underline-offset: 3px; }
        .hero-badge { display: inline-block; margin-left: 8px; padding: 2px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 700;
          color: #fff; background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.32); vertical-align: 1px; }
        .hero-h1 { font-family: "Noto Serif KR", serif; font-weight: 700; color: #fff; letter-spacing: -0.025em; line-height: 1.32;
          font-size: clamp(30px, 4.8vw, 48px); margin: 0 0 14px; text-wrap: balance; word-break: keep-all;
          text-shadow: 0 2px 18px rgba(0,0,0,0.35); }
        .hero-deck { font-size: calc(18px * var(--lens-font-scale, 1)); line-height: 1.6; color: rgba(255,255,255,0.88); margin: 0;
          white-space: pre-line; word-break: keep-all; max-width: 640px; }
        .hero-credit { position: absolute; right: 14px; top: 12px; font-size: 11.5px; color: rgba(255,255,255,0.75);
          text-shadow: 0 1px 6px rgba(0,0,0,0.5); }
        .hero-credit a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
        @media (prefers-reduced-motion: no-preference) {
          .hero-copy-in > * { animation: hero-up .6s cubic-bezier(.22,.85,.2,1) both; }
          .hero-copy-in > *:nth-child(2) { animation-delay: .06s; }
          .hero-copy-in > *:nth-child(3) { animation-delay: .12s; }
          @keyframes hero-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        }
        @media print { .hero { height: auto; background: none; color: #111; } .hero-bg, .hero-fg, .hero-shade { display: none; }
          .hero-copy { position: static; } .hero-h1, .hero-deck, .hero-eyebrow { color: #111; text-shadow: none; } }
      `}</style>

      <div className="hero-bg" aria-hidden>
        <Image src={photo} alt="" fill sizes="25vw" style={{ objectFit: 'cover' }} />
      </div>
      <div className="hero-fg" ref={imgRef}>
        <div className="hero-img">
          <Image src={photo} alt={headline} fill sizes="(min-width: 1200px) 1200px, 100vw" quality={90} priority />
        </div>
      </div>
      <div className="hero-shade" aria-hidden />
      <p className="hero-credit">
        {creditHref ? (
          <>
            사진 ·{' '}
            <a href={creditHref} target="_blank" rel="noopener noreferrer">
              서울경제
            </a>
          </>
        ) : (
          '사진 · 서울경제'
        )}
      </p>

      <div className="hero-copy">
        <div className="hero-copy-in">
          <p className="hero-eyebrow">
            {category && (categoryHref ? <Link href={categoryHref}>{category}</Link> : category)}
            {subcategory && <> · {subcategory}</>}
            <span className="hero-badge">4가지 시선</span>
          </p>
          <h1 id="art-h1" data-speakable="headline" className="hero-h1">
            {displayHeadline(headline)}
          </h1>
          {deck && (
            <p data-speakable="summary" className="hero-deck">
              {deck}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
