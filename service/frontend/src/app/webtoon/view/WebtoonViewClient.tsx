'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { fetchWebtoonBySlug, type CmsWebtoon } from '@/shared/lib/cmsPostsApi';

/**
 * 쿼리 파라미터(`?id=`)로 웹툰 상세를 여는 정적 라우트의 클라이언트 본체.
 * /letters/view 와 동일 패턴 — LetterViewClient.tsx 참조.
 * 세로 스크롤 하나로 컷을 이어 보여주는 게 전부라 레터 상세보다 훨씬 단순하다.
 */
export function WebtoonViewClient() {
  const id = useSearchParams().get('id') ?? '';
  const [webtoon, setWebtoon] = useState<CmsWebtoon | null | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchWebtoonBySlug(id).then((w) => {
      if (!cancelled) setWebtoon(w);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id || webtoon === null) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-[680px] px-5 py-20 text-center text-neutral-500">
          <p>웹툰을 찾을 수 없어요.</p>
          <Link
            href="/webtoon"
            className="mt-4 inline-block text-sm underline underline-offset-4 hover:text-neutral-900"
          >
            웹툰 목록으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f4' }}>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #eee',
        }}
      >
        <Link
          href="/webtoon"
          aria-label="웹툰 목록으로"
          style={{ fontSize: 18, color: '#374151', textDecoration: 'none', lineHeight: 1 }}
        >
          ←
        </Link>
        <p style={{ fontSize: 13.5, fontWeight: 700, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {webtoon ? webtoon.title : ''}
        </p>
      </div>

      {webtoon === undefined && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 640, margin: '0 auto' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ aspectRatio: '3 / 4', background: '#e5e7eb' }} />
          ))}
        </div>
      )}

      {webtoon && (
        <div style={{ maxWidth: 640, margin: '0 auto', paddingBottom: 60 }}>
          <div style={{ padding: '24px 20px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>{webtoon.date}</p>
            <h1
              style={{
                fontFamily: '"Noto Serif KR", serif',
                fontSize: 'clamp(20px, 4.5vw, 26px)',
                fontWeight: 700,
                color: '#111827',
                marginBottom: 6,
                letterSpacing: '-0.01em',
              }}
            >
              {webtoon.title}
            </h1>
            {webtoon.excerpt && (
              <p style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.6 }}>{webtoon.excerpt}</p>
            )}
          </div>

          {webtoon.panels.length === 0 && (
            <p style={{ fontSize: 14, color: '#9ca3af', padding: '40px 20px', textAlign: 'center' }}>
              아직 컷이 준비되지 않았어요.
            </p>
          )}

          {/* 컷을 위에서 아래로 쭉 이어붙인다 — 세로 스크롤 하나로 읽는 웹툰 UX. */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {webtoon.panels.map((p, i) => (
              <div key={i} style={{ background: '#fff' }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- 외부(S3) 원본, 컷마다 비율이 달라 next/image 불가 */}
                <img src={p.url} alt={`${webtoon.title} 컷 ${i + 1}`} style={{ display: 'block', width: '100%', height: 'auto' }} />
                {p.caption && (
                  <p
                    style={{
                      margin: 0,
                      padding: '14px 22px',
                      fontSize: 14,
                      lineHeight: 1.7,
                      color: '#374151',
                      textAlign: 'center',
                      background: '#fafaf9',
                      borderTop: '1px solid #f0f0ef',
                      borderBottom: '1px solid #f0f0ef',
                    }}
                  >
                    {p.caption}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div style={{ padding: '32px 20px 0', textAlign: 'center' }}>
            <Link
              href="/webtoon"
              style={{ fontSize: 13, fontWeight: 600, color: '#111827', textDecoration: 'none' }}
            >
              다른 편 보러가기 →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
