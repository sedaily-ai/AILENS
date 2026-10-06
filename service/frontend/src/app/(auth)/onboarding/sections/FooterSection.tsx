'use client';

import { ScrollReveal } from "@/shared/ui/effects/ScrollReveal";
import Link from 'next/link';

// ── Hero ──────────────────────────────────────────────────────────
// ── 문제 제시 ──────────────────────────────────────────────────────
// ── 작동 방식 ──────────────────────────────────────────────────────
// ── 샘플 letter (오늘의 한 통 미리보기) ───────────────────────────
// ── 뉴스레터 구독 ──────────────────────────────────────────────────
// ── 푸터 한 줄 + 메인 진입 ─────────────────────────────────────────
export function FooterSection() {
  return (
    <section
      style={{
        padding: 'clamp(60px, 10vh, 100px) clamp(20px, 5vw, 32px)',
        textAlign: 'center',
        background: '#0f172a',
        color: '#e2e8f0',
      }}
    >
      <ScrollReveal>
        <p
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(20px, 3.6vw, 28px)',
            fontWeight: 600,
            lineHeight: 1.5,
            letterSpacing: '-0.015em',
            margin: 0,
            color: '#fff',
          }}
        >
          같은 뉴스가, 더 깊은 한 통이 됩니다.
        </p>
      </ScrollReveal>
      <ScrollReveal delay={100}>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 32,
            padding: '14px 28px',
            background: '#fff',
            color: '#0f172a',
            borderRadius: 12,
            fontSize: 14.5,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          오늘의 한 통 보러가기 →
        </Link>
      </ScrollReveal>
      <p style={{ marginTop: 40, fontSize: 11.5, color: '#64748b' }}>
        © {new Date().getFullYear()} AI LENS
      </p>
    </section>
  );
}
