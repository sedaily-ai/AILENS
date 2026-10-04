'use client';

import { ScrollReveal } from "@/shared/ui/effects/ScrollReveal";

// ── Hero ──────────────────────────────────────────────────────────
// ── 문제 제시 ──────────────────────────────────────────────────────
export function ProblemSection() {
  return (
    <section
      style={{
        padding: 'clamp(80px, 14vh, 140px) clamp(20px, 5vw, 32px)',
        maxWidth: 880,
        margin: '0 auto',
      }}
    >
      <ScrollReveal>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#94a3b8',
            letterSpacing: '0.22em',
            margin: '0 0 18px',
            textAlign: 'center',
            textTransform: 'uppercase',
          }}
        >
          Why
        </p>
      </ScrollReveal>
      <ScrollReveal delay={80}>
        <h2
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(26px, 4.6vw, 38px)',
            fontWeight: 700,
            lineHeight: 1.4,
            letterSpacing: '-0.02em',
            color: '#0f172a',
            textAlign: 'center',
            margin: 0,
          }}
        >
          같은 사건. 너무 많은 해석.
          <br />
          핵심만 짚어드릴게요.
        </h2>
      </ScrollReveal>
      <ScrollReveal delay={180}>
        <p
          className="br-desktop-only"
          style={{
            fontSize: 'clamp(15px, 2vw, 17px)',
            lineHeight: 1.85,
            color: '#475569',
            maxWidth: 620,
            margin: '32px auto 0',
            textAlign: 'center',
          }}
        >
          매일 쏟아지는 경제 뉴스, 다 챙겨 읽기엔 시간이 부족합니다.
          <br />
          AI LENS 는 그날 가장 중요한 사건을 골라 구조와 맥락까지 정리합니다.
          <br />
          매일 아침, 한 통이면 충분해요.
        </p>
      </ScrollReveal>
    </section>
  );
}
