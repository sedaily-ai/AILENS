'use client';

/**
 * /onboarding — AI LENS 서비스 소개 랜딩 페이지.
 *
 * 기존 5단계 질문형 onboarding (welcome/motivation/context/result/letter) 폐기.
 * 새로 about 톤 + 인터랙티브 스크롤 랜딩으로 교체.
 * 옛 steps/ data/ components/ 폴더는 미사용 확인 후 제거함.
 *
 * MBTI 4-페르소나 에디터 체계 폐지(2026-08-07) — 페르소나 소개·선택 섹션을
 * 걷어내고, 단일 편집팀(AI LENS)이 매일 한 통을 정리해 보낸다는 소개로
 * 교체했다. `todayLettersApi.ts` 의 DEFAULT_META 와 같은 톤.
 */
import Link from 'next/link';
import Image from 'next/image';
import { ScrollReveal } from '@/shared/ui/ScrollReveal';
import { NewsletterCTA } from '@/features/news-feed/components/NewsletterCTA';
import { useLatestLetters } from '@/shared/lib/useLatestLetters';
import { letterHref } from '@/shared/lib/letterHref';

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

export function OnboardingClient() {
  return (
    <div style={{ background: '#fff', color: '#111827', overflow: 'hidden' }}>
      <HeroSection />
      <ProblemSection />
      <HowItWorksSection />
      <SampleLetterSection />
      <NewsletterSection />
      <FooterSection />
    </div>
  );
}

// ── Hero ──────────────────────────────────────────────────────────
function HeroSection() {
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
            href="/"
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

// ── 문제 제시 ──────────────────────────────────────────────────────
function ProblemSection() {
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

// ── 작동 방식 ──────────────────────────────────────────────────────
function HowItWorksSection() {
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

// ── 샘플 letter (오늘의 한 통 미리보기) ───────────────────────────
function SampleLetterSection() {
  const { cards } = useLatestLetters();
  const sample = cards[0];
  const href = sample ? letterHref(sample.letterId) : '/';

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

// ── 뉴스레터 구독 ──────────────────────────────────────────────────
function NewsletterSection() {
  return (
    <section
      id="newsletter"
      style={{ padding: 'clamp(60px, 10vh, 100px) 0 clamp(80px, 12vh, 120px)' }}
    >
      <NewsletterCTA />
    </section>
  );
}

// ── 푸터 한 줄 + 메인 진입 ─────────────────────────────────────────
function FooterSection() {
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
