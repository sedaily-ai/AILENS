'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchLensBySlug, type CmsLens } from '@/shared/lib/cmsPostsApi';

// "오늘의 이슈, 4가지 시선" 상세 — 화이트 "매거진 고급짐" 톤으로 전환
// (2026-08-13, 사용자 피드백). 커버 → 핵심요약 → 시선 ①~④(고정 라벨 +
// 파란 Q 배지 + 불릿) → 클로징, 카드뉴스 슬라이드 순서는 그대로 유지 —
// 색만 다크(#1c1c1e)에서 화이트로. 목록·홈 티저와 톤을 맞춰야 클릭해
// 들어왔을 때 갑자기 다른 사이트처럼 느껴지지 않는다.
//
// initialLens는 서버가 findLens()로 이미 찾은 값 — 첫 페인트부터 실제
// 내용이 박힌다(webtoon/[slug]/WebtoonViewClient.tsx와 같은 SSR 원칙).
const SURFACE = '#fff';
const CARD_BORDER = '1px solid rgba(0,0,0,0.06)';
const CARD_SHADOW = '0 1px 2px rgba(17,24,39,0.03), 0 3px 10px rgba(17,24,39,0.04)';
const ACCENT = '#3b82f6';

export function LensViewClient({
  slug,
  initialLens = undefined,
}: {
  slug: string;
  initialLens?: CmsLens | null;
}) {
  const [lens, setLens] = useState<CmsLens | null | undefined>(initialLens);

  useEffect(() => {
    if (!slug || initialLens) return; // 서버에서 이미 찾았으면 재조회 불필요.
    let cancelled = false;
    fetchLensBySlug(slug).then((l) => {
      if (!cancelled) setLens(l);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, initialLens]);

  if (!slug || lens === null) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-[680px] px-5 py-20 text-center" style={{ color: '#6b7280' }}>
          <p>이슈를 찾을 수 없어요.</p>
          <Link href="/lens" className="mt-4 inline-block text-sm underline underline-offset-4" style={{ color: '#6b7280' }}>
            시선 목록으로
          </Link>
        </div>
      </div>
    );
  }

  if (!lens) {
    return <div className="min-h-screen bg-white" />;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <Link
        href="/lens"
        aria-label="시선 목록으로"
        className="inline-flex items-center"
        style={{
          position: 'fixed',
          top: 20,
          left: 20,
          zIndex: 60,
          gap: 8,
          padding: '10px 16px',
          background: 'rgba(255,255,255,0.85)',
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: 999,
          color: '#111827',
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textDecoration: 'none',
          backdropFilter: 'blur(6px)',
          boxShadow: '0 2px 10px rgba(17,24,39,0.08)',
        }}
      >
        ◀ 시선
      </Link>

      {/* 커버 — 사진 배경 + lens 태그 + 헤드라인 + 날짜. 이미지 하단이 흰
          본문 영역으로 자연스럽게 이어지도록 그라데이션이 #fff로 끝난다. */}
      <div style={{ position: 'relative', width: '100%', minHeight: '58vh', overflow: 'hidden', background: '#f3f4f6' }}>
        {lens.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- 원격 CMS 이미지, 다른 CmsPost 카드와 같은 패턴
          <img
            src={lens.cover_image_url}
            alt={lens.headline}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: lens.cover_image_url
              ? 'linear-gradient(180deg, rgba(17,24,39,0.1) 0%, rgba(17,24,39,0.4) 55%, #fff 98%)'
              : 'none',
          }}
        />
        <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto', padding: 'clamp(96px, 16vw, 140px) clamp(20px, 5vw, 32px) clamp(28px, 5vw, 40px)' }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: 12,
              fontWeight: 800,
              color: '#fff',
              background: ACCENT,
              padding: '4px 11px',
              borderRadius: 4,
              marginBottom: 18,
            }}
          >
            lens
          </span>
          <h1
            style={{
              color: lens.cover_image_url ? '#fff' : '#111827',
              fontSize: 'clamp(26px, 6vw, 40px)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1.28,
              marginBottom: 14,
              textShadow: lens.cover_image_url ? '0 2px 20px rgba(0,0,0,0.45)' : 'none',
            }}
          >
            {lens.headline}
          </h1>
          <p style={{ fontSize: 13, color: lens.cover_image_url ? 'rgba(255,255,255,0.85)' : '#6b7280', fontWeight: 600 }}>
            {lens.date.replaceAll('-', '.')}
          </p>
        </div>
      </div>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '0 clamp(20px, 5vw, 32px) 100px' }}>
        {/* 핵심요약 */}
        {lens.context && (
          <section style={{ background: SURFACE, borderRadius: 16, padding: 'clamp(22px, 4vw, 30px)', marginBottom: 20, boxShadow: CARD_SHADOW, border: CARD_BORDER }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 12 }}>핵심요약</p>
            <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', marginBottom: 18 }} />
            <p style={{ fontSize: 15.5, lineHeight: 1.75, color: '#374151', whiteSpace: 'pre-line' }}>{lens.context}</p>
          </section>
        )}

        {/* 시선 ①~④ */}
        {lens.lenses.map((l, i) => (
          <section
            key={i}
            style={{ background: SURFACE, borderRadius: 16, padding: 'clamp(22px, 4vw, 30px)', marginBottom: 20, boxShadow: CARD_SHADOW, border: CARD_BORDER }}
          >
            <p style={{ fontSize: 17, fontWeight: 800, color: '#111827', marginBottom: 12, letterSpacing: '-0.01em' }}>{l.label}</p>
            <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', marginBottom: 20 }} />
            {l.question && (
              <div className="flex items-start" style={{ gap: 10, marginBottom: 20 }}>
                <span
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: ACCENT,
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  Q
                </span>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#111827', lineHeight: 1.5 }}>&ldquo;{l.question}&rdquo;</p>
              </div>
            )}
            {l.bullets.length > 0 && (
              <ol style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {l.bullets.map((b, bi) => (
                  <li key={bi} style={{ display: 'flex', gap: 8, fontSize: 14.5, lineHeight: 1.65, color: '#4b5563' }}>
                    <span style={{ color: '#9ca3af', flexShrink: 0 }}>{bi + 1})</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}

        {/* 클로징 — 브랜드 스테이트먼트 + 인스타 연결(원본 출처). */}
        <section style={{ textAlign: 'center', padding: 'clamp(40px, 6vw, 56px) 0 8px' }}>
          <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', marginBottom: 32 }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 6, lineHeight: 1.5 }}>
            일상 속의 모든 소식, 신속하고 정확한 전달
          </p>
          <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 24 }}>통찰력 있는 이야기 · 인스타그램 @ailens</p>
          <Link
            href="/lens"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12.5,
              fontWeight: 700,
              color: ACCENT,
              textDecoration: 'none',
            }}
          >
            다른 시선 보기 →
          </Link>
        </section>
      </main>
    </div>
  );
}
