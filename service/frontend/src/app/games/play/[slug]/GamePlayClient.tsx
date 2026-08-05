'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { trackEvent } from '@/shared/lib/trackEvent';

interface Props {
  slug: string;
  title: string;
  src: string;
}

const ARCADE_FONT = '"Press Start 2P", "Courier New", monospace';

export default function GamePlayClient({ slug, title, src }: Props) {
  useEffect(() => {
    trackEvent('game_play_open', { game: slug });
  }, [slug]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 뒤로가기 — 작은 floating 버튼, 게임 위에 띄움. 풀스크린 게임 방해 최소화. */}
      <Link
        href="/games"
        aria-label="게임 목록으로 돌아가기"
        style={{
          position: 'fixed',
          top: 14,
          left: 14,
          zIndex: 60,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          background: 'rgba(0,0,0,0.75)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 999,
          fontFamily: ARCADE_FONT,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textDecoration: 'none',
          backdropFilter: 'blur(6px)',
          transition: 'all 0.18s',
          WebkitTapHighlightColor: 'transparent',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0,0,0,0.95)';
          e.currentTarget.style.borderColor = '#fbbf24';
          e.currentTarget.style.color = '#fbbf24';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(0,0,0,0.75)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
          e.currentTarget.style.color = '#fff';
        }}
      >
        ◀ BACK
      </Link>

      {/* 게임 iframe — 전체 viewport 풀스크린 */}
      <iframe
        src={src}
        title={title}
        style={{
          flex: 1,
          width: '100%',
          height: '100%',
          border: 'none',
          background: '#000',
          display: 'block',
        }}
        allow="autoplay; fullscreen; gamepad"
      />
    </div>
  );
}
