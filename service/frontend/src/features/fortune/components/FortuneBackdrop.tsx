'use client';

import { useEffect, useState } from 'react';

type MbtiGroup = 'NT' | 'NF' | 'ST' | 'SF';

interface Props {
  group?: MbtiGroup;
}

const glowByGroup: Record<MbtiGroup, { lamp: string; corner: string }> = {
  NT: { lamp: '#a78bfa', corner: '#ede9fe' },
  NF: { lamp: '#fb7185', corner: '#ffe4e6' },
  ST: { lamp: '#34d399', corner: '#d1fae5' },
  SF: { lamp: '#fbbf24', corner: '#fef3c7' },
};

// 떠다닐 한자들
const HANJA = [
  { ch: '運', size: 180, x: '15%', y: '8%', rot: -8, opacity: 0.04 },
  { ch: '命', size: 140, x: '78%', y: '22%', rot: 6, opacity: 0.045 },
  { ch: '神', size: 110, x: '45%', y: '55%', rot: -3, opacity: 0.035 },
  { ch: '五', size: 90, x: '8%', y: '68%', rot: 4, opacity: 0.04 },
  { ch: '行', size: 90, x: '88%', y: '74%', rot: -6, opacity: 0.04 },
  { ch: '占', size: 70, x: '35%', y: '88%', rot: 10, opacity: 0.035 },
  { ch: '星', size: 70, x: '70%', y: '45%', rot: -10, opacity: 0.04 },
];

export function FortuneBackdrop({ group = 'NF' }: Props) {
  const g = glowByGroup[group];
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const parallaxSlow = scrollY * 0.06;
  const parallaxFast = scrollY * 0.12;

  return (
    <div
      aria-hidden
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {/* 기본 따뜻한 배경 (한지 톤) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, #fffdf7 0%, #fcfaf3 35%, #faf8f1 100%)',
        }}
      />

      {/* 한지 노이즈 텍스처 (SVG) */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="paperNoise">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" />
          <feColorMatrix
            values="0 0 0 0 0.78
                    0 0 0 0 0.72
                    0 0 0 0 0.58
                    0 0 0 0.05 0"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#paperNoise)" />
      </svg>

      {/* 좌상단 등불 글로우 (포차 백열등 느낌) */}
      <div
        style={{
          position: 'absolute',
          top: -180,
          left: -180,
          width: 520,
          height: 520,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${g.lamp}38 0%, ${g.lamp}10 35%, transparent 65%)`,
          filter: 'blur(20px)',
          transform: `translateY(${parallaxSlow}px)`,
        }}
      />

      {/* 우상단 작은 등불 */}
      <div
        style={{
          position: 'absolute',
          top: 60,
          right: -120,
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${g.lamp}28 0%, ${g.lamp}08 40%, transparent 70%)`,
          filter: 'blur(16px)',
          transform: `translateY(${parallaxFast}px)`,
        }}
      />

      {/* 하단 따뜻한 base 글로우 */}
      <div
        style={{
          position: 'absolute',
          bottom: -240,
          left: '50%',
          marginLeft: -360,
          width: 720,
          height: 480,
          borderRadius: '50%',
          background: `radial-gradient(ellipse, ${g.corner}80 0%, transparent 70%)`,
          filter: 'blur(20px)',
        }}
      />

      {/* 떠다니는 한자 부적 (희미하게) */}
      {HANJA.map((h, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: h.x,
            top: h.y,
            fontSize: h.size,
            fontFamily: 'Noto Serif KR, serif',
            fontWeight: 900,
            color: '#3c2a1a',
            opacity: h.opacity,
            transform: `rotate(${h.rot}deg) translateY(${parallaxSlow * (i % 2 === 0 ? 1 : -0.5)}px)`,
            userSelect: 'none',
            lineHeight: 1,
            letterSpacing: '-0.05em',
          }}
        >
          {h.ch}
        </span>
      ))}

      {/* 반짝이는 별 점들 */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        viewBox="0 0 1000 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <style>{`
          @keyframes twinkle {
            0%, 100% { opacity: 0.15; }
            50% { opacity: 0.5; }
          }
          .twinkle { animation: twinkle 3.5s ease-in-out infinite; }
        `}</style>
        {[
          { cx: 120, cy: 80, r: 1.5, d: 0 },
          { cx: 240, cy: 140, r: 1, d: 0.6 },
          { cx: 380, cy: 100, r: 1.8, d: 1.2 },
          { cx: 520, cy: 60, r: 1.2, d: 1.8 },
          { cx: 700, cy: 130, r: 1.5, d: 0.4 },
          { cx: 860, cy: 90, r: 1, d: 2.0 },
          { cx: 920, cy: 220, r: 1.5, d: 1.0 },
          { cx: 80, cy: 300, r: 1.2, d: 1.5 },
          { cx: 200, cy: 500, r: 1, d: 0.8 },
          { cx: 880, cy: 600, r: 1.5, d: 1.7 },
        ].map((s, i) => (
          <circle
            key={i}
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            fill={g.lamp}
            className="twinkle"
            style={{ animationDelay: `${s.d}s` }}
          />
        ))}
      </svg>

      {/* 상단 한 줄 따뜻한 빛띠 (등불에서 떨어지는 광선) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background: `linear-gradient(90deg, transparent 0%, ${g.lamp}80 50%, transparent 100%)`,
          opacity: 0.4,
        }}
      />
    </div>
  );
}
