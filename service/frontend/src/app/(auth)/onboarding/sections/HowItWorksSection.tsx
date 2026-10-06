'use client';

import { ScrollReveal } from "@/shared/ui/effects/ScrollReveal";

const STEPS = [
  {
    n: '01',
    title: '그날의 1면을 고릅니다',
    body: '데스킹 기준으로 그날 가장 중요한 경제 사건을 추립니다.',
  },
  {
    n: '02',
    title: 'AI 가 핵심만 정리합니다',
    body: '복잡한 사건을 구조·맥락·숫자까지 짚어가며 하나의 글로 다시 풉니다.',
  },
  {
    n: '03',
    title: '한 통이 메일함으로',
    body: '매일 아침, 정리된 한 통이 도착합니다. 메일에서 바로 읽고, 사이트에서 더 깊이 살펴보세요.',
  },
];

// ── Hero ──────────────────────────────────────────────────────────
// ── 문제 제시 ──────────────────────────────────────────────────────
// ── 작동 방식 ──────────────────────────────────────────────────────
export function HowItWorksSection() {
  return (
    <section
      style={{
        padding: 'clamp(80px, 14vh, 140px) clamp(20px, 5vw, 32px)',
        background: '#f8fafc',
      }}
    >
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
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
            How it works
          </p>
        </ScrollReveal>
        <ScrollReveal delay={80}>
          <h2
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 'clamp(26px, 4.6vw, 38px)',
              fontWeight: 700,
              lineHeight: 1.35,
              letterSpacing: '-0.02em',
              color: '#0f172a',
              textAlign: 'center',
              margin: '0 0 56px',
            }}
          >
            한 통이 도착하기까지
          </h2>
        </ScrollReveal>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 24,
          }}
        >
          {STEPS.map((s, i) => (
            <ScrollReveal key={s.n} delay={i * 100}>
              <div
                style={{
                  background: '#fff',
                  borderRadius: 20,
                  padding: '28px 26px',
                  height: '100%',
                  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                }}
              >
                <p
                  style={{
                    fontFamily: '"Noto Serif KR", serif',
                    fontSize: 40,
                    fontWeight: 300,
                    color: '#3182F6',
                    lineHeight: 1,
                    margin: '0 0 16px',
                    letterSpacing: '-0.04em',
                  }}
                >
                  {s.n}
                </p>
                <h3
                  style={{
                    fontFamily: '"Noto Serif KR", serif',
                    fontSize: 19,
                    fontWeight: 700,
                    color: '#0f172a',
                    margin: '0 0 12px',
                    lineHeight: 1.45,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {s.title}
                </h3>
                <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.75, margin: 0 }}>
                  {s.body}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
