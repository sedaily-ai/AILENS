'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 카드 → 레터 이동 사이에 잠깐 끼는 만화풍 트랜지션.
 * 스피너/지렁이 없음 — 캐릭터가 "펑" 등장 + 집중선 + 말풍선.
 * prefers-reduced-motion이면 모션을 죽이고 정적 표시.
 *
 * 단일 명의(AI LENS) 체계(2026-08-07) 이후로는 페르소나별 캐릭터가 없어
 * 고정된 단일 브랜드 아이덴티티를 쓴다 (현재 이 컴포넌트를 부르는 곳은 없다 —
 * 죽은 코드지만 export 는 유지, 다음 세션에서 재도입될 수 있어 삭제하지 않음).
 */

const BRAND = { char: '/icon-512.png', name: 'AI LENS', color: '#111827', line: '오늘의 한 통을 펼치는 중이에요' };

export function LetterTransition() {
  const p = BRAND;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 포털은 클라이언트 마운트 후 1회만(SSR/정적 export 가드, 정당한 케이스)
    setMounted(true);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-label={`${p.name}의 레터를 펼치는 중`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#ffffff',
        animation: 'lt-fade 180ms ease-out both',
      }}
    >
      <style>{`
        @keyframes lt-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes lt-spin { to { transform: rotate(360deg) } }
        @keyframes lt-pop {
          0%   { transform: scale(0.55) rotate(-7deg); opacity: 0 }
          55%  { transform: scale(1.09) rotate(2.5deg); opacity: 1 }
          75%  { transform: scale(0.97) rotate(-1deg) }
          100% { transform: scale(1) rotate(0deg); opacity: 1 }
        }
        @keyframes lt-bob {
          0%,100% { transform: translateY(0) }
          50%     { transform: translateY(-9px) }
        }
        @keyframes lt-bubble {
          0%   { transform: scale(0.6) translateY(8px); opacity: 0 }
          60%  { transform: scale(1.04) translateY(0); opacity: 1 }
          100% { transform: scale(1) translateY(0); opacity: 1 }
        }
        @keyframes lt-dot {
          0%, 80%, 100% { transform: scale(0.5); opacity: 0.35 }
          40%           { transform: scale(1);   opacity: 1 }
        }
        @media (prefers-reduced-motion: reduce) {
          .lt-anim { animation: none !important }
          .lt-rays { display: none !important }
        }
      `}</style>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* 집중선 — 캐릭터 뒤에서 천천히 회전 */}
        <div
          className="lt-rays"
          aria-hidden
          style={{
            position: 'absolute',
            top: 'calc(50% - 158px)',
            width: 360,
            height: 360,
            transform: 'translateY(-6px)',
            borderRadius: '50%',
            background: `repeating-conic-gradient(${p.color}22 0deg 6deg, transparent 6deg 16deg)`,
            WebkitMaskImage: 'radial-gradient(closest-side, transparent 38%, #000 40%, #000 70%, transparent 78%)',
            maskImage: 'radial-gradient(closest-side, transparent 38%, #000 40%, #000 70%, transparent 78%)',
            animation: 'lt-spin 9s linear infinite',
          }}
        />

        {/* 캐릭터 — 펑 등장 후 둥실 */}
        <div
          className="lt-anim"
          style={{ animation: 'lt-pop 560ms cubic-bezier(.34,1.56,.64,1) both' }}
        >
          <div className="lt-anim" style={{ animation: 'lt-bob 2.4s ease-in-out 620ms infinite' }}>
            <div
              style={{
                width: 176,
                height: 176,
                borderRadius: '50%',
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img loading="lazy"
                src={p.char}
                alt={p.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
