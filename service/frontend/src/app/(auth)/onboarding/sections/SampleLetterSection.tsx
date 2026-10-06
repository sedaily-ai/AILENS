'use client';

import Image from 'next/image';
import { useLatestLetters } from "@/shared/hooks/useLatestLetters";
import { ScrollReveal } from "@/shared/ui/effects/ScrollReveal";
import Link from 'next/link';

// ── Hero ──────────────────────────────────────────────────────────
// ── 문제 제시 ──────────────────────────────────────────────────────
// ── 작동 방식 ──────────────────────────────────────────────────────
// ── 샘플 letter (오늘의 한 통 미리보기) ───────────────────────────
export function SampleLetterSection() {
  const { cards } = useLatestLetters();
  const sample = cards[0];
  const href = sample ? sample.href : '/';

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
          Sample
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
            margin: '0 0 28px',
          }}
        >
          오늘의 한 통을 미리보세요
        </h2>
      </ScrollReveal>
      {sample && (
        <ScrollReveal delay={200}>
          <article
            style={{
              background: '#fff',
              border: '1px solid #f1f5f9',
              borderRadius: 20,
              padding: 'clamp(28px, 5vw, 44px) clamp(24px, 5vw, 40px)',
              boxShadow: '0 12px 40px rgba(15,23,42,0.06)',
              animation: 'sampleFade 0.32s ease-out',
            }}
          >
            <header
              style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}
            >
              <Image
                src={sample.editorAvatar}
                alt=""
                width={36}
                height={36}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  background: sample.accentBg,
                }}
              />
              <div>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  {sample.editorName}
                </p>
                <p
                  style={{
                    fontSize: 11.5,
                    color: sample.accent,
                    fontWeight: 600,
                    margin: 0,
                  }}
                >
                  {sample.editorRole}
                </p>
              </div>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  color: '#94a3b8',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {sample.dateLabel} 발행
              </span>
            </header>
            <h3
              style={{
                fontFamily: '"Noto Serif KR", serif',
                fontSize: 'clamp(20px, 3.5vw, 26px)',
                fontWeight: 700,
                lineHeight: 1.4,
                letterSpacing: '-0.02em',
                color: '#0f172a',
                margin: '0 0 14px',
              }}
            >
              {sample.title}
            </h3>
            {sample.subtitle && (
              <p
                style={{
                  fontSize: 14.5,
                  color: '#475569',
                  lineHeight: 1.75,
                  margin: '0 0 18px',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {sample.subtitle}
              </p>
            )}
            <p
              style={{
                fontFamily: '"Noto Serif KR", serif',
                fontSize: 14.5,
                color: '#374151',
                lineHeight: 1.95,
                margin: '0 0 22px',
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {sample.excerpt}
            </p>
            <Link
              href={href}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 13.5,
                fontWeight: 700,
                color: sample.accent,
                textDecoration: 'none',
              }}
            >
              전체 보기 →
            </Link>
          </article>
        </ScrollReveal>
      )}
      <style>{`@keyframes sampleFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </section>
  );
}
