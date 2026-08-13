'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/cmsPostsApi';

// "오늘의 이슈, 4가지 시선" 목록 — 화이트 "매거진 고급짐" 톤으로 전환
// (2026-08-13, 사용자 피드백). 원래 인스타그램 카드뉴스 원본 그대로의 다크
// 톤이었는데, 사이트 나머지(브리핑/딥다이브/인사이트 등)가 전부 흰 배경
// 매거진 톤이라 여기만 검은 배경이면 오히려 부자연스럽다는 지적 — 파란
// "lens" 배지만으로도 구분 신호는 충분하다고 판단해 톤을 맞췄다.
//
// 페이지네이션(2026-08-13) — 26건까지 쌓이면서 "그냥 쭉 나열"로는 스크롤이
// 너무 길어졌다("페이지네이션 1,2,3,4 이렇게 해야할듯" 피드백). 최신 1건은
// 히어로로 계속 크게 보여주고, 나머지를 숫자 페이지네이션으로 자른다
// (WebtoonListClient.tsx와 같은 패턴 — 다만 다크 대신 화이트 팔레트로).
//
// initialItems는 서버가 fetchLensPosts()로 미리 가져온 값 — 첫 페인트부터
// 실제 목록이 박힌다(SSR 원칙, page.tsx 참조).
const ACCENT = '#3b82f6';
const CARD_SHADOW = '0 1px 2px rgba(17,24,39,0.03), 0 3px 10px rgba(17,24,39,0.04)';
const CARD_BORDER = '1px solid rgba(0,0,0,0.06)';
const PAGE_SIZE = 8;

export function LensListClient({ initialItems }: { initialItems: CmsLens[] }) {
  const [items, setItems] = useState<CmsLens[]>(initialItems);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    fetchLensPosts().then((rows) => {
      if (!cancelled && rows.length > 0) setItems(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [latest, ...rest] = items;
  const totalPages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = rest.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="min-h-screen bg-white">
      <Link
        href="/"
        aria-label="AI LENS 로 돌아가기"
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
        ◀ AI LENS
      </Link>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(88px, 12vw, 120px) clamp(20px, 5vw, 32px) 100px' }}>
        <header style={{ marginBottom: 40 }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: 11.5,
              fontWeight: 800,
              letterSpacing: '0.02em',
              color: '#fff',
              background: ACCENT,
              padding: '4px 10px',
              borderRadius: 4,
              marginBottom: 16,
            }}
          >
            lens
          </span>
          <h1 style={{ color: '#111827', fontSize: 'clamp(26px, 5.5vw, 34px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 10, lineHeight: 1.25 }}>
            오늘의 이슈, 4가지 시선
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
            하루 하나의 이슈를 원인이 궁금한 사람, 사람이 먼저 보이는 사람, 내 일이 걱정되는 사람, 숫자부터 찾는 사람 — 네 갈래로 짚어드려요.
          </p>
        </header>

        {items.length === 0 && (
          <div style={{ padding: '80px 20px', textAlign: 'center', background: '#f9fafb', borderRadius: 16, border: CARD_BORDER }}>
            <p style={{ fontSize: 14, color: '#9ca3af' }}>아직 발행된 이슈가 없어요.</p>
          </div>
        )}

        {latest && (
          <Link
            href={`/lens/${encodeURIComponent(latest.id)}`}
            prefetch
            className="group relative block"
            style={{
              display: 'block',
              marginBottom: 36,
              borderRadius: 16,
              overflow: 'hidden',
              border: '1px solid rgba(59,130,246,0.35)',
              boxShadow: '0 1px 2px rgba(17,24,39,0.06), 0 14px 40px rgba(17,24,39,0.1)',
              textDecoration: 'none',
              background: '#fff',
            }}
          >
            <div className="relative overflow-hidden" style={{ aspectRatio: '4 / 3', background: '#f3f4f6' }}>
              {latest.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- 다른 CMS 카드 이미지와 같은 패턴(raw img, 원격 URL이라 next/image 불필요)
                <img
                  src={latest.cover_image_url}
                  alt={latest.headline}
                  className="w-full h-full transition-transform duration-500 group-hover:scale-[1.04]"
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full" style={{ fontSize: 13, color: '#9ca3af', fontWeight: 600 }}>
                  4가지 시선
                </div>
              )}
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: latest.cover_image_url
                    ? 'linear-gradient(180deg, rgba(17,24,39,0) 40%, rgba(17,24,39,0.78) 80%, rgba(17,24,39,0.94) 100%)'
                    : 'none',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  top: 16,
                  left: 16,
                  fontSize: 11.5,
                  fontWeight: 800,
                  color: '#fff',
                  background: ACCENT,
                  padding: '4px 10px',
                  borderRadius: 4,
                }}
              >
                오늘의 시선
              </span>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 'clamp(18px, 3.4vw, 26px)' }}>
                <p style={{ fontSize: 11, color: latest.cover_image_url ? 'rgba(255,255,255,0.7)' : '#9ca3af', marginBottom: 6, fontWeight: 600 }}>
                  {latest.date.replaceAll('-', '.')}
                </p>
                <h2
                  style={{
                    color: latest.cover_image_url ? '#fff' : '#111827',
                    fontSize: 'clamp(19px, 3.8vw, 24px)',
                    fontWeight: 800,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.32,
                    textShadow: latest.cover_image_url ? '0 2px 16px rgba(0,0,0,0.45)' : 'none',
                  }}
                >
                  {latest.headline}
                </h2>
              </div>
            </div>
          </Link>
        )}

        {rest.length > 0 && (
          <>
            <p style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: '#9ca3af', marginBottom: 12 }}>
              지난 이슈
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pageItems.map((l) => (
                <Link
                  key={l.id}
                  href={`/lens/${encodeURIComponent(l.id)}`}
                  prefetch
                  className="flex items-center transition-colors hover:bg-gray-50"
                  style={{
                    gap: 14,
                    padding: 12,
                    borderRadius: 12,
                    background: '#fff',
                    boxShadow: CARD_SHADOW,
                    border: CARD_BORDER,
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ width: 64, height: 64, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#f3f4f6' }}>
                    {l.cover_image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.cover_image_url} alt={l.headline} className="w-full h-full" style={{ objectFit: 'cover' }} />
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4, fontWeight: 600 }}>{l.date.replaceAll('-', '.')}</p>
                    <p
                      style={{
                        color: '#111827',
                        fontSize: 14.5,
                        fontWeight: 700,
                        lineHeight: 1.4,
                        letterSpacing: '-0.01em',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {l.headline}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center" style={{ gap: 6, marginTop: 28, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  aria-label="이전 페이지"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: CARD_BORDER,
                    background: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    color: currentPage === 1 ? '#d1d5db' : '#374151',
                    cursor: currentPage === 1 ? 'default' : 'pointer',
                  }}
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((n) => {
                  const active = n === currentPage;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPage(n)}
                      aria-current={active ? 'page' : undefined}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        border: active ? `1px solid ${ACCENT}` : CARD_BORDER,
                        background: active ? ACCENT : '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        color: active ? '#fff' : '#374151',
                        cursor: active ? 'default' : 'pointer',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  aria-label="다음 페이지"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: CARD_BORDER,
                    background: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    color: currentPage === totalPages ? '#d1d5db' : '#374151',
                    cursor: currentPage === totalPages ? 'default' : 'pointer',
                  }}
                >
                  ›
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
