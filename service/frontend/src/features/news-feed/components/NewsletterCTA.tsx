'use client';

/**
 * 메인 피드 하단 — 뉴스레터 구독 CTA.
 * 단일 명의(AI LENS) 체계(2026-08-07) 이후로는 구독할 에디터를 고르는 개념이
 * 없다 — 매일 아침 발행되는 한 통을 그대로 구독한다. 샘플 미리보기 토글 +
 * 이메일 입력만 남긴다.
 */
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { NewsletterEmailField, type SubscribeLetterPayload } from '@/shared/ui/NewsletterEmailField';
import { useLatestLetters } from '@/shared/hooks/useLatestLetters';
import { letterHref } from '@/shared/lib/letterHref';

export function NewsletterCTA() {
  const { cards, date } = useLatestLetters();
  const [showSample, setShowSample] = useState(false);

  // 샘플 레터 — 가장 최근 발행분 한 통.
  const sampleLetter = cards[0] ?? null;

  // 구독 즉시 발송할 letter payload — 최신 발행분 한 통. 백엔드가
  // letter.headline 있으면 SES 로 즉시 발송.
  const letterPayload: SubscribeLetterPayload | null = sampleLetter
    ? {
        editor_name: sampleLetter.editorName,
        editor_role: sampleLetter.editorRole,
        accent: sampleLetter.accent,
        headline: sampleLetter.title,
        subtitle: sampleLetter.subtitle,
        body: sampleLetter.excerpt ? [sampleLetter.excerpt] : [],
        key_points: [],
        closing_line: null,
      }
    : null;

  return (
    <section
      aria-labelledby="newsletter-cta-title"
      style={{
        maxWidth: 560,
        margin: '40px auto 0',
        padding: '24px 4px 0',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <p
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: '#9ca3af',
            letterSpacing: '0.2em',
            margin: '0 0 6px',
            textTransform: 'uppercase',
          }}
        >
          Newsletter
        </p>
        <h2
          id="newsletter-cta-title"
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 18,
            fontWeight: 700,
            color: '#111827',
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          매일 아침, 한 통씩 메일함으로
        </h2>
      </div>

      {/* 샘플 보기 토글 — 카드와 입력 사이의 작은 링크 */}
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setShowSample((v) => !v)}
          aria-expanded={showSample}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: 12.5,
            color: '#6b7280',
            fontWeight: 500,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#111827')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
        >
          {showSample ? '샘플 접기 ↑' : '샘플 한 통 미리보기 ↓'}
        </button>
      </div>

      {/* 샘플 레터 인라인 미리보기 */}
      {showSample && sampleLetter && (
        <article
          style={{
            marginBottom: 16,
            padding: '16px 18px 14px',
            background: '#fafafa',
            borderRadius: 12,
            animation: 'sample-in 0.18s ease-out',
          }}
        >
          <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Image
              src={sampleLetter.editorAvatar}
              alt=""
              width={24}
              height={24}
              style={{
                borderRadius: '50%',
                objectFit: 'cover',
                background: '#f3f4f6',
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>
              {sampleLetter.editorName}
            </span>
            {/* 역할 라벨("팀이 함께 정리했어요") 제거(2026-08-09) — 다른 카드
                섹션들과 동일하게, 이름 옆 부가 라벨 없이 이름만. */}
            <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
              {(date ?? '').replace(/-/g, '.')} 발행
            </span>
          </header>
          <h3
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 16,
              fontWeight: 700,
              color: '#111827',
              lineHeight: 1.45,
              letterSpacing: '-0.01em',
              margin: '0 0 6px',
            }}
          >
            {sampleLetter.title}
          </h3>
          {sampleLetter.subtitle && (
            <p
              style={{
                fontSize: 13,
                color: '#6b7280',
                lineHeight: 1.65,
                margin: '0 0 10px',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {sampleLetter.subtitle}
            </p>
          )}
          <p
            style={{
              fontFamily: '"Noto Serif KR", serif',
              fontSize: 13.5,
              color: '#4b5563',
              lineHeight: 1.8,
              margin: '0 0 12px',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {sampleLetter.excerpt}
          </p>
          <Link
            href={letterHref(sampleLetter.letterId)}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: sampleLetter.accent,
              textDecoration: 'none',
              letterSpacing: '-0.005em',
            }}
          >
            전체 보기 →
          </Link>
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 10, lineHeight: 1.6 }}>
            매일 아침 이 형식으로 도착해요.
          </p>
        </article>
      )}

      <NewsletterEmailField letter={letterPayload} />

      <style>{`@keyframes sample-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </section>
  );
}
