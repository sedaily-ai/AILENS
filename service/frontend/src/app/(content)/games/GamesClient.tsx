'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Press_Start_2P } from 'next/font/google';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { GAMES } from '@/shared/data/games';

// next/font로 이 라우트 청크에만 번들 — 예전엔 globals.css 최상단 @import라
// /games를 안 쓰는 페이지까지 매번 googleapis.com 왕복을 렌더 블로킹으로 물고
// 있었다.
const arcadeFont = Press_Start_2P({ weight: '400', subsets: ['latin'], display: 'swap' });

// GAMES 배열은 shared/data/games.ts로 이동(2026-08-21, 홈 게임 미리보기
// 섹션과 공유 — GamesPreviewSection.tsx 참조).

const ARCADE_FONT = `${arcadeFont.style.fontFamily}, "Courier New", monospace`;

export default function GamesClient() {
  const [intro, setIntro] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 1400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(ellipse 80% 60% at 50% 0%, #1a1145 0%, transparent 70%), #050510',
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* CRT scanlines overlay (전역) */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 4px)',
          pointerEvents: 'none',
          zIndex: 50,
          mixBlendMode: 'overlay',
        }}
      />
      {/* CRT vignette */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)',
          pointerEvents: 'none',
          zIndex: 49,
        }}
      />

      {/* 좌상단 뒤로가기 — 헤더 대체 */}
      <Link
        href="/"
        aria-label="AI LENS 로 돌아가기"
        style={{
          position: 'fixed',
          top: 20,
          left: 20,
          zIndex: 60,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.16)',
          borderRadius: 999,
          color: '#fff',
          fontFamily: ARCADE_FONT,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textDecoration: 'none',
          backdropFilter: 'blur(6px)',
          transition: 'all 0.18s',
          WebkitTapHighlightColor: 'transparent',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.14)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)';
        }}
      >
        ◀ EXIT
      </Link>

      <main
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: 'clamp(96px, 14vh, 140px) clamp(20px, 5vw, 32px) clamp(60px, 10vh, 100px)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <header style={{ marginBottom: 56, textAlign: 'center' }}>
          <p
            style={{
              fontFamily: ARCADE_FONT,
              fontSize: 'clamp(11px, 1.6vw, 13px)',
              color: '#3182F6',
              letterSpacing: '0.3em',
              margin: '0 0 24px',
              textShadow: '0 0 12px rgba(49,130,246,0.7)',
              animation: 'arcadeBlink 2s steps(2) infinite',
            }}
          >
            ▸▸ ARCADE ▸▸
          </p>
          <h1
            style={{
              fontFamily: ARCADE_FONT,
              fontSize: 'clamp(26px, 6vw, 48px)',
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: '0.04em',
              color: '#fbbf24',
              margin: '0 0 18px',
              textShadow:
                '0 0 14px rgba(251,191,36,0.7), 0 0 28px rgba(251,191,36,0.4), 0 0 56px rgba(251,191,36,0.2)',
            }}
          >
            PRESS<br />START
          </h1>
          <p
            style={{
              fontSize: 13,
              color: '#94a3b8',
              lineHeight: 1.7,
              margin: 0,
              maxWidth: 460,
              marginInline: 'auto',
              fontFamily: ARCADE_FONT,
              letterSpacing: '0.1em',
            }}
          >
            한 손, 30초. 한 판
          </p>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 24,
          }}
        >
          {GAMES.map((g) => (
            <Link
              key={g.slug}
              href={`/games/play/${g.slug}`}
              prefetch
              onClick={() => trackEvent('game_open', { game: g.slug })}
              style={{
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                background: '#0a0a18',
                borderRadius: 18,
                overflow: 'hidden',
                border: `2px solid ${g.neon}55`,
                boxShadow: `0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 24px ${g.neon}33, 0 12px 36px rgba(0,0,0,0.6)`,
                transition: 'transform 0.22s, box-shadow 0.22s, border-color 0.22s',
                WebkitTapHighlightColor: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-6px)';
                e.currentTarget.style.borderColor = g.neon;
                e.currentTarget.style.boxShadow = `0 0 0 1px rgba(255,255,255,0.06) inset, 0 0 32px ${g.neon}66, 0 0 64px ${g.neon}33, 0 18px 48px rgba(0,0,0,0.7)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = `${g.neon}55`;
                e.currentTarget.style.boxShadow = `0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 24px ${g.neon}33, 0 12px 36px rgba(0,0,0,0.6)`;
              }}
            >
              {/* 썸네일 — 네온 프레임 안 */}
              <div
                style={{
                  aspectRatio: '16 / 10',
                  background: `url(${g.thumb}) center/cover no-repeat, ${g.bg}`,
                  position: 'relative',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.6) 100%)',
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    bottom: 12,
                    right: 14,
                    fontFamily: ARCADE_FONT,
                    fontSize: 10,
                    fontWeight: 700,
                    color: g.neon,
                    background: 'rgba(0,0,0,0.7)',
                    border: `1px solid ${g.neon}66`,
                    padding: '5px 10px',
                    borderRadius: 4,
                    letterSpacing: '0.2em',
                    textShadow: `0 0 8px ${g.neon}88`,
                  }}
                >
                  PLAY ▸
                </span>
              </div>
              <div style={{ padding: '16px 20px 20px' }}>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: '#fff',
                    margin: '0 0 6px',
                    letterSpacing: '-0.005em',
                    textShadow: `0 0 12px ${g.neon}44`,
                  }}
                >
                  {g.title}
                </h2>
                <p style={{ fontSize: 12.5, color: '#94a3b8', lineHeight: 1.65, margin: 0 }}>
                  {g.tagline}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <p
          style={{
            fontFamily: ARCADE_FONT,
            fontSize: 10,
            color: '#475569',
            textAlign: 'center',
            marginTop: 48,
            letterSpacing: '0.16em',
          }}
        >
          MORE GAMES @{' '}
          <a
            href="https://games.sedaily.ai"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#94a3b8', textDecoration: 'underline' }}
          >
            GAMES.SEDAILY.AI
          </a>
        </p>
      </main>

      {/* 오락실 전환 인트로 */}
      {intro && <ArcadeIntro />}

      <style>{`
        @keyframes arcadeBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

function ArcadeIntro() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'arcadeFadeOut 1.4s ease-in forwards',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 4px)',
        }}
      />
      <p
        style={{
          fontFamily: ARCADE_FONT,
          fontSize: 'clamp(22px, 5vw, 36px)',
          fontWeight: 900,
          color: '#3182F6',
          letterSpacing: '0.12em',
          margin: '0 0 14px',
          textShadow: '0 0 16px rgba(49,130,246,0.75), 0 0 32px rgba(49,130,246,0.45)',
          animation: 'arcadeFlash 0.45s steps(2,end) 3',
        }}
      >
        ▸ INSERT COIN
      </p>
      <p
        style={{
          fontFamily: ARCADE_FONT,
          fontSize: 'clamp(13px, 2.6vw, 18px)',
          color: '#fbbf24',
          letterSpacing: '0.16em',
          margin: 0,
          textShadow: '0 0 12px rgba(251,191,36,0.6)',
        }}
      >
        AI LENS · ARCADE
      </p>
      <style>{`
        @keyframes arcadeFadeOut {
          0%, 70% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes arcadeFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.15; }
        }
      `}</style>
    </div>
  );
}
