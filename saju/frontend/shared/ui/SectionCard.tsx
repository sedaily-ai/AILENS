'use client';

/**
 * SectionCard — 점신 결 흰 카드 (phase-04)
 *
 * 메인 랜딩에 인라인으로 있던 SectionCard 동일.
 * - 흰 배경 + rounded-[24px] + 부드러운 그림자
 * - 좌측 명조 ▎ 마크
 * - eyebrow (작은 회색 라벨) + title (명조 굵은 헤딩)
 */

import type { ReactNode } from 'react';
import { SAJU, SERIF } from './sajuTokens';

interface SectionCardProps {
  eyebrow: string;
  title: string;
  children: ReactNode;
  /** padding 조정 (default 5 = p-5) */
  padding?: number;
  /** 카드 mx (default 3) */
  marginX?: number;
}

export function SectionCard({
  eyebrow, title, children, padding = 5, marginX = 3,
}: SectionCardProps) {
  return (
    <section
      className={`relative z-10 mt-3 rounded-[24px] transition-shadow duration-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)]`}
      style={{
        background: SAJU.card,
        boxShadow: '0 1px 3px rgba(0,0,0,0.025)',
        margin: `0.75rem ${marginX * 0.25}rem 0`,
        padding: `${padding * 0.25}rem`,
      }}
    >
      <div className="mb-4 flex items-baseline gap-2">
        <span
          style={{
            fontFamily: SERIF,
            fontWeight: 700,
            color: SAJU.warmDeep,
            opacity: 0.55,
            fontSize: 13,
            letterSpacing: '-0.02em',
          }}
        >
          ▎
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold tracking-tight" style={{ color: SAJU.inkSub }}>
            {eyebrow}
          </p>
          <h3
            className="mt-1"
            style={{
              fontFamily: SERIF,
              fontWeight: 900,
              fontSize: 20,
              letterSpacing: '-0.02em',
              color: SAJU.ink,
            }}
          >
            {title}
          </h3>
        </div>
      </div>
      {children}
    </section>
  );
}
