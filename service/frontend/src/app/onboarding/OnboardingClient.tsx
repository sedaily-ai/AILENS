'use client';

/**
 * /onboarding — AI LENS 서비스 소개 랜딩 페이지.
 *
 * 기존 5단계 질문형 onboarding (welcome/motivation/context/result/letter) 폐기.
 * 새로 about 톤 + 인터랙티브 스크롤 랜딩으로 교체.
 * 옛 steps/ data/ components/ 폴더는 미사용 확인 후 제거함.
 */
import Link from 'next/link';
import { useState } from 'react';
import { ScrollReveal } from '@/shared/ui/ScrollReveal';
import { NewsletterCTA } from '@/features/news-feed/components/NewsletterCTA';
import { useLatestLetters } from '@/shared/lib/useLatestLetters';
import { letterHref } from '@/shared/lib/letterHref';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';

const PERSONAS: {
  group: MbtiGroupId;
  name: string;
  archetype: string;
  tagline: string;
  avatar: string;
  accent: string;
  accentBg: string;
}[] = [
  {
    group: 'NT',
    name: '민철',
    archetype: '전략 분석가',
    tagline: '구조와 인과로 사건의 뼈대를 본다',
    avatar: '/editors/intj.webp',
    accent: '#7c3aed',
    accentBg: '#ede9fe',
  },
  {
    group: 'NF',
    name: '하은',
    archetype: '가치 탐색가',
    tagline: '숫자 뒤에 있는 사람의 이야기를 적는다',
    avatar: '/editors/infp.webp',
    accent: '#e11d48',
    accentBg: '#ffe4e6',
  },
  {
    group: 'ST',
    name: '준서',
    archetype: '실용 큐레이터',
    tagline: '오늘 챙겨야 할 것을 한 줄로 정리한다',
    avatar: '/editors/istj.webp',
    accent: '#059669',
    accentBg: '#d1fae5',
  },
  {
    group: 'SF',
    name: '소율',
    archetype: '공감 캐스터',
    tagline: '일상에 닿는 결을 가볍게 전한다',
    avatar: '/editors/esfp.webp',
    accent: '#d97706',
    accentBg: '#fef3c7',
  },
];

const STEPS = [
  {
    n: '01',
    title: '그날의 1면을 고릅니다',
    body: '데스킹 기준으로 그날 가장 중요한 경제 사건을 추립니다.',
  },
  {
    n: '02',
    title: 'AI 가 네 결로 다시 씁니다',
    body: '같은 사건을 분석·가치·실용·공감 네 시선으로 다시 풀어, 각 페르소나 에디터가 한 통씩 만듭니다.',
  },
  {
    n: '03',
    title: '결이 맞는 한 통이 메일함으로',
    body: '매일 아침, 당신이 고른 에디터의 한 통이 도착합니다. 메일에서 바로 읽고, 사이트에서 다른 결도 비교해보세요.',
  },
];

export function OnboardingClient() {
  return (
    <div style={{ background: '#fff', color: '#111827', overflow: 'hidden' }}>
      <HeroSection />
      <ProblemSection />
      <PersonasSection />
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
          같은 뉴스,
          <br />
          네 가지 시선.
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
          매일 1면 뉴스를 네 명의 AI 에디터에게 맡깁니다.
          <br />
          당신과 결이 맞는 에디터의 한 통이 매일 아침 도착해요.
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
          같은 사건. 너무 다른 해석.
          <br />
          어떤 결로 읽어야 할까요.
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
          매일 쏟아지는 경제 뉴스, 하나의 사건이 신문마다 다른 결로 해석됩니다.
          <br />
          AI LENS 는 그 차이를 숨기지 않고 네 가지 시선으로 펼쳐 보여드립니다.
          <br />
          당신의 결에 가장 가까운 한 통부터 시작하세요.
        </p>
      </ScrollReveal>
    </section>
  );
}

// ── 4 페르소나 ─────────────────────────────────────────────────────
function PersonasSection() {
  return (
    <section
      style={{
        padding: 'clamp(60px, 10vh, 100px) clamp(20px, 5vw, 32px)',
        maxWidth: 1080,
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
          Editors
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
          네 명의 에디터, 네 가지 결
        </h2>
      </ScrollReveal>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 18,
        }}
      >
        {PERSONAS.map((p, i) => (
          <ScrollReveal key={p.group} delay={i * 80}>
            <article
              style={{
                background: '#fff',
                border: '1px solid #f1f5f9',
                borderRadius: 20,
                padding: '28px 24px',
                textAlign: 'center',
                transition: 'transform 0.22s, box-shadow 0.22s, border-color 0.22s',
                cursor: 'default',
                height: '100%',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = `0 16px 40px ${p.accent}22`;
                e.currentTarget.style.borderColor = `${p.accent}55`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = '#f1f5f9';
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.avatar}
                alt=""
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  background: p.accentBg,
                  margin: '0 auto 18px',
                  boxShadow: `0 0 0 3px ${p.accentBg}, 0 0 0 4px ${p.accent}33`,
                }}
              />
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: p.accent,
                  letterSpacing: '0.16em',
                  margin: '0 0 6px',
                  textTransform: 'uppercase',
                }}
              >
                {p.group}
              </p>
              <p
                style={{
                  fontFamily: '"Noto Serif KR", serif',
                  fontSize: 20,
                  fontWeight: 700,
                  color: '#0f172a',
                  margin: '0 0 4px',
                }}
              >
                {p.name}
              </p>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 14px', fontWeight: 600 }}>
                {p.archetype}
              </p>
              <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.6, margin: 0 }}>
                {p.tagline}
              </p>
            </article>
          </ScrollReveal>
        ))}
      </div>
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

// ── 샘플 letter (인터랙티브 — 페르소나 토글로 미리보기) ───────────
function SampleLetterSection() {
  const [active, setActive] = useState<MbtiGroupId>('NF');
  const { letters, date } = useLatestLetters();
  const sample = letters.find((l) => l.mbti_group === active);
  const persona = PERSONAS.find((p) => p.group === active)!;
  const href = sample && date ? letterHref(`${active.toLowerCase()}-${date}`) : '/';

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
          페르소나를 골라 한 통을 미리보세요
        </h2>
      </ScrollReveal>
      <ScrollReveal delay={140}>
        <div
          role="tablist"
          aria-label="에디터 선택"
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 6,
            marginBottom: 28,
            flexWrap: 'wrap',
          }}
        >
          {PERSONAS.map((p) => {
            const on = p.group === active;
            return (
              <button
                key={p.group}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActive(p.group)}
                style={{
                  background: on ? p.accent : '#fff',
                  color: on ? '#fff' : '#475569',
                  border: `1px solid ${on ? p.accent : '#e5e7eb'}`,
                  padding: '10px 18px',
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: on ? 700 : 600,
                  cursor: 'pointer',
                  transition: 'all 0.18s',
                }}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </ScrollReveal>
      {sample && (
        <ScrollReveal delay={200}>
          <article
            key={active}
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={persona.avatar}
                alt=""
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  background: persona.accentBg,
                }}
              />
              <div>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  {persona.name}
                </p>
                <p
                  style={{
                    fontSize: 11.5,
                    color: persona.accent,
                    fontWeight: 600,
                    margin: 0,
                  }}
                >
                  {persona.archetype}
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
                {(date ?? '').replace(/-/g, '.')} 발행
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
              {sample.headline}
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
              {sample.body[0] ?? ''}
            </p>
            <Link
              href={href}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 13.5,
                fontWeight: 700,
                color: persona.accent,
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
