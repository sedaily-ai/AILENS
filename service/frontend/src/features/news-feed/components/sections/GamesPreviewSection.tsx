'use client';

import Link from 'next/link';
import { Press_Start_2P } from 'next/font/google';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { GAMES } from '@/shared/data/games';

const arcadeFont = Press_Start_2P({ weight: '400', subsets: ['latin'], display: 'swap' });
const ARCADE_FONT = `${arcadeFont.style.fontFamily}, "Courier New", monospace`;

// 게임 섹션(2026-08-21, 사용자 요청 — "게임도 섹션을... 메인에다가...
// 웹툰은 트렌디하게 잘 만들어진 것 같은데... 약간 재밌는 게임 느낌나도록").
// 웹툰·영상 섹션과 같은 "재밌게 훑는 비주얼 콘텐츠" 톤이되, 이 섹션만은
// 의도적으로 사이트 전역의 밝은 에디토리얼 톤을 벗어난다 — /games
// 라우트(GamesClient.tsx) 자체가 이미 다크+네온 아케이드 톤으로 확립돼
// 있어서, 홈 티저도 그 톤을 그대로 가져와야 "여기 게임 있구나"가
// 즉시 전달된다(에디토리얼 톤으로 얌전하게 만들면 오히려 재미 신호가
// 죽는다). 게임 목록(GAMES)은 GamesClient.tsx와 shared/data/games.ts를
// 공유 — 새 게임이 추가되면 이 섹션도 자동으로 늘어난다.
//
// 게임이 2종뿐이라 웹툰/영상처럼 4열 그리드로 채우면 휑해 보인다는
// 우려로, 처음엔 "대표 게임 1개 배너"만 검토했으나 실제로 카드 2장을
// 나란히 놓아도 각 카드가 충분히 크게 보여서(2열, 최소폭 260px) 사용자
// 확인 없이 2장 전부 노출하는 쪽으로 결정 — 둘 다 실제로 플레이 가능한
// 완성 콘텐츠라 숨길 이유가 없다.
export function GamesPreviewSection() {
  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <header
        style={{
          marginBottom: 14,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <p
            className="text-gray-400"
            style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
          >
            게임
          </p>
          <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            잠깐, 한 판 하고 갈까요?
          </h2>
        </div>
        <Link
          href="/games"
          className="text-gray-500 hover:text-gray-900 flex-shrink-0"
          style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          더 보기
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'clamp(12px, 2.4vw, 20px)',
        }}
      >
        {GAMES.map((g) => (
          <Link
            key={g.slug}
            href={`/games/play/${g.slug}`}
            prefetch
            onClick={() => trackEvent('game_open', { game: g.slug, from: 'home' })}
            className="group"
            style={{
              display: 'block',
              textDecoration: 'none',
              color: 'inherit',
              background: '#0a0a18',
              borderRadius: 16,
              overflow: 'hidden',
              border: `2px solid ${g.neon}55`,
              boxShadow: `0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 20px ${g.neon}2e, 0 10px 28px rgba(0,0,0,0.5)`,
              transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.borderColor = g.neon;
              e.currentTarget.style.boxShadow = `0 0 0 1px rgba(255,255,255,0.06) inset, 0 0 28px ${g.neon}55, 0 16px 36px rgba(0,0,0,0.6)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = `${g.neon}55`;
              e.currentTarget.style.boxShadow = `0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 20px ${g.neon}2e, 0 10px 28px rgba(0,0,0,0.5)`;
            }}
          >
            <div
              className="relative overflow-hidden"
              style={{ aspectRatio: '16 / 9', background: g.bg }}
            >
              <span
                aria-hidden
                className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]"
                style={{ background: `url(${g.thumb}) center/cover no-repeat` }}
              />
              <span
                aria-hidden
                className="absolute inset-0"
                style={{ background: 'linear-gradient(180deg, transparent 45%, rgba(0,0,0,0.72) 100%)' }}
              />
              <span
                aria-hidden
                className="absolute flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{
                  top: 10,
                  right: 10,
                  fontFamily: ARCADE_FONT,
                  fontSize: 9,
                  fontWeight: 700,
                  color: g.neon,
                  background: 'rgba(0,0,0,0.72)',
                  border: `1px solid ${g.neon}88`,
                  padding: '5px 9px',
                  borderRadius: 4,
                  letterSpacing: '0.18em',
                  textShadow: `0 0 8px ${g.neon}aa`,
                }}
              >
                PLAY ▸
              </span>
              <span className="absolute inset-x-0 bottom-0" style={{ padding: 'clamp(12px, 2vw, 16px)' }}>
                <span
                  className="block"
                  style={{
                    fontSize: 'clamp(15px, 2vw, 17px)',
                    fontWeight: 800,
                    color: '#fff',
                    letterSpacing: '-0.01em',
                    textShadow: `0 0 12px ${g.neon}55`,
                    marginBottom: 3,
                  }}
                >
                  {g.title}
                </span>
                <span
                  className="block"
                  style={{
                    fontSize: 11.5,
                    color: '#94a3b8',
                    lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {g.tagline}
                </span>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
