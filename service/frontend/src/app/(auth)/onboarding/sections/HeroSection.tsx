'use client';

import { ScrollReveal } from "@/shared/ui/effects/ScrollReveal";
import Link from 'next/link';

// ── Hero ──────────────────────────────────────────────────────────
export function HeroSection() {
  return (
    <section
      style={{
        minHeight: 'min(720px, 92vh)',
        padding: 'clamp(80px, 14vh, 140px) clamp(20px, 5vw, 32px) clamp(40px, 8vh, 80px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        background:
          'radial-gradient(ellipse 60% 50% at 50% 0%, #f0f4ff 0%, transparent 70%), #fff',
      }}
    >
      <ScrollReveal>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 999,
            background: '#dbeafe',
            color: '#1d4ed8',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.14em',
            marginBottom: 28,
          }}
        >
          AI LENS · BETA
        </div>
      </ScrollReveal>
      <ScrollReveal delay={80}>
        <h1
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(36px, 7vw, 64px)',
            fontWeight: 700,
            lineHeight: 1.18,
            letterSpacing: '-0.03em',
            color: '#0f172a',
            margin: 0,
            maxWidth: 760,
          }}
        >
          복잡한 뉴스,
          <br />
          한 통으로 정리.
        </h1>
      </ScrollReveal>
      <ScrollReveal delay={160}>
        <p
          className="br-desktop-only"
          style={{
            fontSize: 'clamp(15px, 2.2vw, 18px)',
            lineHeight: 1.7,
            color: '#475569',
            marginTop: 24,
            maxWidth: 540,
          }}
        >
          매일 1면 경제 뉴스를 AI가 정리합니다.
          <br />
          핵심만 담은 한 통이 매일 아침 도착해요.
        </p>
      </ScrollReveal>
      <ScrollReveal delay={240}>
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 40,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <Link
            href="/start"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '14px 26px',
              background: '#0f172a',
              color: '#fff',
              borderRadius: 12,
              fontSize: 14.5,
              fontWeight: 700,
              textDecoration: 'none',
              transition: 'transform 0.12s, box-shadow 0.18s',
              boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            오늘의 한 통 보기 →
          </Link>
          <a
            href="#newsletter"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '14px 26px',
              background: '#fff',
              color: '#0f172a',
              borderRadius: 12,
              fontSize: 14.5,
              fontWeight: 700,
              textDecoration: 'none',
              border: '1px solid #e5e7eb',
              transition: 'all 0.18s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#0f172a')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
          >
            매일 받아보기
          </a>
        </div>
      </ScrollReveal>
      <ScrollReveal delay={400}>
        <div
          aria-hidden
          style={{
            marginTop: 64,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: '#cbd5e1',
            fontSize: 11,
            letterSpacing: '0.2em',
            animation: 'scrollHint 1.8s ease-in-out infinite',
          }}
        >
          SCROLL ↓
        </div>
      </ScrollReveal>
      <style>{`@keyframes scrollHint{0%,100%{transform:translateY(0);opacity:.5}50%{transform:translateY(6px);opacity:1}}`}</style>
    </section>
  );
}
