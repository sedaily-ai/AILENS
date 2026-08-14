'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/cmsPostsApi';

// "오늘의 이슈, 4가지 시선" 홈 티저 — 화이트 "매거진 고급짐" 톤으로 전환
// (2026-08-13, 사용자 피드백 "화이트 모던 톤으로 하면 어떨려나"). 원래는
// 다른 홈 섹션과 의도적으로 다른 다크 카드뉴스 톤이었는데("여긴 다른
// 콘텐츠"라는 신호), 커버 이미지가 없는 글은 그냥 검은 배경만 남아 휑해
// 보이는 문제가 실제로 있었다. 나머지 홈 섹션(TrendingEconomySection 등)과
// 같은 흰 카드 톤으로 맞추고, 대신 파란 액센트 배지로만 구분 신호를 낸다.
//
// "여러 개 미리보기 가능하게" 요청(같은 피드백)으로 최신 1건 고정 노출 대신
// 최근 N건을 화살표로 넘겨보는 캐러셀을 추가했다 — WordsPreviewSection의
// 퀴즈 캐러셀과 같은 구조(화살표+N/M+점 인디케이터), 색만 lens 파란 액센트로.
const CARD = {
  display: 'block',
  borderRadius: 16,
  overflow: 'hidden',
  background: '#fff',
  boxShadow: '0 1px 2px rgba(17,24,39,0.06), 0 14px 40px rgba(17,24,39,0.1)',
  border: '1px solid rgba(0,0,0,0.06)',
  textDecoration: 'none',
} as const;
const ACCENT = '#3b82f6';
const MAX_PREVIEW = 5;

export function LensPreviewSection({ initialItems }: { initialItems?: CmsLens[] }) {
  const [items, setItems] = useState<CmsLens[] | null>(initialItems ?? null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchLensPosts().then((data) => {
      if (!cancelled) setItems(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items || items.length === 0) return null;
  const preview = items.slice(0, MAX_PREVIEW);
  const total = preview.length;
  const safeIndex = Math.min(index, total - 1);
  const current = preview[safeIndex];

  return (
    <section style={{ padding: 'clamp(28px, 4vw, 40px) 0 0' }}>
      <style>{`
        .lens-arrow { transition: background 0.15s ease, transform 0.08s ease; }
        .lens-arrow:not(:disabled):hover { background: #dbeafe; }
        .lens-arrow:not(:disabled):active { transform: scale(0.9); }
        .lens-dot { transition: background 0.15s ease, width 0.15s ease; }
      `}</style>

      <header style={{ marginBottom: 14 }}>
        <p
          className="text-gray-400"
          style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}
        >
          4가지 시선
        </p>
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <h2 className="text-gray-900" style={{ fontSize: 'clamp(20px, 4.4vw, 24px)', fontWeight: 800, letterSpacing: '-0.02em' }}>
            오늘의 이슈, 4가지 시선
          </h2>
          <Link
            href="/lens"
            className="flex-shrink-0 text-gray-400 hover:text-gray-900 transition-colors"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            전체 보기 →
          </Link>
        </div>
      </header>

      <Link href={`/lens/${encodeURIComponent(current.id)}`} prefetch className="group relative" style={CARD}>
        <div className="relative overflow-hidden" style={{ aspectRatio: '16 / 9', background: '#f3f4f6' }}>
          <Image
            src={current.cover_image_url || '/lens/default-cover.webp'}
            alt={current.headline}
            fill
            sizes="(min-width: 768px) 640px, 100vw"
            priority
            className="transition-transform duration-500 group-hover:scale-[1.03]"
            style={{ objectFit: 'cover' }}
          />
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(17,24,39,0) 35%, rgba(17,24,39,0.72) 75%, rgba(17,24,39,0.92) 100%)',
            }}
          />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 'clamp(20px, 4vw, 32px)' }}>
            <span
              style={{
                display: 'inline-block',
                fontSize: 11,
                fontWeight: 800,
                color: '#fff',
                background: ACCENT,
                padding: '3px 9px',
                borderRadius: 4,
                marginBottom: 12,
              }}
            >
              4가지 시선
            </span>
            <h3
              style={{
                color: '#fff',
                fontSize: 'clamp(19px, 3.8vw, 25px)',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                lineHeight: 1.32,
                marginBottom: 10,
                textShadow: '0 2px 16px rgba(0,0,0,0.5)',
              }}
            >
              {current.headline}
            </h3>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#93c5fd' }}>
              원인·사람·내 일·숫자, 네 갈래로 보기 →
            </span>
          </div>
        </div>
      </Link>

      {total > 1 && (
        <div className="flex items-center justify-center" style={{ gap: 10, marginTop: 14 }}>
          <button
            type="button"
            aria-label="이전 이슈"
            disabled={safeIndex === 0}
            onClick={(e) => {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            }}
            className="lens-arrow flex items-center justify-center flex-shrink-0"
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: ACCENT,
              cursor: safeIndex === 0 ? 'default' : 'pointer',
              opacity: safeIndex === 0 ? 0.3 : 1,
              pointerEvents: safeIndex === 0 ? 'none' : 'auto',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>

          <span style={{ fontSize: 11.5, fontWeight: 700, color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
            {safeIndex + 1}/{total}
          </span>

          <div className="flex items-center" style={{ gap: 6 }}>
            {preview.map((p, i) => (
              <button
                key={p.id}
                type="button"
                aria-label={`${i + 1}번째 이슈로 이동`}
                onClick={() => setIndex(i)}
                className="lens-dot"
                style={{
                  width: i === safeIndex ? 18 : 6,
                  height: 6,
                  borderRadius: 999,
                  border: 'none',
                  background: i === safeIndex ? ACCENT : '#dbeafe',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>

          <button
            type="button"
            aria-label="다음 이슈"
            disabled={safeIndex === total - 1}
            onClick={(e) => {
              e.preventDefault();
              setIndex((i) => Math.min(total - 1, i + 1));
            }}
            className="lens-arrow flex items-center justify-center flex-shrink-0"
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: ACCENT,
              cursor: safeIndex === total - 1 ? 'default' : 'pointer',
              opacity: safeIndex === total - 1 ? 0.3 : 1,
              pointerEvents: safeIndex === total - 1 ? 'none' : 'auto',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}
