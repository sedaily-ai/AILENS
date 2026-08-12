'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/cmsPostsApi';

// "오늘의 이슈, 4가지 시선"(2026-08-12) — Instagram @ailens 카드뉴스 톤을
// 그대로 웹으로. 다른 목록 페이지(밝은 배경 + 공용 Header)와 의도적으로
// 다른 느낌을 준다 — 차콜 배경, 굵은 흰 산세리프, 파란 원형 배지. /webtoon의
// "탭에 들어오면 다른 공간처럼" 기법과 같은 방향이지만, 웹툰의 네온 만화방
// 톤 대신 인스타그램 원본 그대로의 절제된 에디토리얼 톤을 따른다.
//
// initialItems는 서버가 fetchLensPosts()로 미리 가져온 값 — 첫 페인트부터
// 실제 목록이 박힌다(SSR 원칙, page.tsx 참조).
const BG = '#1c1c1e';
const SURFACE = '#242426';
const ACCENT = '#3b82f6';

export function LensListClient({ initialItems }: { initialItems: CmsLens[] }) {
  const [items, setItems] = useState<CmsLens[]>(initialItems);

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

  return (
    <div className="min-h-screen" style={{ background: BG }}>
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
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 999,
          color: '#fff',
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textDecoration: 'none',
          backdropFilter: 'blur(6px)',
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
          <h1 style={{ color: '#fff', fontSize: 'clamp(26px, 5.5vw, 34px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 10, lineHeight: 1.25 }}>
            오늘의 이슈, 4가지 시선
          </h1>
          <p style={{ fontSize: 14, color: '#a1a1aa', lineHeight: 1.6 }}>
            하루 하나의 이슈를 원인이 궁금한 사람, 사람이 먼저 보이는 사람, 내 일이 걱정되는 사람, 숫자부터 찾는 사람 — 네 갈래로 짚어드려요.
          </p>
        </header>

        {items.length === 0 && (
          <div style={{ padding: '80px 20px', textAlign: 'center', background: SURFACE, borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ fontSize: 14, color: '#a1a1aa' }}>아직 발행된 이슈가 없어요.</p>
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
              border: '1px solid rgba(59,130,246,0.4)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              textDecoration: 'none',
              background: SURFACE,
            }}
          >
            <div className="relative overflow-hidden" style={{ aspectRatio: '4 / 3', background: '#111114' }}>
              {latest.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- 다른 CMS 카드 이미지와 같은 패턴(raw img, 원격 URL이라 next/image 불필요)
                <img
                  src={latest.cover_image_url}
                  alt={latest.headline}
                  className="w-full h-full transition-transform duration-500 group-hover:scale-[1.04]"
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full" style={{ fontSize: 13, color: '#71717a' }}>
                  준비 중
                </div>
              )}
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(28,28,30,0) 40%, rgba(28,28,30,0.85) 80%, rgba(28,28,30,0.98) 100%)',
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
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 6, fontWeight: 600 }}>
                  {latest.date.replaceAll('-', '.')}
                </p>
                <h2
                  style={{
                    color: '#fff',
                    fontSize: 'clamp(19px, 3.8vw, 24px)',
                    fontWeight: 800,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.32,
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
            <p style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: '#52525b', marginBottom: 12 }}>
              지난 이슈
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rest.map((l) => (
                <Link
                  key={l.id}
                  href={`/lens/${encodeURIComponent(l.id)}`}
                  prefetch
                  className="flex items-center transition-colors"
                  style={{
                    gap: 14,
                    padding: 12,
                    borderRadius: 12,
                    background: SURFACE,
                    border: '1px solid rgba(255,255,255,0.06)',
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ width: 64, height: 64, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#111114' }}>
                    {l.cover_image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.cover_image_url} alt={l.headline} className="w-full h-full" style={{ objectFit: 'cover' }} />
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 11, color: '#71717a', marginBottom: 4, fontWeight: 600 }}>{l.date.replaceAll('-', '.')}</p>
                    <p
                      style={{
                        color: '#f4f4f5',
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
          </>
        )}
      </main>
    </div>
  );
}
